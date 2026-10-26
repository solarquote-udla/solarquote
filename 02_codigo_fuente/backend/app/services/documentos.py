"""
Documentos de la proforma en Word y Excel — RF-07.

Ambos formatos muestran lo mismo que el detalle de la cotización en la
interfaz (`CotizacionDetalleLeer`): datos del cliente, los ítems L/A/B,
el desglose de materiales con sus cantidades y precios, y los totales
(subtotal, addendum, IVA). Se generan en memoria a partir de la
cotización ya persistida — no se recalcula nada, igual que el detalle.
"""

import io

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

from app.core.fechas import ZONA_ECUADOR
from app.models.cotizacion import Cotizacion

NOMBRE_EMPRESA = "HEXtructure S.A.S."


def _fecha(cotizacion: Cotizacion) -> str:
    return cotizacion.created_at.astimezone(ZONA_ECUADOR).strftime("%d/%m/%Y")


def _subtotal_material(cantidad: int, precio_unitario) -> float:
    return float(cantidad) * float(precio_unitario)


def nombre_archivo(cotizacion: Cotizacion, extension: str) -> str:
    base = cotizacion.numero_proforma or f"cotizacion-{cotizacion.id}"
    return f"Proforma {base}.{extension}"


# ─── Word ───────────────────────────────────────────────────────────


def generar_word(cotizacion: Cotizacion) -> bytes:
    documento = Document()

    titulo = documento.add_heading(NOMBRE_EMPRESA, level=1)
    titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER

    subtitulo = documento.add_paragraph()
    subtitulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    corrida = subtitulo.add_run(
        f"Proforma {cotizacion.numero_proforma}" if cotizacion.numero_proforma else "Proforma (borrador)"
    )
    corrida.bold = True
    corrida.font.size = Pt(14)
    documento.add_paragraph(f"Fecha: {_fecha(cotizacion)}").alignment = WD_ALIGN_PARAGRAPH.CENTER

    documento.add_heading("Cliente", level=2)
    datos_cliente = [("Nombre", cotizacion.cliente_nombre)]
    if cotizacion.cliente_empresa:
        datos_cliente.append(("Empresa", cotizacion.cliente_empresa))
    if cotizacion.cliente_email:
        datos_cliente.append(("Correo", cotizacion.cliente_email))
    if cotizacion.cliente_telefono:
        datos_cliente.append(("Teléfono", cotizacion.cliente_telefono))
    if cotizacion.proyecto_nombre:
        datos_cliente.append(("Proyecto", cotizacion.proyecto_nombre))
    for etiqueta, valor in datos_cliente:
        documento.add_paragraph(f"{etiqueta}: {valor}")

    documento.add_heading("Materiales", level=2)
    tabla = documento.add_table(rows=1, cols=5)
    tabla.style = "Light Grid Accent 1"
    encabezados = ["Código", "Material", "Cantidad", "Precio unitario", "Subtotal"]
    for celda, texto in zip(tabla.rows[0].cells, encabezados):
        celda.text = texto
        for parrafo in celda.paragraphs:
            for corrida in parrafo.runs:
                corrida.bold = True

    for material in sorted(cotizacion.materiales, key=lambda m: m.material.codigo):
        fila = tabla.add_row().cells
        subtotal = _subtotal_material(material.cantidad, material.precio_unitario)
        valores = [
            material.material.codigo,
            f"{material.material.nombre} ({material.material.unidad})",
            str(material.cantidad),
            f"${float(material.precio_unitario):,.2f}",
            f"${subtotal:,.2f}",
        ]
        for celda, texto in zip(fila, valores):
            celda.text = texto

    documento.add_heading("Totales", level=2)
    filas_totales = [
        ("Subtotal", cotizacion.subtotal),
        (f"Addendum ({cotizacion.addendum_porcentaje}%)", cotizacion.addendum_monto),
        (f"IVA ({cotizacion.iva_porcentaje}%)" if cotizacion.iva_porcentaje is not None else "IVA", cotizacion.iva_monto),
        ("Total", cotizacion.total),
    ]
    for etiqueta, monto in filas_totales:
        parrafo = documento.add_paragraph()
        parrafo.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        texto = f"{etiqueta}: ${float(monto):,.2f}" if monto is not None else f"{etiqueta}: —"
        corrida = parrafo.add_run(texto)
        if etiqueta == "Total":
            corrida.bold = True

    salida = io.BytesIO()
    documento.save(salida)
    return salida.getvalue()


