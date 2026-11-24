"""
Documentos de la proforma en Word y Excel — RF-07.

Con el formato de las proformas de HEXtructure (CT519-HEXS-2026 y
CT521A-HEXS-2026, revisión del 23 de noviembre): logo, datos del
oferente y del cliente en recuadros, la franja con potencia, paneles,
plazo y garantía, la tabla de materiales con los códigos y las
descripciones de HEXtructure en el orden de su proforma (no alfabético),
el resumen con el precio por Wp, las notas con la distribución de
bloques, la forma de pago sin IVA, la vigencia, los datos bancarios si
están configurados, la figura referencial de los elementos y la firma.
El logo y la figura están en app/assets/proforma.

Las condiciones (plazo, validez, garantía, forma de pago) son editables
por cotización (SQ-213, acuerdo de la reunión con Santi): lo que no se
edita al confirmar usa el valor de `settings`, igual que antes. La
forma de pago es una lista de tramos (nombre y porcentaje) sobre el
subtotal — las proformas dicen "FORMA DE PAGO Y VALORES SIN IVA". El
precio por Wp se calcula (subtotal ÷ potencia en Wp), no se edita.

El Word es un documento fijo. El Excel es editable: los subtotales por
material, el subtotal general, el IVA, el total, el precio por Wp y la
tabla de pagos (con su fila "Total sin IVA") son fórmulas, no valores —
si Santiago cambia una cantidad, todo lo demás se recalcula solo.

Una cotización de antes de las condiciones editables (SQ-213) no tiene
tramos de pago propios: el Word y el Excel usan los de la configuración,
igual que al confirmarla, en vez de mostrar la tabla de pagos vacía.

El dinero se maneja en `Decimal` y se imprime con el formato de Ecuador
($ 5.025,60), el mismo de la proforma real — distinto a como se ve en la
interfaz, a propósito (ver `utils/dinero.ts` en el frontend).
"""

import io
from decimal import Decimal
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.drawing.image import Image as ExcelImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from app.core.config import settings
from app.core.fechas import ZONA_ECUADOR
from app.models.cotizacion import Cotizacion, MaterialCotizado
from app.services.cotizacion import CODIGO_LOGISTICA, tramos_pago_por_defecto

# Orden de la proforma real (CT-129-2025), no alfabético. Un material que
# no esté aquí (fuera del catálogo de las fórmulas f(L,A,B) y de LOG) cae
# al final, ordenado por código, para no romper si el catálogo crece.
ORDEN_MATERIALES_PROFORMA = (
    "VAR1650",
    "VAR1350",
    "HEX_V18MM",
    "SOP_A",
    "SOP_V",
    "SOP_V_E",
    "ANT_B",
    "ANT_VAR",
    "CLAMP_F",
    "CLAMP_I",
    CODIGO_LOGISTICA,
)


def _orden_material(material: MaterialCotizado) -> tuple[int, str]:
    codigo = material.material.codigo
    try:
        return (ORDEN_MATERIALES_PROFORMA.index(codigo), "")
    except ValueError:
        return (len(ORDEN_MATERIALES_PROFORMA), codigo)


def _materiales_en_orden(cotizacion: Cotizacion) -> list[MaterialCotizado]:
    return sorted(cotizacion.materiales, key=_orden_material)


def _numero(valor: Decimal) -> str:
    """Formato de Ecuador: punto de millares, coma decimal — "5.025,60"."""
    valor = valor.quantize(Decimal("0.01"))
    negativo = valor < 0
    entero, _, decimales = f"{abs(valor):.2f}".partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    signo = "-" if negativo else ""
    return f"{signo}{'.'.join(grupos)},{decimales}"


def _moneda(valor: Decimal | None) -> str:
    """Formato de Ecuador con signo de dólar — "$ 5.025,60"."""
    return "—" if valor is None else f"$ {_numero(valor)}"


def _porcentaje(valor: Decimal | None) -> str:
    """
    Mismo formato para todos los porcentajes del documento (antes el
    addendum y el IVA mostraban dos decimales fijos — "5.00%" — y la
    forma de pago ninguno — "30%"): sin decimales de más, y con coma si
    hace falta ("5%", "30%", "5,5%"), no con punto.
    """
    if valor is None:
        return "—"
    texto = f"{valor:.2f}"
    if texto.endswith("00"):
        texto = texto[:-3]
    else:
        texto = texto.rstrip("0").rstrip(".")
    return f"{texto.replace('.', ',')}%"


def _precio_wp(valor: Decimal | None) -> str:
    """
    $/Wp con 4 decimales fijos (ej. "$ 0,0380"): a diferencia de `_moneda`,
    que usa dos, un precio típico como 0,038 USD/Wp redondearía a $0,00.
    """
    if valor is None:
        return "—"
    return f"$ {valor.quantize(Decimal('0.0001')):.4f}".replace(".", ",")


def _pluralizar(cantidad: int, singular: str, plural: str) -> str:
    return f"{cantidad} {singular if cantidad == 1 else plural}"


def _subtotal_material(material: MaterialCotizado) -> Decimal:
    return Decimal(material.cantidad) * material.precio_unitario


