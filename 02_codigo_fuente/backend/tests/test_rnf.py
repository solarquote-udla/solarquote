"""
Requerimientos no funcionales verificables con pruebas automatizadas.

  RNF-03  El layout, incluida la validación eléctrica y la capacidad en
          kWp, se genera en menos de 15 segundos. El documento de la
          proforma (Word o Excel), en menos de 10.
  RNF-04  Las contraseñas se guardan con bcrypt, factor mayor o igual a 10.

Los tiempos se miden en el ambiente de pruebas, con un margen amplio: el
objetivo no es medir el rendimiento exacto, sino detectar si un cambio
lo empeora por órdenes de magnitud. La medición formal con volúmenes
reales se hace en las pruebas de sistema.
Origen: matriz de trazabilidad (03_pruebas/trazabilidad).
"""

import time
from datetime import datetime, timezone
from decimal import Decimal

import bcrypt

from app.core.security import hash_password, verificar_password
from app.models.cliente import Cliente, TipoIdentificacion
from app.models.cotizacion import Cotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.services import documentos
from app.services.calculo_layout import (
    InversorLayout,
    PanelLayout,
    ParametrosLayout,
    asignar_inversores,
    electrica_inversor,
    generar_layout,
)
from tests.fabricas import crear_usuario
from tests.test_varios_inversores import api, equipo, guardar, h, inversor  # noqa: F401

LIMITE_LAYOUT_S = 15

PANEL = PanelLayout(largo_mm=2278, ancho_mm=1134, potencia_wp=580, angulo_montaje=15)

# Terreno en L de 500 × 400 m (16,3 ha) girado 17°, con dos caminos que lo
# cruzan y una zona reservada: mucho más grande que una planta típica de
# HEXtructure, para dejar margen.
TERRENO_GRANDE = [[0, 0], [500, 0], [500, 250], [320, 250], [320, 400], [0, 400]]
CAMINOS_GRANDE = [
    [[0, 198], [500, 198], [500, 204], [0, 204]],
    [[150, 0], [156, 0], [156, 400], [150, 400]],
    [[0, 0], [40, 0], [40, 40], [0, 40]],
]


def test_rnf03_layout_grande_con_validacion_electrica_en_menos_de_15_s():
    inicio = time.perf_counter()
    r = generar_layout(
        TERRENO_GRANDE,
        CAMINOS_GRANDE,
        PANEL,
        ParametrosLayout(capacidad_deseada_kwp=20_000),
        orientacion_norte=17,
        latitud=0.3,
    )
    potencias = [200.0] * 70
    asignacion = asignar_inversores([(b.vertices, b.paneles) for b in r.bloques], potencias)
    por_inversor = [0] * len(potencias)
    for b, i in zip(r.bloques, asignacion):
        por_inversor[i] += b.paneles
    for paneles in por_inversor:
        electrica_inversor(paneles, 52.31, 43.35, InversorLayout(vmax_v=1100, vmin_v=200, mppts=10, strings_por_mppt=2))
    duracion = time.perf_counter() - inicio

    assert r.capacidad is not None and r.capacidad.cabe
    assert r.potencia_kwp >= 20_000
    assert duracion < LIMITE_LAYOUT_S, f"El layout tardó {duracion:.1f} s"


def test_rnf03_generar_por_la_api_en_menos_de_15_s(api, db, h):  # noqa: F811
    """Mismo límite, de punta a punta: lectura, cálculo, guardado de cientos de bloques y respuesta."""
    cliente = Cliente(nombre="Cliente RNF", tipo_identificacion=TipoIdentificacion.RUC, identificacion="1710034065001")
    db.add(cliente)
    db.flush()
    pid = api.post(
        "/api/proyectos",
        headers=h,
        json={"nombre": "Planta grande", "cliente_id": cliente.id, "ubicacion": None, "latitud": 0.3, "longitud": None, "notas": None},
    ).json()["id"]
    caminos = [{"nombre": None, "tipo": "interno", "vertices": c} for c in CAMINOS_GRANDE]
    api.post(f"/api/proyectos/{pid}/terreno", headers=h, json={"vertices": TERRENO_GRANDE, "orientacion_norte": 17, "notas": None, "caminos": caminos})
    guardar(api, h, pid, equipo(*[inversor(250) for _ in range(10)]))

    inicio = time.perf_counter()
    r = api.post(f"/api/proyectos/{pid}/layout", headers=h, json={})
    duracion = time.perf_counter() - inicio

    assert r.status_code == 200, r.text
    assert r.json()["total_paneles"] > 40_000
    assert duracion < LIMITE_LAYOUT_S, f"Generar por la API tardó {duracion:.1f} s"


def test_rnf03_documento_de_cotizacion_en_menos_de_10_s(db):
    """Una proforma con muchos materiales: 80 ítems, Word y Excel juntos."""
    usuario = crear_usuario(db)
    materiales = [Material(codigo=f"MAT-{i:03d}", nombre=f"Material {i}", unidad="u") for i in range(80)]
    db.add_all(materiales)
    db.flush()

    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_nombre="Cliente RNF documento",
        numero_proforma="CT-999-2026",
        subtotal=Decimal("10000.00"),
        addendum_porcentaje=Decimal("5.00"),
        addendum_monto=Decimal("500.00"),
        iva_porcentaje=Decimal("15.00"),
        iva_monto=Decimal("1575.00"),
        total=Decimal("12075.00"),
        created_at=datetime.now(timezone.utc),
        items=[ItemCotizacion(paneles_largo=4, paneles_ancho=3, bloques=10)],
        materiales=[
            MaterialCotizado(material=m, cantidad=100 + i, precio_unitario=Decimal("1.25")) for i, m in enumerate(materiales)
        ],
    )
    db.add(cotizacion)
    db.flush()
    db.refresh(cotizacion)

    inicio = time.perf_counter()
    documentos.generar_word(cotizacion)
    documentos.generar_excel(cotizacion)
    duracion = time.perf_counter() - inicio

    assert duracion < 10, f"Generar los documentos tardó {duracion:.1f} s"


def test_rnf04_bcrypt_con_factor_de_al_menos_10():
    guardado = hash_password("Clave1234")
    assert guardado.startswith("$2b$")
    factor = int(guardado.split("$")[2])
    assert factor >= 10
    assert bcrypt.checkpw(b"Clave1234", guardado.encode())
    # La sal es aleatoria: la misma contraseña no deja el mismo hash
    assert hash_password("Clave1234") != guardado
    assert verificar_password("Clave1234", guardado) and not verificar_password("Clave1235", guardado)
