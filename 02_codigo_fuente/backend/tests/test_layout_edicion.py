"""
Pruebas de la edición manual de bloques — SQ-64.

Dos niveles:
  - Geometría pura (`construir_bloque`, `validar_bloques`), sin base.
  - El servicio completo contra Postgres (fixture `db`): guardar,
    recalcular y rechazar ediciones imposibles.

Terreno de referencia: rectángulo de 100 × 60 m, panel de 2278 × 1134 mm
a 0°, norte hacia arriba. El layout generado tiene 9 franjas con
2 bloques 4×24 y uno 4×1 cada una (ver test_layout.py): 1764 paneles.
"""

import math
from datetime import datetime

import pytest
from shapely.geometry import Polygon
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.proyecto import Proyecto
from app.models.usuario import RolUsuario, Usuario
from app.schemas.equipo import ConfiguracionEquipoGuardar
from app.schemas.layout import BloqueEditar, LayoutEditar, LayoutGenerar
from app.schemas.terreno import TerrenoCrear
from app.services import layout as servicio
from app.services.calculo_layout import (
    EdicionInvalida,
    PanelLayout,
    ParametrosLayout,
    construir_bloque,
    generar_layout,
    validar_bloques,
    vertices_de,
)
from app.services.equipo import guardar_configuracion
from app.services.terreno import actualizar_terreno, crear_terreno

LARGO = 9.112   # 4 × 2,278 m, a 0°
LADO_MENOR = 1.134
TERRENO = [[0, 0], [100, 0], [100, 60], [0, 60]]


# ─── Geometría pura ─────────────────────────────────────────────────


@pytest.mark.parametrize("angulo", [0, 15, 90, 237.5])
def test_construir_bloque_reproduce_los_bloques_generados(angulo):
    """Editar un bloque sin cambiarlo no debe moverlo ni deformarlo."""
    r = generar_layout(
        [[0, 0], [180, 0], [160, 120], [20, 150]],
        [],
        PanelLayout(2278, 1134, 580, 7.5),
        ParametrosLayout(),
        orientacion_norte=angulo,
    )
    largo = 4 * 2.278 * math.cos(math.radians(7.5))
    for b in r.bloques:
        rehecho = construir_bloque(tuple(b.vertices[3]), largo, b.paneles_ancho * r.lado_menor_m, r.angulo_norte)
        for v, w in zip(vertices_de(rehecho), b.vertices):
            assert v == pytest.approx(w, abs=2e-3)


def _bloque(x, y, a=24):
    return construir_bloque((x, y), LARGO, a * LADO_MENOR, 0)


def test_bloques_validos_sin_advertencias():
    assert validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(11.112, 0)], 2.0) == []


def test_bloque_fuera_del_terreno():
    with pytest.raises(EdicionInvalida, match="bloque 2 se sale del terreno"):
        validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(95, 0)], 2.0)


def test_bloque_sobre_un_camino():
    camino = [[0, 30], [100, 30], [100, 34], [0, 34]]
    with pytest.raises(EdicionInvalida, match="bloque 1 queda sobre un camino"):
        validar_bloques(TERRENO, [camino], [_bloque(0, 10)], 2.0)


def test_bloques_superpuestos():
    with pytest.raises(EdicionInvalida, match="bloques 1 y 2 se superponen"):
        validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(5, 0)], 2.0)


@pytest.mark.parametrize(("penetracion", "valido"), [(0.003, True), (0.007, False)])
def test_tolerancia_de_5_mm_entre_bloques(penetracion, valido):
    bloques = [_bloque(0, 0), _bloque(LARGO - penetracion, 0)]
    if valido:
        validar_bloques(TERRENO, [], bloques, 2.0)
    else:
        with pytest.raises(EdicionInvalida, match="se superponen"):
            validar_bloques(TERRENO, [], bloques, 2.0)


@pytest.mark.parametrize(("salida", "valido"), [(0.003, True), (0.007, False)])
def test_tolerancia_de_5_mm_en_el_borde(salida, valido):
    bloques = [_bloque(-salida, 0)]
    if valido:
        validar_bloques(TERRENO, [], bloques, 2.0)
    else:
        with pytest.raises(EdicionInvalida, match="se sale del terreno"):
            validar_bloques(TERRENO, [], bloques, 2.0)