def _pagos(cotizacion: Cotizacion) -> list[tuple[str, Decimal, Decimal | None]]:
    """
    (etiqueta, porcentaje, monto) para cada tramo de la forma de pago, con
    los tramos de esta cotización (editables por cotización, SQ-213) sobre
    el **subtotal**, no el total: las proformas dicen "FORMA DE PAGO Y
    VALORES SIN IVA". Una cotización de antes de este campo no tiene
    tramos propios: usa los de la configuración, como al confirmarla.
    """
    subtotal = cotizacion.subtotal
    tramos = (
        [(tramo.nombre, tramo.porcentaje) for tramo in cotizacion.pagos]
        if cotizacion.pagos
        else tramos_pago_por_defecto()
    )
    return [
        (nombre, porcentaje, (subtotal * porcentaje / Decimal("100")) if subtotal is not None else None)
        for nombre, porcentaje in tramos
    ]


def nombre_archivo(cotizacion: Cotizacion, extension: str) -> str:
    base = cotizacion.numero_proforma or f"cotizacion-{cotizacion.id}"
    return f"Proforma {base}.{extension}"

# ─── Formato de la proforma de HEXtructure ─────────────────────────
# Revisión del 23 de noviembre: la proforma debe verse como las que
# emite HEXtructure (CT519-HEXS-2026, CT521A-HEXS-2026): una hoja con el
# logo, los datos del oferente y del cliente en recuadros, una franja con
# potencia, paneles, plazo y garantía, la tabla de materiales con sus
# códigos y descripciones, el resumen con el precio por Wp, las notas con
# la distribución de bloques, la forma de pago sin IVA, la vigencia, la
# figura referencial de los elementos y la firma.

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "proforma"
LOGO = ASSETS / "logo.png"
FIGURA_ELEMENTOS = ASSETS / "figura_elementos.png"

NARANJA = "F57E00"
DURAZNO = "FFF2E7"
GRIS_BORDE = "BFBFBF"
GRIS_TEXTO = "595959"

# Códigos y descripciones de la proforma de HEXtructure. El sistema usa
# sus propios códigos para las fórmulas (VAR1650, VAR1350, HEX_V18MM); en
# el documento salen los de HEXtructure. Un material nuevo sale con su
# código y su nombre en mayúsculas.
CODIGOS_PROFORMA = {"VAR1650": "VARL1", "VAR1350": "VARL2", "HEX_V18MM": "HEX1_B"}
DESCRIPCIONES_PROFORMA = {
    "VAR1650": "VARILLA CORRUGADA CON PUNTA Y CABEZA ROSCADA, D=18mm; L=1650mm; TERM: GALV. CALIENTE.",
    "VAR1350": "VARILLA CORRUGADA CON PUNTA Y CABEZA ROSCADA, D=18mm; L=1350mm; TERM: GALV. CALIENTE.",
    "HEX_V18MM": 'BASE HEXAGONAL, OC=1"; E=2.2 mm; MAT: A36; TERM: GALVANIZADO CALIENTE.',
    "SOP_A": "SOPORTE EN A, ROSCABLE, E=2.2 mm; Ø=7.5°; MAT: A36; TERM: GALVANIZADO CALIENTE.",
    "SOP_V": "SOPORTE EN V, MEDIOS-ROSCABLE, E=2.2 mm; Ø=7.5°; MAT: A36; TERM: GALVANIZADO CALIENTE.",
    "SOP_V_E": "SOPORTE EN V, EXTREMO-ROSCABLE, E=2.2 mm; Ø=7.5°; MAT: A36; TERM: GALV CALIENTE.",
    "ANT_B": 'BASE ANTIFLEXION, OC=3/4"; E=2.2 mm; MAT: A36; TERM: GALVANIZADO CALIENTE.',
    "ANT_VAR": "VARILLA CORRUGADA ANTIFLEXION, D=12 mm; L=1200mm; TERM: GALVANIZADO CALIENTE.",
    "CLAMP_F": "CLAMP FINAL, PERNO, ARANDELA AJUSTE; MAT: ALU6005 ANODIZED.",
    "CLAMP_I": "CLAMP INTERMEDIO, PERNO, ARANDELA AJUSTE; MAT: ALU6005 ANODIZED.",
    CODIGO_LOGISTICA: "LOGÍSTICA INTERNA, EMPACADO.",
}

MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)  # fmt: skip


def _codigo(material: MaterialCotizado) -> str:
    return CODIGOS_PROFORMA.get(material.material.codigo, material.material.codigo)


def _descripcion(material: MaterialCotizado) -> str:
    return DESCRIPCIONES_PROFORMA.get(material.material.codigo, material.material.nombre.upper())


# Abreviaturas de la columna "Uni". Una unidad configurada que no está
# aquí (kg, m, m²...) sale tal cual.
ABREVIATURAS_UNIDAD = {"unidad": "u", "unidades": "u"}


def _unidad(material: MaterialCotizado) -> str:
    unidad = (material.material.unidad or "").strip()
    return ABREVIATURAS_UNIDAD.get(unidad.lower(), unidad)


def _numero_proforma(cotizacion: Cotizacion) -> str:
    return f"No. {cotizacion.numero_proforma}" if cotizacion.numero_proforma else "Proforma (borrador)"


