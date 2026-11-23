"""
Documentos de la proforma en Word y Excel — RF-07.

Formato de la proforma de HEXtructure (CT519 y CT521A): logo, recuadros
del oferente y del cliente, franja con potencia, paneles, plazo y
garantía, materiales con los códigos y descripciones de HEXtructure en el
orden de esa proforma, resumen, notas con la distribución de bloques,
pagos sin IVA, vigencia, figura de los elementos y firma. Los datos del
oferente salen de `settings`, nunca hardcodeados en `documentos.py`.
El Excel es editable: subtotales y totales son fórmulas.

Dos niveles: el servicio (`app.services.documentos`) genera los bytes a
partir de una `Cotizacion` ya armada, y la API los expone como descarga
con el mismo permiso que el detalle del historial (RF-10).
"""

import io
from datetime import datetime, timezone
from decimal import Decimal
from itertools import count
from urllib.parse import quote

import pytest
from docx import Document
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.core.permisos import Permiso
from app.models.cotizacion import Cotizacion, ItemCotizacion, MaterialCotizado, TramoPagoCotizacion
from app.models.material import Material
from app.services import documentos
from app.services.cotizacion import CODIGO_LOGISTICA
from app.services.documentos import (
    DESCRIPCIONES_PROFORMA,
    _moneda,
    _numero,
    _pluralizar,
    _porcentaje,
    settings,
)
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, h  # noqa: F401

HOY = datetime(2026, 10, 26, 15, 0, tzinfo=timezone.utc)
_secuencia = count(1)

CAMPOS_OFERENTE = [
    "HEXTRUCTURE_RAZON_SOCIAL",
    "HEXTRUCTURE_ACTIVIDAD",
    "HEXTRUCTURE_RUC",
    "HEXTRUCTURE_TELEFONO",
    "HEXTRUCTURE_CORREO",
    "HEXTRUCTURE_DIRECCION",
    "HEXTRUCTURE_REPRESENTANTE",
    "HEXTRUCTURE_CARGO_REPRESENTANTE",
    "HEXTRUCTURE_BANCO",
    "HEXTRUCTURE_BANCO_TIPO_CUENTA",
    "HEXTRUCTURE_BANCO_NUMERO_CUENTA",
    "HEXTRUCTURE_BANCO_TITULAR",
]


@pytest.fixture
def datos_oferente(monkeypatch):
    """
    Datos de prueba, con la misma forma que los reales (ver `.env`, nunca
    en el código: el repositorio es público) — alcanza para probar que
    cada campo aparece donde debe.
    """
    valores = {
        "HEXTRUCTURE_RAZON_SOCIAL": "Empresa de prueba S.A.S.",
        "HEXTRUCTURE_ACTIVIDAD": "Actividad de prueba",
        "HEXTRUCTURE_RUC": "0000000000001",
        "HEXTRUCTURE_TELEFONO": "+593 900000000",
        "HEXTRUCTURE_CORREO": "prueba@example.com",
        "HEXTRUCTURE_DIRECCION": "Dirección de prueba, Ciudad",
        "HEXTRUCTURE_REPRESENTANTE": "Representante de Prueba",
        "HEXTRUCTURE_CARGO_REPRESENTANTE": "Representante legal",
        "HEXTRUCTURE_BANCO": "Banco de Prueba",
        "HEXTRUCTURE_BANCO_TIPO_CUENTA": "Cuenta Corriente",
        "HEXTRUCTURE_BANCO_NUMERO_CUENTA": "0000000000",
        "HEXTRUCTURE_BANCO_TITULAR": "Empresa de prueba S.A.S.",
    }
    for campo, valor in valores.items():
        monkeypatch.setattr(settings, campo, valor)
    return valores


@pytest.fixture
def sin_datos_oferente(monkeypatch):
    """Nada configurado todavía (como en CI): el documento debe generarse igual."""
    for campo in CAMPOS_OFERENTE:
        monkeypatch.setattr(settings, campo, "")