# ─── Excel ──────────────────────────────────────────────────────────


def generar_excel(cotizacion: Cotizacion) -> bytes:
    libro = Workbook()
    hoja = libro.active
    hoja.title = "Proforma"

    negrita = Font(bold=True)

    hoja["A1"] = NOMBRE_EMPRESA
    hoja["A1"].font = Font(bold=True, size=14)
    hoja["A2"] = f"Proforma {cotizacion.numero_proforma}" if cotizacion.numero_proforma else "Proforma (borrador)"
    hoja["A2"].font = negrita
    hoja["A3"] = f"Fecha: {_fecha(cotizacion)}"

    fila = 5
    datos_cliente = [("Cliente", cotizacion.cliente_nombre)]
    if cotizacion.cliente_empresa:
        datos_cliente.append(("Empresa", cotizacion.cliente_empresa))
    if cotizacion.cliente_email:
        datos_cliente.append(("Correo", cotizacion.cliente_email))
    if cotizacion.cliente_telefono:
        datos_cliente.append(("Teléfono", cotizacion.cliente_telefono))
    if cotizacion.proyecto_nombre:
        datos_cliente.append(("Proyecto", cotizacion.proyecto_nombre))
    for etiqueta, valor in datos_cliente:
        hoja.cell(row=fila, column=1, value=etiqueta).font = negrita
        hoja.cell(row=fila, column=2, value=valor)
        fila += 1

    fila += 1
    encabezados = ["Código", "Material", "Cantidad", "Precio unitario", "Subtotal"]
    for columna, texto in enumerate(encabezados, start=1):
        celda = hoja.cell(row=fila, column=columna, value=texto)
        celda.font = negrita
    fila += 1

    for material in sorted(cotizacion.materiales, key=lambda m: m.material.codigo):
        subtotal = _subtotal_material(material.cantidad, material.precio_unitario)
        hoja.cell(row=fila, column=1, value=material.material.codigo)
        hoja.cell(row=fila, column=2, value=f"{material.material.nombre} ({material.material.unidad})")
        hoja.cell(row=fila, column=3, value=material.cantidad)
        hoja.cell(row=fila, column=4, value=float(material.precio_unitario)).number_format = "$#,##0.00"
        hoja.cell(row=fila, column=5, value=subtotal).number_format = "$#,##0.00"
        fila += 1

    fila += 1
    filas_totales = [
        ("Subtotal", cotizacion.subtotal),
        (f"Addendum ({cotizacion.addendum_porcentaje}%)", cotizacion.addendum_monto),
        (f"IVA ({cotizacion.iva_porcentaje}%)" if cotizacion.iva_porcentaje is not None else "IVA", cotizacion.iva_monto),
        ("Total", cotizacion.total),
    ]
    for etiqueta, monto in filas_totales:
        celda_etiqueta = hoja.cell(row=fila, column=4, value=etiqueta)
        celda_etiqueta.alignment = Alignment(horizontal="right")
        celda_monto = hoja.cell(row=fila, column=5, value=float(monto) if monto is not None else None)
        celda_monto.number_format = "$#,##0.00"
        if etiqueta == "Total":
            celda_etiqueta.font = negrita
            celda_monto.font = negrita
        fila += 1

    for columna, ancho in zip(range(1, 6), [16, 36, 12, 16, 14]):
        hoja.column_dimensions[get_column_letter(columna)].width = ancho

    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()