def _fecha_larga(cotizacion: Cotizacion) -> str:
    """"15 de septiembre de 2026", como en la proforma real."""
    fecha = cotizacion.created_at.astimezone(ZONA_ECUADOR)
    return f"{fecha.day} de {MESES[fecha.month - 1]} de {fecha.year}"


def _potencia_panel_wp(cotizacion: Cotizacion) -> int | None:
    """
    Wp de cada panel: potencia total ÷ número de paneles (la cotización no
    guarda el panel). Sin potencia o sin paneles no se puede calcular.
    """
    if cotizacion.potencia_kwp is None or not cotizacion.total_paneles:
        return None
    return round(cotizacion.potencia_kwp * 1000 / cotizacion.total_paneles)


def _linea_forma_de_pago(pagos: list[tuple[str, Decimal, Decimal | None]]) -> str:
    """"[40%] ANTICIPO - [60%] ENTREGA TOTAL"."""
    return " - ".join(f"[{_porcentaje(pct)}] {nombre.upper()}" for nombre, pct, _ in pagos)


def _distribucion(cotizacion: Cotizacion) -> str:
    """"L=10 PANELES; A=28 PANELES; 6 BLOQUES / L=18 PANELES; ..." (notas de CT521A)."""
    return " / ".join(
        f"L={i.paneles_largo} PANELES; A={i.paneles_ancho} PANELES; {_pluralizar(i.bloques, 'BLOQUE', 'BLOQUES')}"
        for i in cotizacion.items
    )


def _notas_proforma(cotizacion: Cotizacion) -> list[str]:
    """Las notas de la configuración, con la distribución de bloques debajo de la primera."""
    notas = list(settings.PROFORMA_NOTAS)
    distribucion = [f"- Distribución: {_distribucion(cotizacion)}."] if cotizacion.items else []
    return [*notas[:1], *distribucion, *notas[1:]]


def _vigencia(cotizacion: Cotizacion) -> str:
    dias = cotizacion.validez_dias if cotizacion.validez_dias is not None else settings.PROFORMA_VALIDEZ_DIAS
    texto = f"VIGENCIA DE LA OFERTA: {_pluralizar(dias, 'DÍA', 'DÍAS')}"
    return f"{texto} - {settings.PROFORMA_NOTA_VIGENCIA}" if settings.PROFORMA_NOTA_VIGENCIA else f"{texto}."


def _franja(cotizacion: Cotizacion) -> list[tuple[str, str]]:
    """Potencia, paneles, plazo y garantía, en ese orden, como la franja de la proforma real."""
    return [
        ("POTENCIA", f"{_numero(cotizacion.potencia_kwp)} KWp" if cotizacion.potencia_kwp is not None else "—"),
        ("N. PANELES", f"{cotizacion.total_paneles:,} u".replace(",", ".") if cotizacion.total_paneles is not None else "—"),
        ("PLAZO", _pluralizar(cotizacion.plazo_dias, "día", "días") if cotizacion.plazo_dias is not None else "—"),
        (
            "GARANTÍA",
            _pluralizar(cotizacion.garantia_anios, "año", "años") if cotizacion.garantia_anios is not None else "—",
        ),
    ]


def _datos_oferente() -> list[tuple[str, str]]:
    """(etiqueta, valor) de los datos configurados; el primero, la razón social, sin etiqueta."""
    datos = [
        ("", settings.HEXTRUCTURE_RAZON_SOCIAL),
        ("RUC", settings.HEXTRUCTURE_RUC),
        ("Teléfono", settings.HEXTRUCTURE_TELEFONO),
        ("Correo", settings.HEXTRUCTURE_CORREO),
    ]
    return [(e, v) for e, v in datos if v]


def _datos_cliente(cotizacion: Cotizacion) -> list[tuple[str, str]]:
    datos = [
        ("", cotizacion.cliente_nombre),
        ("Correo", cotizacion.cliente_email),
        ("Teléfono", cotizacion.cliente_telefono),
        ("Proyecto", cotizacion.proyecto_nombre),
    ]
    return [(e, v) for e, v in datos if v]


def _pie() -> str:
    partes = [settings.HEXTRUCTURE_DIRECCION, settings.HEXTRUCTURE_TELEFONO, "Producto fabricado en Ecuador"]
    return "   ·   ".join(p for p in partes if p)


# ─── Word ───────────────────────────────────────────────────────────


def _sombrear(celda, color: str) -> None:
    propiedades = celda._tc.get_or_add_tcPr()
    sombra = OxmlElement("w:shd")
    sombra.set(qn("w:val"), "clear")
    sombra.set(qn("w:color"), "auto")
    sombra.set(qn("w:fill"), color)
    propiedades.append(sombra)


def _bordes(tabla, color: str | None) -> None:
    """Bordes de toda la tabla: `color` o ninguno."""
    propiedades = tabla._tbl.tblPr
    bordes = OxmlElement("w:tblBorders")
    for lado in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borde = OxmlElement(f"w:{lado}")
        borde.set(qn("w:val"), "single" if color else "nil")
        if color:
            borde.set(qn("w:sz"), "4")
            borde.set(qn("w:color"), color)
        bordes.append(borde)
    propiedades.append(bordes)