def _material_o_existente(db: Session, codigo: str, nombre: str) -> Material:
    """Códigos reales y únicos en la base: si el test ya lo creó, se reusa en vez de duplicar."""
    existente = db.query(Material).filter(Material.codigo == codigo).one_or_none()
    if existente is not None:
        return existente
    material = Material(codigo=codigo, nombre=nombre, unidad="u")
    db.add(material)
    db.flush()
    return material


def _cotizacion_con_materiales(db: Session, **campos) -> Cotizacion:
    """
    Dos materiales que SÍ están en el orden de la proforma real
    (VAR1650 antes que HEX_V18MM) para probar el orden sin depender de
    sufijos únicos — por eso, a diferencia de otras fábricas de prueba,
    usa los códigos reales tal cual. Una base de pruebas por test
    (transacción revertida) hace que no choquen entre sí.
    """
    usuario = crear_usuario(db)
    hex_v18mm = _material_o_existente(db, "HEX_V18MM", "Perfil HEX 18mm")
    var1650 = _material_o_existente(db, "VAR1650", "Varilla 1650")

    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_nombre=campos.pop("cliente_nombre", "SolarAndes Instalaciones"),
        cliente_email=campos.pop("cliente_email", "proyectos@solarandes.ec"),
        cliente_telefono=campos.pop("cliente_telefono", "099 123 4567"),
        proyecto_nombre=campos.pop("proyecto_nombre", "Planta El Carmen"),
        numero_proforma=campos.pop("numero_proforma", "CT-130-2026"),
        potencia_kwp=campos.pop("potencia_kwp", Decimal("45.20")),
        subtotal=Decimal("440.00"),
        iva_porcentaje=Decimal("15.00"),
        iva_monto=Decimal("66.00"),
        total=Decimal("506.00"),
        plazo_dias=campos.pop("plazo_dias", settings.PROFORMA_PLAZO_DIAS),
        validez_dias=campos.pop("validez_dias", settings.PROFORMA_VALIDEZ_DIAS),
        garantia_anios=campos.pop("garantia_anios", settings.PROFORMA_GARANTIA_ANIOS),
        pagos=campos.pop(
            "pagos",
            [
                TramoPagoCotizacion(orden=0, nombre="Anticipo", porcentaje=settings.PROFORMA_PAGO_ANTICIPO_PCT),
                TramoPagoCotizacion(orden=1, nombre="Entrega", porcentaje=settings.PROFORMA_PAGO_ENTREGA_PCT),
                TramoPagoCotizacion(
                    orden=2, nombre="A 60 días de la entrega", porcentaje=settings.PROFORMA_PAGO_60_DIAS_PCT
                ),
            ],
        ),
        precio_wp=campos.pop("precio_wp", None),
        created_at=HOY,
        items=[ItemCotizacion(paneles_largo=4, paneles_ancho=28, bloques=12)],
        materiales=[
            # A propósito en orden "equivocado": HEX_V18MM antes que
            # VAR1650, para probar que el documento los reordena.
            MaterialCotizado(material=hex_v18mm, cantidad=400, precio_unitario=Decimal("0.35")),
            MaterialCotizado(material=var1650, cantidad=120, precio_unitario=Decimal("2.50")),
        ],
        **campos,
    )
    db.add(cotizacion)
    db.flush()
    db.refresh(cotizacion)
    return cotizacion


# ─── _moneda: formato de Ecuador ──────────────────────────────────────


@pytest.mark.parametrize(
    "valor,esperado",
    [
        (Decimal("506.00"), "$ 506,00"),
        (Decimal("5025.60"), "$ 5.025,60"),
        (Decimal("1234567.89"), "$ 1.234.567,89"),
        (Decimal("0"), "$ 0,00"),
        (None, "—"),
    ],
)
def test_moneda_formato_ecuador(valor, esperado) -> None:
    assert _moneda(valor) == esperado