def test_valida_en_el_marco_girado():
    """Con el norte a 30°, un bloque girado dentro del terreno es válido."""
    terreno = [[-200, -200], [200, -200], [200, 200], [-200, 200]]
    bloque = construir_bloque((10, 10), LARGO, 24 * LADO_MENOR, 30)
    assert validar_bloques(terreno, [], [bloque], 2.0, angulo_norte=30) == []
    otro = construir_bloque((10 + 3, 10), LARGO, 24 * LADO_MENOR, 30)
    with pytest.raises(EdicionInvalida, match="se superponen"):
        validar_bloques(terreno, [], [bloque, otro], 2.0, angulo_norte=30)


def test_penetracion_de_exactamente_5_mm_se_rechaza():
    """
    El límite es exclusivo: se toleran menos de 5 mm. Con exactamente
    5,000 mm el bloque achicado toca al otro, y tocar cuenta. El frontend
    aplica la misma regla (comparación con <=), así que coinciden.
    """
    with pytest.raises(EdicionInvalida, match="se superponen"):
        validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(LARGO - 0.005, 0)], 2.0)


def test_bloques_que_se_tocan_no_se_superponen():
    """Lado con lado no es superposición: el área común es cero."""
    advertencias = validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(LARGO, 0)], 2.0)
    assert any("menos de 2 m" in a for a in advertencias)


def test_pasillo_angosto_solo_advierte():
    advertencias = validar_bloques(TERRENO, [], [_bloque(0, 0), _bloque(LARGO + 1, 0)], 2.0)
    assert advertencias == [
        "1 par(es) de bloques quedan a menos de 2 m, el pasillo configurado. "
        "Se puede construir, pero dificulta el mantenimiento."
    ]


# ─── Servicio contra la base ────────────────────────────────────────


@pytest.fixture
def proyecto(db: Session) -> Proyecto:
    marca = datetime.now().timestamp()
    usuario = Usuario(
        nombre="Gerente",
        email=f"gerente-{marca}@example.com",
        password_hash="no-se-usa",
        rol=RolUsuario.GERENTE_GENERAL,
    )
    cliente = Cliente(
        nombre="Cliente",
        tipo_identificacion=TipoIdentificacion.RUC,
        identificacion=str(int(marca * 1000))[-13:].rjust(13, "1"),
    )
    db.add_all([usuario, cliente])
    db.flush()
    p = Proyecto(nombre="Planta", cliente_id=cliente.id, usuario_id=usuario.id)
    db.add(p)
    db.flush()

    crear_terreno(db, p, TerrenoCrear(vertices=TERRENO, orientacion_norte=0))
    guardar_configuracion(
        db,
        p,
        ConfiguracionEquipoGuardar.model_validate(
            {
                "panel": {
                    "marca": "Jinko", "modelo": "JKM580N", "potencia_wp": 580,
                    "largo_mm": 2278, "ancho_mm": 1134, "voc_v": 52.31, "vmp_v": 43.35,
                },
                "angulo_montaje": 0,
                "inversor": {"marca": "X", "modelo": "Y", "potencia_kw": 250, "vmax_v": 1100, "vmin_v": 200},
            }
        ),
    )
    servicio.generar(db, p, LayoutGenerar())
    return p


def _como_edicion(layout, cambiar=None, quitar=()):
    """Los bloques actuales en formato de edición, con cambios opcionales."""
    cambiar = cambiar or {}
    bloques = []
    for i, b in enumerate(layout.bloques):
        if i in quitar:
            continue
        origen, a = cambiar.get(i, (b.vertices[3], b.paneles_ancho))
        bloques.append(BloqueEditar(origen=origen, paneles_ancho=a))
    return LayoutEditar(bloques=bloques)


def test_guardar_sin_cambios_no_cuenta_ediciones(db, proyecto):
    layout = servicio.obtener_layout(db, proyecto.id)
    editado = servicio.editar_bloques(db, proyecto, _como_edicion(layout))
    assert editado.total_paneles == 1764
    assert editado.resumen["ediciones_manuales"] == 0


def test_eliminar_un_bloque_recalcula_todo(db, proyecto):
    layout = servicio.obtener_layout(db, proyecto.id)
    # El bloque 0 es un 4×24 completo (franja 1, abajo)
    assert layout.bloques[0].paneles_ancho == 24
    editado = servicio.editar_bloques(db, proyecto, _como_edicion(layout, quitar=[0]))

    assert editado.total_paneles == 1764 - 96
    assert editado.potencia_kwp == pytest.approx((1764 - 96) * 0.58, abs=0.01)
    assert len(editado.bloques) == 26
    assert editado.resumen["ediciones_manuales"] == 1
    # 1668 / 21 = 79 strings, sobran 9
    assert editado.resumen["electrica"]["strings_totales"] == 79
    respuesta = servicio.a_respuesta(editado, editado.huella)
    assert {(t.paneles_ancho, t.repeticiones) for t in respuesta.tipos} == {(24, 17), (1, 9)}