def _texto(
    destino,
    texto: str,
    *,
    tamano: float = 9,
    negrita: bool = False,
    cursiva: bool = False,
    color: str | None = None,
    alineacion=None,
):
    """Un párrafo con un solo estilo, en una celda o en el documento."""
    parrafo = destino.add_paragraph()
    parrafo.paragraph_format.space_after = Pt(1)
    parrafo.paragraph_format.space_before = Pt(0)
    if alineacion is not None:
        parrafo.alignment = alineacion
    corrida = parrafo.add_run(texto)
    corrida.font.size = Pt(tamano)
    corrida.font.name = "Arial"
    corrida.bold = negrita
    corrida.italic = cursiva
    if color:
        corrida.font.color.rgb = RGBColor.from_string(color)
    return parrafo


def _anchos_fijos(tabla, anchos) -> None:
    """Word y LibreOffice respetan el ancho de cada columna solo sin autoajuste y con la grilla definida."""
    tabla.autofit = False
    for columna, ancho in zip(tabla.columns, anchos):
        columna.width = ancho


def _celda(celda, texto: str, **estilo) -> None:
    """Reemplaza el párrafo vacío de la celda por el texto con estilo."""
    celda.paragraphs[0]._element.getparent().remove(celda.paragraphs[0]._element)
    _texto(celda, texto, **estilo)


def _titulo_seccion(documento, texto: str) -> None:
    parrafo = _texto(documento, texto, tamano=10, negrita=True, color=NARANJA)
    parrafo.paragraph_format.space_before = Pt(8)