@pytest.mark.parametrize(
    "valor,esperado",
    [(Decimal("445.44"), "445,44"), (Decimal("5025.60"), "5.025,60"), (Decimal("3"), "3,00")],
)
def test_numero_formato_ecuador_sin_signo_de_dolar(valor, esperado) -> None:
    assert _numero(valor) == esperado


@pytest.mark.parametrize(
    "valor,esperado",
    [
        # Mismo formato para todos: ni el addendum/IVA en dos decimales fijos
        # ("5.00%") ni los pagos sin ninguno ("30%") — antes convivían los dos.
        (Decimal("5.00"), "5%"),
        (Decimal("30"), "30%"),
        (Decimal("15.00"), "15%"),
        (Decimal("5.50"), "5,5%"),
        (Decimal("5.05"), "5,05%"),
        (None, "—"),
    ],
)
def test_porcentaje_un_solo_formato_sin_decimales_de_mas(valor, esperado) -> None:
    assert _porcentaje(valor) == esperado


@pytest.mark.parametrize("cantidad,esperado", [(1, "1 año"), (0, "0 años"), (2, "2 años")])
def test_pluralizar_segun_la_cantidad(cantidad, esperado) -> None:
    assert _pluralizar(cantidad, "año", "años") == esperado


# ─── Orden de materiales (no alfabético) ──────────────────────────────


def test_materiales_en_el_orden_de_la_proforma_real(db: Session) -> None:
    """VAR1650 antes que HEX_V18MM, aunque se guarden al revés y H < V alfabéticamente."""
    cotizacion = _cotizacion_con_materiales(db)

    ordenados = documentos._materiales_en_orden(cotizacion)

    assert [m.material.codigo for m in ordenados] == ["VAR1650", "HEX_V18MM"]


def test_material_fuera_del_orden_conocido_cae_al_final(db: Session) -> None:
    usuario = crear_usuario(db)
    desconocido = Material(codigo="ZZZ_NUEVO", nombre="Material nuevo", unidad="u")
    var1650 = Material(codigo="VAR1650", nombre="Varilla 1650", unidad="u")
    db.add_all([desconocido, var1650])
    db.flush()
    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_nombre="Cliente",
        subtotal=Decimal("1"),
        iva_monto=Decimal("0"),
        total=Decimal("1"),
        materiales=[
            MaterialCotizado(material=desconocido, cantidad=1, precio_unitario=Decimal("1")),
            MaterialCotizado(material=var1650, cantidad=1, precio_unitario=Decimal("1")),
        ],
    )
    db.add(cotizacion)
    db.flush()

    ordenados = documentos._materiales_en_orden(cotizacion)

    assert [m.material.codigo for m in ordenados] == ["VAR1650", "ZZZ_NUEVO"]


# ─── Formato de HEXtructure: códigos, descripciones y unidades ────────


def test_codigos_y_descripciones_de_la_proforma_de_hextructure() -> None:
    """En el documento salen VARL1/VARL2/HEX1_B, como en CT519, no los códigos internos."""
    var1650 = MaterialCotizado(material=Material(codigo="VAR1650", nombre="Varilla 1650"), cantidad=1)
    nuevo = MaterialCotizado(material=Material(codigo="ZZZ_NUEVO", nombre="Material nuevo"), cantidad=1)
    logistica = MaterialCotizado(material=Material(codigo=CODIGO_LOGISTICA, nombre="Logística"), cantidad=1)

    assert documentos._codigo(var1650) == "VARL1"
    assert documentos._descripcion(var1650) == DESCRIPCIONES_PROFORMA["VAR1650"]
    assert documentos._unidad(var1650) == "u"
    # Un material que la tabla no conoce sale con su código y su nombre en mayúsculas
    assert documentos._codigo(nuevo) == "ZZZ_NUEVO"
    assert documentos._descripcion(nuevo) == "MATERIAL NUEVO"
    assert documentos._unidad(logistica) == "U"


# ─── Servicio: generar_word ────────────────────────────────────────────