def test_acortar_un_bloque_cambia_su_tipo(db, proyecto):
    layout = servicio.obtener_layout(db, proyecto.id)
    origen = layout.bloques[0].vertices[3]
    editado = servicio.editar_bloques(db, proyecto, _como_edicion(layout, cambiar={0: (origen, 20)}))

    assert editado.total_paneles == 1764 - 16
    respuesta = servicio.a_respuesta(editado, editado.huella)
    assert (20, 1) in {(t.paneles_ancho, t.repeticiones) for t in respuesta.tipos}
    # Lo que queda del bloque reconstruido mide 20 paneles de alto
    assert Polygon(respuesta.bloques[0].vertices).bounds[3] - origen[1] == pytest.approx(20 * LADO_MENOR, abs=1e-3)


def test_mover_un_bloque_encima_de_otro_se_rechaza_y_no_guarda(db, proyecto):
    layout = servicio.obtener_layout(db, proyecto.id)
    destino = layout.bloques[1].vertices[3]
    with pytest.raises(EdicionInvalida, match="se superponen"):
        servicio.editar_bloques(db, proyecto, _como_edicion(layout, cambiar={0: (destino, 24)}))
    assert servicio.obtener_layout(db, proyecto.id).total_paneles == 1764


def test_no_se_edita_un_layout_desactualizado(db, proyecto):
    from app.models.terreno import Terreno
    from app.schemas.terreno import TerrenoActualizar

    terreno = db.query(Terreno).filter(Terreno.proyecto_id == proyecto.id).one()
    actualizar_terreno(db, terreno, TerrenoActualizar(orientacion_norte=10))
    layout = servicio.obtener_layout(db, proyecto.id)
    with pytest.raises(servicio.LayoutNoEditable, match="Vuelve a generarlo"):
        servicio.editar_bloques(db, proyecto, _como_edicion(layout))


def test_backend_valida_con_el_mismo_largo_que_entrega_la_api(db, proyecto):
    """
    Regresión del desfase que encontró Esteban en la revisión de #27.

    La pantalla arma los bloques con `largo_bloque_m`, redondeado al
    milímetro. Si el backend recalculara el largo a precisión completa,
    los dos rectángulos diferirían hasta 0,5 mm, justo en el borde de la
    tolerancia de 5 mm.

    A 22° el largo exacto es 9,112 × cos 22° = 8,448499 m y la API
    entrega 8,448 m: 0,499 mm de diferencia. Se pone un segundo bloque
    que, con el largo de la API, penetra 4,7 mm (válido en la pantalla).
    Con el largo exacto serían 5,199 mm y el backend lo rechazaría.
    """
    from app.models.equipo import ConfiguracionEquipo

    equipo = db.query(ConfiguracionEquipo).filter_by(proyecto_id=proyecto.id).one()
    # Float, como llega desde el formulario (Pydantic) y desde la base
    equipo.angulo_montaje = 22.0
    db.flush()
    layout = servicio.generar(db, proyecto, LayoutGenerar())
    largo_api = servicio.a_respuesta(layout, layout.huella).largo_bloque_m
    assert largo_api == 8.448

    x, y = layout.bloques[0].vertices[3]
    edicion = LayoutEditar(
        bloques=[
            BloqueEditar(origen=[x, y], paneles_ancho=24),
            # Sin redondear: con el norte girado, las coordenadas locales
            # no caen en milímetros enteros y la penetración puede ser
            # cualquier valor; aquí se fija en 4,7 mm para caer en la banda.
            BloqueEditar(origen=[x + largo_api - 0.0047, y], paneles_ancho=24),
        ]
    )
    editado = servicio.editar_bloques(db, proyecto, edicion)
    assert len(editado.bloques) == 2


def test_regenerar_reinicia_el_contador_de_ediciones(db, proyecto):
    layout = servicio.obtener_layout(db, proyecto.id)
    servicio.editar_bloques(db, proyecto, _como_edicion(layout, quitar=[0, 1]))
    assert servicio.obtener_layout(db, proyecto.id).resumen["ediciones_manuales"] == 2

    regenerado = servicio.generar(db, proyecto, LayoutGenerar())
    assert regenerado.resumen["ediciones_manuales"] == 0
    assert regenerado.total_paneles == 1764