def generar_word(cotizacion: Cotizacion) -> bytes:
    documento = Document()
    seccion = documento.sections[0]
    seccion.page_width, seccion.page_height = Cm(21), Cm(29.7)
    for margen in ("left_margin", "right_margin"):
        setattr(seccion, margen, Cm(1.5))
    seccion.top_margin, seccion.bottom_margin = Cm(1.2), Cm(1.5)

    pagos = _pagos(cotizacion)
    centro, derecha = WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT

    # Encabezado: logo a la izquierda, número y fecha a la derecha
    encabezado = documento.add_table(rows=1, cols=2)
    _bordes(encabezado, None)
    logo, datos = encabezado.rows[0].cells
    logo.paragraphs[0].add_run().add_picture(str(LOGO), width=Cm(6))
    _celda(datos, "PROFORMA", tamano=11, negrita=True, color=NARANJA, alineacion=derecha)
    _texto(datos, _numero_proforma(cotizacion), tamano=14, negrita=True, alineacion=derecha)
    _texto(datos, _fecha_larga(cotizacion), tamano=9, color=GRIS_TEXTO, alineacion=derecha)

    # Recuadros del oferente y del cliente
    recuadros = documento.add_table(rows=1, cols=2)
    _bordes(recuadros, GRIS_BORDE)
    oferente, cliente = recuadros.rows[0].cells
    _celda(oferente, "DATOS DEL OFERENTE", tamano=8, negrita=True, color=NARANJA)
    for etiqueta, valor in _datos_oferente():
        _texto(oferente, f"{etiqueta}: {valor}" if etiqueta else valor, tamano=8.5, negrita=not etiqueta)
    _celda(cliente, "CLIENTE / DIRECCIÓN", tamano=8, negrita=True, color=NARANJA)
    for etiqueta, valor in _datos_cliente(cotizacion):
        _texto(cliente, f"{etiqueta}: {valor}" if etiqueta else valor, tamano=8.5, negrita=not etiqueta)

    # Concepto y panel
    _texto(documento, settings.PROFORMA_CONCEPTO.upper(), tamano=11, negrita=True).paragraph_format.space_before = Pt(8)
    wp = _potencia_panel_wp(cotizacion)
    if wp is not None:
        _texto(documento, f"PANEL: {wp} Wp", tamano=8.5, color=GRIS_TEXTO)

    # Franja: potencia, paneles, plazo, garantía
    franja = documento.add_table(rows=2, cols=4)
    _bordes(franja, None)
    for columna, (etiqueta, valor) in enumerate(_franja(cotizacion)):
        arriba, abajo = franja.rows[0].cells[columna], franja.rows[1].cells[columna]
        _celda(arriba, etiqueta, tamano=7, negrita=True, color=NARANJA)
        _celda(abajo, valor, tamano=9, negrita=True)
        _sombrear(arriba, DURAZNO)
        _sombrear(abajo, DURAZNO)

    if pagos:
        _texto(documento, f"FORMA DE PAGO: {_linea_forma_de_pago(pagos)}", tamano=8, color=GRIS_TEXTO).paragraph_format.space_before = Pt(6)

    # Materiales
    tabla = documento.add_table(rows=1, cols=6)
    _bordes(tabla, "D9D9D9")
    anchos = (Cm(1.7), Cm(1.8), Cm(0.9), Cm(9.4), Cm(1.8), Cm(2.4))
    _anchos_fijos(tabla, anchos)
    for celda, texto, ancho in zip(tabla.rows[0].cells, ["Código", "Cantidad", "Uni", "Descripción", "P. Unit.", "Total"], anchos):
        _celda(celda, texto, tamano=8.5, negrita=True, color="FFFFFF", alineacion=centro)
        _sombrear(celda, NARANJA)
        celda.width = ancho
    for material in _materiales_en_orden(cotizacion):
        fila = tabla.add_row().cells
        valores = [
            (_codigo(material), centro),
            (_numero(Decimal(material.cantidad)), derecha),
            (_unidad(material), centro),
            (_descripcion(material), None),
            (_moneda(material.precio_unitario), derecha),
            (_moneda(_subtotal_material(material)), derecha),
        ]
        for celda, (texto, alineacion), ancho in zip(fila, valores, anchos):
            _celda(celda, texto, tamano=7.5, alineacion=alineacion)
            celda.width = ancho

    # Notas a la izquierda, resumen a la derecha
    abajo = documento.add_table(rows=1, cols=2)
    _bordes(abajo, None)
    notas, resumen = abajo.rows[0].cells
    _celda(notas, "NOTAS", tamano=9, negrita=True, color=NARANJA)
    for nota in _notas_proforma(cotizacion):
        _texto(notas, nota, tamano=7.5, color=GRIS_TEXTO)
    _sombrear(resumen, DURAZNO)
    _celda(resumen, "RESUMEN", tamano=9, negrita=True, color=NARANJA)
    iva = f"IVA {_porcentaje(cotizacion.iva_porcentaje)}" if cotizacion.iva_porcentaje is not None else "IVA"
    for etiqueta, monto in (("SUBTOTAL", cotizacion.subtotal), (iva, cotizacion.iva_monto), ("TOTAL", cotizacion.total)):
        _texto(resumen, f"{etiqueta}: {_moneda(monto)}", tamano=9, negrita=etiqueta == "TOTAL", alineacion=derecha)
    if cotizacion.precio_wp is not None:
        _texto(resumen, f"PRECIO: {_precio_wp(cotizacion.precio_wp)} USD/Wp", tamano=11, negrita=True, alineacion=centro)

    # Forma de pago y valores sin IVA
    _titulo_seccion(documento, "FORMA DE PAGO Y VALORES SIN IVA")
    tabla_pagos = documento.add_table(rows=1, cols=3)
    _bordes(tabla_pagos, None)
    for celda, texto in zip(tabla_pagos.rows[0].cells, ["Porcentaje", "Etapa", "Valor"]):
        _celda(celda, texto, tamano=8, negrita=True, alineacion=centro)
        _sombrear(celda, DURAZNO)
    for etiqueta, pct, monto in pagos:
        fila = tabla_pagos.add_row().cells
        for celda, texto in zip(fila, [_porcentaje(pct), etiqueta, _moneda(monto)]):
            _celda(celda, texto, tamano=8, alineacion=centro)
    if pagos:
        total = tabla_pagos.add_row().cells
        for celda, texto in zip(total, ["Total", "Total sin I.V.A.", _moneda(cotizacion.subtotal)]):
            _celda(celda, texto, tamano=8, negrita=True, alineacion=centro)
            _sombrear(celda, DURAZNO)
    _texto(documento, _vigencia(cotizacion), tamano=9, negrita=True).paragraph_format.space_before = Pt(6)

    if settings.HEXTRUCTURE_BANCO:
        _titulo_seccion(documento, "DATOS BANCARIOS")
        for etiqueta, valor in (
            ("Banco", settings.HEXTRUCTURE_BANCO),
            ("Tipo de cuenta", settings.HEXTRUCTURE_BANCO_TIPO_CUENTA),
            ("Número de cuenta", settings.HEXTRUCTURE_BANCO_NUMERO_CUENTA),
            ("Titular", settings.HEXTRUCTURE_BANCO_TITULAR),
        ):
            if valor:
                _texto(documento, f"{etiqueta}: {valor}", tamano=8.5)

    # Figura referencial y distribución de los bloques
    _titulo_seccion(documento, "FIG. REFERENCIAL ELEMENTOS")
    documento.add_paragraph().add_run().add_picture(str(FIGURA_ELEMENTOS), width=Cm(16))
    for item in cotizacion.items:
        _texto(
            documento,
            f"L={item.paneles_largo} ; A={item.paneles_ancho} : {_pluralizar(item.bloques, 'BLOQUE', 'BLOQUES')}",
            tamano=8,
            negrita=True,
            color=NARANJA,
        )

    if settings.HEXTRUCTURE_REPRESENTANTE:
        _texto(documento, "Atentamente:", tamano=9).paragraph_format.space_before = Pt(14)
        _texto(documento, settings.HEXTRUCTURE_REPRESENTANTE, tamano=9, cursiva=True)
        if settings.HEXTRUCTURE_CARGO_REPRESENTANTE:
            _texto(documento, settings.HEXTRUCTURE_CARGO_REPRESENTANTE.upper(), tamano=9)
        if settings.HEXTRUCTURE_RAZON_SOCIAL:
            _texto(documento, settings.HEXTRUCTURE_RAZON_SOCIAL.upper(), tamano=9, negrita=True)

    pie = seccion.footer.paragraphs[0]
    pie.alignment = centro
    corrida = pie.add_run(_pie())
    corrida.font.size = Pt(8)
    corrida.font.name = "Arial"

    salida = io.BytesIO()
    documento.save(salida)
    return salida.getvalue()


