"""
Documentos de la proforma en Word y Excel — RF-07.

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
from app.models.cotizacion import Cotizacion, ItemCotizacion, MaterialCotizado
from app.models.material import Material
from app.services import documentos
from tests.fabricas import crear_usuario, perfil_personalizado
from tests.test_varios_inversores import _cabecera, api, h  # noqa: F401

HOY = datetime(2026, 10, 26, 15, 0, tzinfo=timezone.utc)
_secuencia = count(1)


def _cotizacion_con_materiales(db: Session, **campos) -> Cotizacion:
    usuario = crear_usuario(db)
    n = next(_secuencia)
    varilla = Material(codigo=f"VAR1650-{n}", nombre="Varilla 1650", unidad="u")
    tornillo = Material(codigo=f"TORNILLO_M8-{n}", nombre="Tornillo M8", unidad="unidad")
    db.add_all([varilla, tornillo])
    db.flush()

    cotizacion = Cotizacion(
        usuario_id=usuario.id,
        cliente_nombre=campos.pop("cliente_nombre", "SolarAndes Instalaciones"),
        cliente_empresa=campos.pop("cliente_empresa", "SolarAndes S.A."),
        cliente_email=campos.pop("cliente_email", "proyectos@solarandes.ec"),
        cliente_telefono=campos.pop("cliente_telefono", "099 123 4567"),
        proyecto_nombre=campos.pop("proyecto_nombre", "Planta El Carmen"),
        numero_proforma=campos.pop("numero_proforma", "CT-130-2026"),
        subtotal=Decimal("440.00"),
        addendum_porcentaje=Decimal("5.00"),
        addendum_monto=Decimal("22.00"),
        iva_porcentaje=Decimal("15.00"),
        iva_monto=Decimal("69.30"),
        total=Decimal("531.30"),
        created_at=HOY,
        items=[ItemCotizacion(paneles_largo=4, paneles_ancho=3, bloques=2)],
        materiales=[
            MaterialCotizado(material=tornillo, cantidad=400, precio_unitario=Decimal("0.35")),
            MaterialCotizado(material=varilla, cantidad=120, precio_unitario=Decimal("2.50")),
        ],
        **campos,
    )
    db.add(cotizacion)
    db.flush()
    db.refresh(cotizacion)
    return cotizacion


# ─── Servicio: generar_word / generar_excel ─────────────────────────


def test_word_incluye_cliente_materiales_y_totales(db: Session) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))

    texto = "\n".join(p.text for p in documento.paragraphs)
    assert "Proforma CT-130-2026" in texto
    assert "SolarAndes Instalaciones" in texto
    assert "SolarAndes S.A." in texto
    assert "Planta El Carmen" in texto
    assert "Subtotal: $440.00" in texto
    assert "Addendum (5.00%): $22.00" in texto
    assert "IVA (15.00%): $69.30" in texto
    assert "Total: $531.30" in texto

    [tornillo, varilla] = sorted(cotizacion.materiales, key=lambda m: m.material.codigo)
    filas = [[c.text for c in fila.cells] for tabla in documento.tables for fila in tabla.rows]
    assert ["Código", "Material", "Cantidad", "Precio unitario", "Subtotal"] in filas
    # Ordenado por código: TORNILLO_M8-N antes que VAR1650-N
    assert [tornillo.material.codigo, "Tornillo M8 (unidad)", "400", "$0.35", "$140.00"] in filas
    assert [varilla.material.codigo, "Varilla 1650 (u)", "120", "$2.50", "$300.00"] in filas


def test_word_sin_proforma_ni_datos_opcionales_no_falla(db: Session) -> None:
    """Una cotización al vuelo: sin número de proforma, empresa, correo ni teléfono."""
    cotizacion = _cotizacion_con_materiales(
        db, numero_proforma=None, cliente_empresa=None, cliente_email=None, cliente_telefono=None, proyecto_nombre=None
    )

    documento = Document(io.BytesIO(documentos.generar_word(cotizacion)))
    texto = "\n".join(p.text for p in documento.paragraphs)

    assert "Proforma (borrador)" in texto
    assert "Empresa" not in texto
    assert "Proyecto" not in texto


def test_excel_incluye_cliente_materiales_y_totales(db: Session) -> None:
    cotizacion = _cotizacion_con_materiales(db)

    [tornillo, varilla] = sorted(cotizacion.materiales, key=lambda m: m.material.codigo)
    libro = load_workbook(io.BytesIO(documentos.generar_excel(cotizacion)))
    filas = [list(fila) for fila in libro.active.iter_rows(values_only=True) if any(v is not None for v in fila)]

    assert ["Código", "Material", "Cantidad", "Precio unitario", "Subtotal"] in filas
    assert [tornillo.material.codigo, "Tornillo M8 (unidad)", 400, 0.35, 140.0] in filas
    assert [varilla.material.codigo, "Varilla 1650 (u)", 120, 2.5, 300.0] in filas
    assert [None, None, None, "Total", 531.3] in filas


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