def _texto_word(documento) -> str:
    """Párrafos, celdas de las tablas y pie de página: el formato nuevo pone casi todo en tablas."""
    partes = [p.text for p in documento.paragraphs]
    partes += [c.text for tabla in documento.tables for fila in tabla.rows for c in fila.cells]
    partes += [p.text for p in documento.sections[0].footer.paragraphs]
    return "\n".join(partes)


def _filas_word(documento) -> list[list[str]]:
    return [[c.text for c in fila.cells] for tabla in documento.tables for fila in tabla.rows]


def test_word_encabezado_recuadros_concepto_y_franja(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db, total_paneles=80)

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))
    texto = _texto_word(documento)

    assert "PROFORMA" in texto
    assert "No. CT-130-2026" in texto
    assert "26 de octubre de 2026" in texto
    assert "DATOS DEL OFERENTE" in texto and "CLIENTE / DIRECCIÓN" in texto
    assert "Empresa de prueba S.A.S." in texto
    assert "RUC: 0000000000001" in texto
    assert "Teléfono: +593 900000000" in texto and "Correo: prueba@example.com" in texto
    assert "SolarAndes Instalaciones" in texto and "Proyecto: Planta El Carmen" in texto
    assert "ESTRUCTURA DE SOPORTE REUSABLE PARA LA INSTALACIÓN EN PISO DE MÓDULOS FOTOVOLTAICOS" in texto
    # 45,20 kWp ÷ 80 paneles = 565 Wp cada uno
    assert "PANEL: 565 Wp" in texto
    assert ["POTENCIA", "N. PANELES", "PLAZO", "GARANTÍA"] in _filas_word(documento)
    assert ["45,20 KWp", "80 u", "20 días", "10 años"] in _filas_word(documento)
    assert "Dirección de prueba, Ciudad" in texto and "Producto fabricado en Ecuador" in texto


def test_word_materiales_en_orden_con_codigos_y_descripciones(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    filas = _filas_word(Document(io.BytesIO(documentos.generar_word(cotizacion))))

    assert ["Código", "Cantidad", "Uni", "Descripción", "P. Unit.", "Total"] in filas
    indice_var = next(i for i, f in enumerate(filas) if f and f[0] == "VARL1")
    indice_hex = next(i for i, f in enumerate(filas) if f and f[0] == "HEX1_B")
    assert indice_var < indice_hex, "VARL1 debe listarse antes que HEX1_B, como en la proforma real"
    assert ["VARL1", "120,00", "u", DESCRIPCIONES_PROFORMA["VAR1650"], "$ 2,50", "$ 300,00"] in filas
    assert ["HEX1_B", "400,00", "u", DESCRIPCIONES_PROFORMA["HEX_V18MM"], "$ 0,35", "$ 140,00"] in filas


def test_word_resumen_notas_pagos_y_vigencia(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db, precio_wp=Decimal("0.0380"))

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))
    texto = _texto_word(documento)
    filas = _filas_word(documento)

    assert "SUBTOTAL: $ 440,00" in texto
    assert "IVA 15%: $ 66,00" in texto
    assert "TOTAL: $ 506,00" in texto
    assert "PRECIO: $ 0,0380 USD/Wp" in texto

    # Notas de la configuración, con la distribución de bloques debajo de la primera
    assert "Las cantidades se calcularon en base al diseño de bloques configurados por el cliente." in texto
    assert "- Distribución: L=4 PANELES; A=28 PANELES; 12 BLOQUES." in texto
    assert "Las estructuras se entregarán en bodegas de HEXtructure S.A.S. – Ibarra." in texto

    assert "FORMA DE PAGO: [30%] ANTICIPO - [40%] ENTREGA - [30%] A 60 DÍAS DE LA ENTREGA" in texto
    # Sobre el subtotal (sin IVA), no el total: "FORMA DE PAGO Y VALORES SIN IVA"
    assert ["Porcentaje", "Etapa", "Valor"] in filas
    assert ["30%", "Anticipo", "$ 132,00"] in filas
    assert ["40%", "Entrega", "$ 176,00"] in filas
    assert ["30%", "A 60 días de la entrega", "$ 132,00"] in filas
    assert ["Total", "Total sin I.V.A.", "$ 440,00"] in filas

    assert "VIGENCIA DE LA OFERTA: 90 DÍAS." in texto
    assert "Banco: Banco de Prueba" in texto
    assert "Número de cuenta: 0000000000" in texto
    assert "Representante de Prueba" in texto and "REPRESENTANTE LEGAL" in texto