# ─── Excel ──────────────────────────────────────────────────────────

FORMATO_MONEDA_EXCEL = '"$" #,##0.00'
FORMATO_PRECIO_WP_EXCEL = '"$" #,##0.0000'
FORMATO_CANTIDAD_EXCEL = "#,##0.00"

# Columnas de la hoja. La descripción ocupa dos columnas combinadas (D:E):
# así la tabla de materiales tiene el ancho que necesita y, a la vez, los
# recuadros del oferente (A:D) y del cliente (E:G) y las cuatro casillas de
# la franja quedan del mismo ancho, como en el Word.
COLUMNAS = ("A", "B", "C", "D", "E", "F", "G")
ANCHOS = {"A": 12, "B": 14, "C": 8, "D": 25, "E": 30, "F": 13, "G": 15}
RECUADROS = (("A", "D"), ("E", "G"))
CASILLAS_FRANJA = (("A", "B"), ("C", "D"), ("E", "E"), ("F", "G"))


def _fuente(tamano: float = 9, negrita: bool = False, color: str = "000000", cursiva: bool = False) -> Font:
    return Font(name="Arial", size=tamano, bold=negrita, italic=cursiva, color=color)


def _relleno(color: str) -> PatternFill:
    return PatternFill("solid", start_color=color, end_color=color)


def _escribir(hoja, celda: str, valor, *, alineacion: str | None = None, ajustar: bool = False, **fuente):
    hoja[celda] = valor
    hoja[celda].font = _fuente(**fuente)
    if alineacion or ajustar:
        hoja[celda].alignment = Alignment(horizontal=alineacion, vertical="center", wrap_text=ajustar)
    return hoja[celda]


def _rango(desde: str, hasta: str) -> tuple[str, ...]:
    return COLUMNAS[COLUMNAS.index(desde) : COLUMNAS.index(hasta) + 1]


def _recuadro(hoja, desde: str, hasta: str, color: str = GRIS_BORDE) -> None:
    """Borde exterior de un rango, como los recuadros del oferente y del cliente."""
    linea = Side(style="thin", color=color)
    filas = list(hoja[f"{desde}:{hasta}"])
    for i, fila in enumerate(filas):
        for j, celda in enumerate(fila):
            celda.border = Border(
                top=linea if i == 0 else None,
                bottom=linea if i == len(filas) - 1 else None,
                left=linea if j == 0 else None,
                right=linea if j == len(fila) - 1 else None,
            )


def generar_excel(cotizacion: Cotizacion) -> bytes:
    """
    La misma hoja que el Word, pero editable: el total de cada material,
    el subtotal, el IVA, el total, el precio por Wp y la forma de pago
    son fórmulas sobre las cantidades y los precios de las filas.
    """
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Proforma"
    hoja.sheet_view.showGridLines = False
    for columna, ancho in ANCHOS.items():
        hoja.column_dimensions[columna].width = ancho
    hoja.page_setup.paperSize = hoja.PAPERSIZE_A4
    hoja.page_setup.fitToWidth = 1
    hoja.page_setup.fitToHeight = 0
    hoja.sheet_properties.pageSetUpPr.fitToPage = True
    hoja.page_margins.left = hoja.page_margins.right = 0.4
    pagos = _pagos(cotizacion)

    # Encabezado
    for columna in _rango("A", "E"):
        hoja[f"{columna}1"].fill = _relleno(NARANJA)
    hoja.row_dimensions[1].height = 4
    _escribir(hoja, "G2", "PROFORMA", alineacion="right", tamano=11, negrita=True, color=NARANJA)
    _escribir(hoja, "G3", _numero_proforma(cotizacion), alineacion="right", tamano=13, negrita=True)
    _escribir(hoja, "G4", _fecha_larga(cotizacion), alineacion="right", tamano=9, color=GRIS_TEXTO)
    logo = ExcelImage(str(LOGO))
    logo.width, logo.height = 230, 55
    hoja.add_image(logo, "A2")

    # Recuadros del oferente y del cliente, del mismo ancho
    fila = 7
    (desde_oferente, hasta_oferente), (desde_cliente, hasta_cliente) = RECUADROS
    _escribir(hoja, f"{desde_oferente}{fila}", "DATOS DEL OFERENTE", tamano=8, negrita=True, color=NARANJA)
    _escribir(hoja, f"{desde_cliente}{fila}", "CLIENTE / DIRECCIÓN", tamano=8, negrita=True, color=NARANJA)
    oferente, cliente = _datos_oferente(), _datos_cliente(cotizacion)
    for i in range(max(len(oferente), len(cliente), 4)):
        for columna, datos in ((desde_oferente, oferente), (desde_cliente, cliente)):
            if i < len(datos):
                etiqueta, valor = datos[i]
                texto = f"{etiqueta}: {valor}" if etiqueta else valor
                _escribir(hoja, f"{columna}{fila + 1 + i}", texto, tamano=8.5, negrita=not etiqueta)
    ultima = fila + max(len(oferente), len(cliente), 4)
    _recuadro(hoja, f"{desde_oferente}{fila}", f"{hasta_oferente}{ultima}")
    _recuadro(hoja, f"{desde_cliente}{fila}", f"{hasta_cliente}{ultima}")

    # Concepto y panel
    fila = ultima + 2
    _escribir(hoja, f"A{fila}", settings.PROFORMA_CONCEPTO.upper(), tamano=11, negrita=True)
    wp = _potencia_panel_wp(cotizacion)
    if wp is not None:
        fila += 1
        _escribir(hoja, f"A{fila}", f"PANEL: {wp} Wp", tamano=8.5, color=GRIS_TEXTO)

    # Franja: potencia, paneles, plazo y garantía en casillas del mismo ancho
    fila += 2
    for (desde, hasta), (etiqueta, valor) in zip(CASILLAS_FRANJA, _franja(cotizacion)):
        _escribir(hoja, f"{desde}{fila}", etiqueta, tamano=7, negrita=True, color=NARANJA)
        _escribir(hoja, f"{desde}{fila + 1}", valor, tamano=9.5, negrita=True)
        for columna in _rango(desde, hasta):
            hoja[f"{columna}{fila}"].fill = _relleno(DURAZNO)
            hoja[f"{columna}{fila + 1}"].fill = _relleno(DURAZNO)
    fila += 3
    if pagos:
        _escribir(hoja, f"A{fila}", f"FORMA DE PAGO: {_linea_forma_de_pago(pagos)}", tamano=8, color=GRIS_TEXTO)
        fila += 1

    # Materiales: total = cantidad × precio unitario
    fila += 1
    encabezados = (("A", "Código"), ("B", "Cantidad"), ("C", "Uni"), ("D", "Descripción"), ("F", "P. Unit."), ("G", "Total"))
    for columna, texto in encabezados:
        _escribir(hoja, f"{columna}{fila}", texto, alineacion="center", tamano=9, negrita=True, color="FFFFFF")
    for columna in COLUMNAS:
        hoja[f"{columna}{fila}"].fill = _relleno(NARANJA)
    hoja.merge_cells(f"D{fila}:E{fila}")
    linea = Side(style="thin", color="D9D9D9")
    primera_fila_material = fila + 1
    for material in _materiales_en_orden(cotizacion):
        fila += 1
        _escribir(hoja, f"A{fila}", _codigo(material), alineacion="center", tamano=8)
        _escribir(hoja, f"B{fila}", material.cantidad, alineacion="right", tamano=8).number_format = FORMATO_CANTIDAD_EXCEL
        _escribir(hoja, f"C{fila}", _unidad(material), alineacion="center", tamano=8)
        _escribir(hoja, f"D{fila}", _descripcion(material), ajustar=True, tamano=7.5)
        hoja.merge_cells(f"D{fila}:E{fila}")
        _escribir(hoja, f"F{fila}", float(material.precio_unitario), alineacion="right", tamano=8).number_format = FORMATO_MONEDA_EXCEL
        _escribir(hoja, f"G{fila}", f"=B{fila}*F{fila}", alineacion="right", tamano=8).number_format = FORMATO_MONEDA_EXCEL
        for columna in COLUMNAS:
            hoja[f"{columna}{fila}"].border = Border(bottom=linea)
    ultima_fila_material = fila

    # Notas (A:E) y resumen (F:G)
    fila += 2
    _escribir(hoja, f"A{fila}", "NOTAS", tamano=9, negrita=True, color=NARANJA)
    _escribir(hoja, f"F{fila}", "RESUMEN", tamano=9, negrita=True, color=NARANJA)
    notas = _notas_proforma(cotizacion)
    for i, nota in enumerate(notas):
        _escribir(hoja, f"A{fila + 1 + i}", nota, tamano=7.5, color=GRIS_TEXTO)

    fila_subtotal, fila_iva, fila_total, fila_precio = fila + 1, fila + 2, fila + 3, fila + 5
    iva_pct = cotizacion.iva_porcentaje or 0
    resumen = (
        (fila_subtotal, "SUBTOTAL", f"=SUM(G{primera_fila_material}:G{ultima_fila_material})"),
        (
            fila_iva,
            f"IVA {_porcentaje(cotizacion.iva_porcentaje)}" if cotizacion.iva_porcentaje is not None else "IVA",
            f"=G{fila_subtotal}*{iva_pct}/100",
        ),
        (fila_total, "TOTAL", f"=G{fila_subtotal}+G{fila_iva}"),
    )
    for numero_fila, etiqueta, formula in resumen:
        negrita = etiqueta == "TOTAL"
        _escribir(hoja, f"F{numero_fila}", etiqueta, alineacion="right", tamano=9, negrita=negrita)
        celda = _escribir(hoja, f"G{numero_fila}", formula, alineacion="right", tamano=9, negrita=negrita)
        celda.number_format = FORMATO_MONEDA_EXCEL
    if cotizacion.precio_wp is not None:
        _escribir(hoja, f"F{fila_precio}", "PRECIO USD/Wp:", alineacion="right", tamano=10, negrita=True)
        if cotizacion.potencia_kwp:
            # Fórmula sobre el subtotal: si Santiago cambia una cantidad, el precio por Wp cambia con ella
            potencia_wp = cotizacion.potencia_kwp * Decimal(1000)
            precio = _escribir(hoja, f"G{fila_precio}", f"=G{fila_subtotal}/{potencia_wp}", alineacion="right", tamano=10, negrita=True)
            precio.number_format = FORMATO_PRECIO_WP_EXCEL
    for numero_fila in range(fila, fila_precio + 1):
        for columna in ("F", "G"):
            hoja[f"{columna}{numero_fila}"].fill = _relleno(DURAZNO)
    fila = max(fila_precio, fila + len(notas))

    # Forma de pago y valores sin IVA (A:D), con la vigencia al lado (E:G)
    fila += 2
    _escribir(hoja, f"A{fila}", "FORMA DE PAGO Y VALORES SIN IVA", tamano=9, negrita=True, color=NARANJA)
    fila += 1
    for columna, texto in (("A", "Porcentaje"), ("B", "Etapa"), ("D", "Valor")):
        _escribir(hoja, f"{columna}{fila}", texto, alineacion="center", tamano=8, negrita=True)
    for columna in _rango("A", "D"):
        hoja[f"{columna}{fila}"].fill = _relleno(DURAZNO)
    hoja.merge_cells(f"B{fila}:C{fila}")
    _escribir(hoja, f"E{fila}", _vigencia(cotizacion), ajustar=True, tamano=9, negrita=True)
    hoja.merge_cells(f"E{fila}:G{fila}")
    primera_fila_pago = fila + 1
    for etiqueta, pct, _ in pagos:
        fila += 1
        _escribir(hoja, f"A{fila}", _porcentaje(pct), alineacion="center", tamano=8)
        _escribir(hoja, f"B{fila}", etiqueta, alineacion="center", tamano=8)
        hoja.merge_cells(f"B{fila}:C{fila}")
        pago = _escribir(hoja, f"D{fila}", f"=G{fila_subtotal}*{pct}/100", alineacion="center", tamano=8)
        pago.number_format = FORMATO_MONEDA_EXCEL
    if pagos:
        fila += 1
        _escribir(hoja, f"A{fila}", "Total", alineacion="center", tamano=8, negrita=True)
        _escribir(hoja, f"B{fila}", "Total sin I.V.A.", alineacion="center", tamano=8, negrita=True)
        hoja.merge_cells(f"B{fila}:C{fila}")
        formula = f"=SUM(D{primera_fila_pago}:D{fila - 1})"
        total_pagos = _escribir(hoja, f"D{fila}", formula, alineacion="center", tamano=8, negrita=True)
        total_pagos.number_format = FORMATO_MONEDA_EXCEL
        for columna in _rango("A", "D"):
            hoja[f"{columna}{fila}"].fill = _relleno(DURAZNO)

    if settings.HEXTRUCTURE_BANCO:
        fila += 2
        _escribir(hoja, f"A{fila}", "DATOS BANCARIOS", tamano=9, negrita=True, color=NARANJA)
        for etiqueta, valor in (
            ("Banco", settings.HEXTRUCTURE_BANCO),
            ("Tipo de cuenta", settings.HEXTRUCTURE_BANCO_TIPO_CUENTA),
            ("Número de cuenta", settings.HEXTRUCTURE_BANCO_NUMERO_CUENTA),
            ("Titular", settings.HEXTRUCTURE_BANCO_TITULAR),
        ):
            if valor:
                fila += 1
                _escribir(hoja, f"A{fila}", etiqueta, tamano=8.5, negrita=True)
                _escribir(hoja, f"C{fila}", valor, tamano=8.5)

    # Figura referencial y distribución de los bloques
    fila += 2
    _escribir(hoja, f"A{fila}", "FIG. REFERENCIAL ELEMENTOS", tamano=9, negrita=True, color=NARANJA)
    figura = ExcelImage(str(FIGURA_ELEMENTOS))
    figura.width, figura.height = 620, 205
    hoja.add_image(figura, f"A{fila + 1}")
    fila += 12
    for item in cotizacion.items:
        fila += 1
        texto = f"L={item.paneles_largo} ; A={item.paneles_ancho} : {_pluralizar(item.bloques, 'BLOQUE', 'BLOQUES')}"
        _escribir(hoja, f"A{fila}", texto, tamano=8, negrita=True, color=NARANJA)

    if settings.HEXTRUCTURE_REPRESENTANTE:
        fila += 2
        _escribir(hoja, f"A{fila}", "Atentamente:", tamano=9)
        _escribir(hoja, f"A{fila + 1}", settings.HEXTRUCTURE_REPRESENTANTE, tamano=9, cursiva=True)
        fila += 1
        if settings.HEXTRUCTURE_CARGO_REPRESENTANTE:
            fila += 1
            _escribir(hoja, f"A{fila}", settings.HEXTRUCTURE_CARGO_REPRESENTANTE.upper(), tamano=9)
        if settings.HEXTRUCTURE_RAZON_SOCIAL:
            fila += 1
            _escribir(hoja, f"A{fila}", settings.HEXTRUCTURE_RAZON_SOCIAL.upper(), tamano=9, negrita=True)

    fila += 2
    for columna in COLUMNAS:
        hoja[f"{columna}{fila}"].border = Border(top=Side(style="thin", color=NARANJA))
    _escribir(hoja, f"A{fila}", _pie(), tamano=8, color=GRIS_TEXTO)
    hoja.print_area = f"A1:G{fila}"

    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()