def test_word_figura_de_elementos_y_distribucion(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))

    # El logo y la figura referencial
    assert len(documento.inline_shapes) == 2
    assert "FIG. REFERENCIAL ELEMENTOS" in _texto_word(documento)
    assert "L=4 ; A=28 : 12 BLOQUES" in _texto_word(documento)


def test_word_vigencia_con_la_nota_configurada(db: Session, datos_oferente, monkeypatch) -> None:
    monkeypatch.setattr(settings, "PROFORMA_NOTA_VIGENCIA", "Precios sujetos al costo del acero")
    cotizacion = _cotizacion_con_materiales(db)

    texto = _texto_word(Document(io.BytesIO(documentos.generar_word(cotizacion))))

    assert "VIGENCIA DE LA OFERTA: 90 DÍAS - Precios sujetos al costo del acero" in texto


def test_word_sin_tramos_propios_usa_los_de_la_configuracion(db: Session, datos_oferente) -> None:
    """Una cotización de antes de SQ-213 no tiene tramos_pago_cotizacion: la tabla no debe salir vacía."""
    cotizacion = _cotizacion_con_materiales(db, pagos=[])

    filas = _filas_word(Document(io.BytesIO(documentos.generar_word(cotizacion))))

    assert ["30%", "Anticipo", "$ 132,00"] in filas
    assert ["40%", "Entrega", "$ 176,00"] in filas
    assert ["30%", "A 60 días de la entrega", "$ 132,00"] in filas
    assert ["Total", "Total sin I.V.A.", "$ 440,00"] in filas


def test_word_sin_datos_del_oferente_no_falla_y_omite_las_secciones(db: Session, sin_datos_oferente) -> None:
    """Como en CI: nada configurado todavía. El documento se genera igual, sin esas líneas."""
    cotizacion = _cotizacion_con_materiales(db)

    texto = _texto_word(Document(io.BytesIO(documentos.generar_word(cotizacion))))

    assert "RUC:" not in texto
    assert "Banco" not in texto
    # Sin representante, tampoco hay firma
    assert "Atentamente" not in texto
    assert "No. CT-130-2026" in texto
    assert "TOTAL: $ 506,00" in texto


def test_word_sin_proforma_ni_datos_opcionales_del_cliente_no_falla(db: Session, sin_datos_oferente) -> None:
    """Una cotización al vuelo: sin número de proforma, correo ni teléfono."""
    cotizacion = _cotizacion_con_materiales(
        db, numero_proforma=None, cliente_email=None, cliente_telefono=None, proyecto_nombre=None
    )

    texto = _texto_word(Document(io.BytesIO(documentos.generar_word(cotizacion))))

    assert "Proforma (borrador)" in texto
    assert "Proyecto:" not in texto


def test_word_sin_potencia_ni_paneles_deja_la_franja_con_guion(db: Session, sin_datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db, potencia_kwp=None)

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))

    assert ["—", "—", "20 días", "10 años"] in _filas_word(documento)
    assert "PANEL:" not in _texto_word(documento)


# ─── Servicio: generar_excel (editable, con fórmulas) ─────────────────


def _fila_con_etiqueta(hoja, etiqueta: str, columna: str) -> int:
    for celda in hoja[columna]:
        if celda.value == etiqueta:
            return celda.row
    raise AssertionError(f"No se encontró la etiqueta {etiqueta!r} en la columna {columna}")


def test_excel_subtotales_y_totales_son_formulas(db: Session, datos_oferente) -> None:
    """Si Santiago cambia una cantidad, todo lo demás debe recalcularse solo."""
    cotizacion = _cotizacion_con_materiales(db)

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion)), data_only=False).active

    # Cada material: cantidad × precio, no el valor ya calculado
    fila_var = _fila_con_etiqueta(hoja, "VARL1", "A")
    fila_hex = _fila_con_etiqueta(hoja, "HEX1_B", "A")
    assert fila_var < fila_hex
    assert hoja[f"F{fila_var}"].value == f"=B{fila_var}*E{fila_var}"
    assert hoja[f"F{fila_hex}"].value == f"=B{fila_hex}*E{fila_hex}"

    fila_subtotal = _fila_con_etiqueta(hoja, "SUBTOTAL", "E")
    assert hoja[f"F{fila_subtotal}"].value == f"=SUM(F{fila_var}:F{fila_hex})"

    fila_iva = _fila_con_etiqueta(hoja, "IVA 15%", "E")
    assert hoja[f"F{fila_iva}"].value == f"=F{fila_subtotal}*15.00/100"

    fila_total = _fila_con_etiqueta(hoja, "TOTAL", "E")
    assert hoja[f"F{fila_total}"].value == f"=F{fila_subtotal}+F{fila_iva}"

    # Sobre el subtotal (sin IVA), no el total
    for etapa, pct in [("Anticipo", "30.00"), ("Entrega", "40.00"), ("A 60 días de la entrega", "30.00")]:
        fila_pago = _fila_con_etiqueta(hoja, etapa, "B")
        assert hoja[f"C{fila_pago}"].value == f"=F{fila_subtotal}*{pct}/100", etapa


def test_excel_precio_por_wp_es_formula_sobre_el_subtotal(db: Session, datos_oferente) -> None:
    """Si Santiago cambia una cantidad, el precio por Wp debe cambiar con ella."""
    cotizacion = _cotizacion_con_materiales(db, precio_wp=Decimal("0.0380"))

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion)), data_only=False).active

    fila_precio = _fila_con_etiqueta(hoja, "PRECIO USD/Wp:", "E")
    fila_subtotal = _fila_con_etiqueta(hoja, "SUBTOTAL", "E")
    # potencia_kwp = 45.20 (valor por defecto de la fábrica de prueba) × 1000
    assert hoja[f"F{fila_precio}"].value == f"=F{fila_subtotal}/45200.00"


def test_excel_sin_potencia_no_rompe_el_precio_por_wp(db: Session, datos_oferente) -> None:
    """No debería pasar en la práctica (precio_wp sale de dividir por la potencia), pero no debe romper el documento."""
    cotizacion = _cotizacion_con_materiales(db, precio_wp=Decimal("0.0380"), potencia_kwp=None)

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion))).active
    fila_precio = _fila_con_etiqueta(hoja, "PRECIO USD/Wp:", "E")

    assert hoja[f"F{fila_precio}"].value is None


def test_excel_total_sin_iva_suma_los_tramos_de_pago(db: Session, datos_oferente) -> None:
    """Fila final de la tabla de pagos, como en CT519 y CT521A: suma de los tramos, también en fórmula."""
    cotizacion = _cotizacion_con_materiales(db)

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion)), data_only=False).active

    primera = _fila_con_etiqueta(hoja, "Anticipo", "B")
    ultima = _fila_con_etiqueta(hoja, "A 60 días de la entrega", "B")
    fila_total = _fila_con_etiqueta(hoja, "Total sin I.V.A.", "B")

    assert fila_total == ultima + 1
    assert hoja[f"C{fila_total}"].value == f"=SUM(C{primera}:C{ultima})"


def test_excel_sin_tramos_propios_usa_los_de_la_configuracion(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db, pagos=[])

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion)), data_only=False).active
    fila_subtotal = _fila_con_etiqueta(hoja, "SUBTOTAL", "E")

    # Los valores de la configuración no tienen por qué tener la misma
    # precisión que un tramo guardado: "30" y "30.00" dan el mismo monto.
    for etapa, pct in [
        ("Anticipo", settings.PROFORMA_PAGO_ANTICIPO_PCT),
        ("Entrega", settings.PROFORMA_PAGO_ENTREGA_PCT),
        ("A 60 días de la entrega", settings.PROFORMA_PAGO_60_DIAS_PCT),
    ]:
        fila_pago = _fila_con_etiqueta(hoja, etapa, "B")
        assert hoja[f"C{fila_pago}"].value == f"=F{fila_subtotal}*{pct}/100", etapa


def test_excel_incluye_encabezado_materiales_figura_y_datos_bancarios(db: Session, datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion))).active
    filas = [list(fila) for fila in hoja.iter_rows(values_only=True) if any(v is not None for v in fila)]
    aplanado = [v for fila in filas for v in fila if isinstance(v, str)]

    assert "No. CT-130-2026" in aplanado
    assert "Empresa de prueba S.A.S." in aplanado
    assert "RUC: 0000000000001" in aplanado
    assert ["Código", "Cantidad", "Uni", "Descripción", "P. Unit.", "Total"] in filas
    assert DESCRIPCIONES_PROFORMA["VAR1650"] in aplanado
    assert "Banco" in aplanado and "Banco de Prueba" in aplanado
    assert "Representante de Prueba" in aplanado
    # El logo y la figura referencial
    assert len(hoja._images) == 2


def test_excel_sin_datos_del_oferente_no_falla(db: Session, sin_datos_oferente) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    hoja = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion))).active
    aplanado = [v for fila in hoja.iter_rows(values_only=True) for v in fila if isinstance(v, str)]

    assert not any(v.startswith("RUC:") for v in aplanado)
    assert "Banco" not in aplanado


# ─── nombre_archivo ─────────────────────────────────────────────────────


def test_nombre_archivo_usa_la_proforma_o_el_id_si_es_borrador(db: Session) -> None:
    con_proforma = _cotizacion_con_materiales(db, numero_proforma="CT-130-2026")
    assert documentos.nombre_archivo(con_proforma, "docx") == "Proforma CT-130-2026.docx"

    borrador = _cotizacion_con_materiales(db, numero_proforma=None)
    assert documentos.nombre_archivo(borrador, "xlsx") == f"Proforma cotizacion-{borrador.id}.xlsx"


# ─── API: descarga ───────────────────────────────────────────────────

TIPOS_MEDIO = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@pytest.mark.parametrize("extension", ["docx", "xlsx"])
def test_descarga_responde_el_archivo_con_su_tipo_y_nombre(api, db, h, extension) -> None:  # noqa: F811
    cotizacion = _cotizacion_con_materiales(db)

    r = api.get(f"/api/cotizaciones/{cotizacion.id}/proforma.{extension}", headers=h)

    assert r.status_code == 200
    assert r.headers["content-type"] == TIPOS_MEDIO[extension]
    nombre_codificado = quote(f"Proforma {cotizacion.numero_proforma}.{extension}")
    assert nombre_codificado in r.headers["content-disposition"]
    assert len(r.content) > 0


@pytest.mark.parametrize("extension", ["docx", "xlsx"])
def test_descarga_404_si_no_existe_la_cotizacion(api, h, extension) -> None:  # noqa: F811
    assert api.get(f"/api/cotizaciones/999999/proforma.{extension}", headers=h).status_code == 404


@pytest.mark.parametrize("extension", ["docx", "xlsx"])
def test_descarga_exige_el_mismo_permiso_que_el_detalle(api, db, extension) -> None:  # noqa: F811
    cotizacion = _cotizacion_con_materiales(db)

    con_historial = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.HISTORIAL)))
    assert api.get(f"/api/cotizaciones/{cotizacion.id}/proforma.{extension}", headers=con_historial).status_code == 200

    sin_permiso = _cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))
    assert api.get(f"/api/cotizaciones/{cotizacion.id}/proforma.{extension}", headers=sin_permiso).status_code == 403
