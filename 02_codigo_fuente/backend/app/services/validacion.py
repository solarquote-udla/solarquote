"""
Validación de materiales — RF-14 (despacho), RF-15 (recepción) y RF-16
(estado de la propuesta).

El ciclo de una propuesta avanza en un solo sentido:

    cotizada ──despacho──▶ despachada ──recepción──▶ recibida ──instalación──▶ instalada

Cada paso exige el estado anterior y bloquea la fila de la cotización
(SELECT ... FOR UPDATE) mientras lo verifica y lo guarda: dos operarios
que confirman el mismo despacho a la vez no crean dos despachos ni hacen
saltar el estado. El segundo recibe 409.

Las cantidades se comparan contra lo cotizado (despacho) o contra lo
despachado (recepción), nunca contra el catálogo actual: lo que se valida
es la propuesta tal como se emitió.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.texto import escapar_comodines_ilike
from app.models.cotizacion import Cotizacion, EstadoCotizacion, MaterialCotizado
from app.models.material import Material
from app.models.usuario import Usuario
from app.models.validacion import Despacho, FotoValidacion, ItemDespacho, ItemRecepcion, Recepcion
from app.schemas.validacion import (
    MAXIMO_FOTOS,
    CotizacionAValidarLeer,
    DespachoCrear,
    DespachoLeer,
    EventoEstadoLeer,
    FotoLeer,
    ItemDespachoLeer,
    ItemRecepcionLeer,
    MaterialAValidarLeer,
    RecepcionCrear,
    RecepcionLeer,
    ValidacionLeer,
)
from app.services import ia_service

TAMANO_MAXIMO_FOTO = 10 * 1024 * 1024
LIMITE_LISTA = 100


class CotizacionNoEncontrada(LookupError):
    """No existe la cotización (404)."""


class EstadoNoPermitido(ValueError):
    """La propuesta no está en el estado que exige la operación (409)."""


class DatosNoValidos(ValueError):
    """Los datos no corresponden a la cotización o les falta algo (422)."""


class FotoNoValida(ValueError):
    """La foto no es PNG ni JPG, pesa demasiado o viene vacía. `status_code` va al usuario."""

    def __init__(self, mensaje: str, status_code: int = 415):
        super().__init__(mensaje)
        self.status_code = status_code


@dataclass(frozen=True)
class Foto:
    nombre_archivo: str
    contenido: bytes


# ─── Utilidades ─────────────────────────────────────────────────────


def formato_de_foto(contenido: bytes) -> str:
    """png o jpg según los primeros bytes; la extensión del archivo puede mentir."""
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if contenido.startswith(b"\xff\xd8\xff"):
        return "jpg"
    raise FotoNoValida("La foto debe ser una imagen JPG o PNG.")


def validar_foto(foto: Foto) -> str:
    if not foto.contenido:
        raise FotoNoValida(f"La foto {foto.nombre_archivo} está vacía.", status_code=422)
    if len(foto.contenido) > TAMANO_MAXIMO_FOTO:
        raise FotoNoValida(f"La foto {foto.nombre_archivo} supera el máximo de 10 MB.", status_code=413)
    return formato_de_foto(foto.contenido)


def _consulta_con_detalle():
    return select(Cotizacion).options(
        selectinload(Cotizacion.materiales).selectinload(MaterialCotizado.material),
        selectinload(Cotizacion.despacho).selectinload(Despacho.items),
        selectinload(Cotizacion.despacho).selectinload(Despacho.fotos),
        selectinload(Cotizacion.despacho).selectinload(Despacho.usuario),
        selectinload(Cotizacion.recepcion).selectinload(Recepcion.items),
        selectinload(Cotizacion.recepcion).selectinload(Recepcion.fotos),
        selectinload(Cotizacion.recepcion).selectinload(Recepcion.usuario),
        selectinload(Cotizacion.usuario),
        selectinload(Cotizacion.instalada_por),
    )


def obtener(db: Session, cotizacion_id: int) -> Cotizacion:
    cotizacion = db.scalar(_consulta_con_detalle().where(Cotizacion.id == cotizacion_id))
    if cotizacion is None:
        raise CotizacionNoEncontrada(f"No existe la cotización {cotizacion_id}")
    return cotizacion


def _bloquear(db: Session, cotizacion_id: int, estado_esperado: EstadoCotizacion, accion: str) -> Cotizacion:
    """
    Bloquea la fila y comprueba el estado. `populate_existing` relee la
    fila aunque la sesión ya la tuviera: el estado que cuenta es el que
    quedó después de esperar el bloqueo, no el que se leyó antes.
    """
    cotizacion = db.scalar(
        select(Cotizacion)
        .where(Cotizacion.id == cotizacion_id)
        .with_for_update(of=Cotizacion)
        .execution_options(populate_existing=True)
    )
    if cotizacion is None:
        raise CotizacionNoEncontrada(f"No existe la cotización {cotizacion_id}")
    if cotizacion.estado != estado_esperado:
        raise EstadoNoPermitido(
            f"No se puede {accion}: la propuesta {cotizacion.numero_proforma or cotizacion.id} "
            f"está {cotizacion.estado.value}."
        )
    return cotizacion


def _materiales_cotizados(db: Session, cotizacion_id: int) -> dict[int, tuple[MaterialCotizado, Material]]:
    filas = db.execute(
        select(MaterialCotizado, Material)
        .join(Material, Material.id == MaterialCotizado.material_id)
        .where(MaterialCotizado.cotizacion_id == cotizacion_id)
    ).all()
    return {mc.material_id: (mc, material) for mc, material in filas}


def _mismos_materiales(esperados: set[int], recibidos: list[int], que: str) -> None:
    if len(recibidos) != len(set(recibidos)):
        raise DatosNoValidos(f"Hay materiales repetidos en {que}.")
    faltan, sobran = esperados - set(recibidos), set(recibidos) - esperados
    if faltan or sobran:
        raise DatosNoValidos(
            f"Los materiales de {que} deben ser exactamente los de la cotización "
            f"(faltan {len(faltan)}, sobran {len(sobran)})."
        )


def _guardar(db: Session) -> None:
    """Un despacho o una recepción duplicados (carrera sin bloqueo) terminan en 409."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise EstadoNoPermitido("La propuesta cambió mientras se registraba. Vuelve a cargarla.") from exc


# ─── Listas ─────────────────────────────────────────────────────────


def listar(db: Session, estados: list[EstadoCotizacion], buscar: str | None = None) -> list[CotizacionAValidarLeer]:
    consulta = (
        select(Cotizacion, Despacho.created_at)
        .outerjoin(Despacho, Despacho.cotizacion_id == Cotizacion.id)
        .where(Cotizacion.estado.in_(estados))
        .order_by(Cotizacion.created_at.desc())
        .limit(LIMITE_LISTA)
    )
    if buscar and buscar.strip():
        patron = f"%{escapar_comodines_ilike(buscar.strip())}%"
        consulta = consulta.where(
            or_(
                Cotizacion.cliente_nombre.ilike(patron, escape="\\"),
                Cotizacion.numero_proforma.ilike(patron, escape="\\"),
                Cotizacion.proyecto_nombre.ilike(patron, escape="\\"),
            )
        )
    return [
        CotizacionAValidarLeer(
            cotizacion_id=c.id,
            numero_proforma=c.numero_proforma,
            cliente_nombre=c.cliente_nombre,
            proyecto_nombre=c.proyecto_nombre,
            estado=c.estado,
            created_at=c.created_at,
            fecha_despacho=fecha_despacho,
        )
        for c, fecha_despacho in db.execute(consulta).all()
    ]


# ─── RF-14: conteo y despacho ──────────────────────────────────────


def contar_varillas(db: Session, cotizacion_id: int, foto: Foto) -> dict:
    """
    Conteo con IA de una foto del lote. No guarda nada: el operario revisa
    el número y lo confirma junto con el despacho.
    """
    cotizacion = db.get(Cotizacion, cotizacion_id)
    if cotizacion is None:
        raise CotizacionNoEncontrada(f"No existe la cotización {cotizacion_id}")
    if cotizacion.estado != EstadoCotizacion.COTIZADA:
        raise EstadoNoPermitido(f"La propuesta ya está {cotizacion.estado.value}: no hay lote por contar.")
    validar_foto(foto)
    return ia_service.contar_varillas(foto.nombre_archivo, foto.contenido)


def registrar_despacho(
    db: Session, cotizacion_id: int, datos: DespachoCrear, fotos: list[Foto], usuario: Usuario
) -> Cotizacion:
    if len(fotos) != len(datos.fotos):
        raise DatosNoValidos("Cada foto debe venir con el material que muestra.")
    if len(fotos) > MAXIMO_FOTOS:
        raise DatosNoValidos(f"Se admiten hasta {MAXIMO_FOTOS} fotos por despacho.")
    formatos = [validar_foto(f) for f in fotos]

    cotizacion = _bloquear(db, cotizacion_id, EstadoCotizacion.COTIZADA, "registrar el despacho")
    cotizados = _materiales_cotizados(db, cotizacion_id)
    _mismos_materiales(set(cotizados), [i.material_id for i in datos.items], "el despacho")
    for meta in datos.fotos:
        if meta.material_id not in cotizados:
            raise DatosNoValidos("Una foto indica un material que no está en la cotización.")

    con_diferencias = any(i.cantidad_despachada != cotizados[i.material_id][0].cantidad for i in datos.items)
    if con_diferencias and not datos.justificacion:
        raise DatosNoValidos("Hay cantidades distintas a las cotizadas: escribe la justificación antes de despachar.")

    despacho = Despacho(
        cotizacion_id=cotizacion.id,
        usuario_id=usuario.id,
        fabricado_por=datos.fabricado_por,
        soldado_por=datos.soldado_por,
        contado_por=datos.contado_por,
        despachado_por=datos.despachado_por,
        destino=datos.destino,
        justificacion=datos.justificacion,
        items=[
            ItemDespacho(
                material_id=i.material_id,
                codigo=cotizados[i.material_id][1].codigo,
                nombre=cotizados[i.material_id][1].nombre,
                cantidad_cotizada=cotizados[i.material_id][0].cantidad,
                cantidad_despachada=i.cantidad_despachada,
                conteo_ia=i.conteo_ia,
            )
            for i in sorted(datos.items, key=lambda i: cotizados[i.material_id][1].codigo)
        ],
        fotos=[
            FotoValidacion(
                material_id=meta.material_id,
                nombre_archivo=(foto.nombre_archivo or "foto")[:255],
                formato=formato,
                tamano_bytes=len(foto.contenido),
                contenido=foto.contenido,
                conteo_ia=meta.conteo_ia,
            )
            for foto, meta, formato in zip(fotos, datos.fotos, formatos)
        ],
    )
    db.add(despacho)
    cotizacion.estado = EstadoCotizacion.DESPACHADA
    _guardar(db)
    return obtener(db, cotizacion_id)


# ─── RF-15: recepción ──────────────────────────────────────────────


def registrar_recepcion(
    db: Session, cotizacion_id: int, datos: RecepcionCrear, fotos: list[Foto], usuario: Usuario
) -> Cotizacion:
    if len(fotos) > MAXIMO_FOTOS:
        raise DatosNoValidos(f"Se admiten hasta {MAXIMO_FOTOS} fotos por recepción.")
    formatos = [validar_foto(f) for f in fotos]

    cotizacion = _bloquear(db, cotizacion_id, EstadoCotizacion.DESPACHADA, "registrar la recepción")
    despacho = db.scalar(select(Despacho).where(Despacho.cotizacion_id == cotizacion_id).options(selectinload(Despacho.items)))
    if despacho is None:  # el CHECK de estados lo impide; se cubre igual
        raise EstadoNoPermitido("La propuesta no tiene un despacho registrado.")
    despachados = {i.material_id: i for i in despacho.items}
    _mismos_materiales(set(despachados), [i.material_id for i in datos.items], "la recepción")

    items = []
    for entrada in datos.items:
        origen = despachados[entrada.material_id]
        esperada = origen.cantidad_despachada
        recibida = entrada.cantidad_recibida
        if entrada.estado == "ok":
            if recibida is not None and recibida != esperada:
                raise DatosNoValidos(
                    f"{origen.codigo}: marcaste OK pero la cantidad recibida no coincide. Márcalo como diferencia."
                )
            recibida = esperada
        elif entrada.estado == "diferencia" and recibida == esperada:
            raise DatosNoValidos(f"{origen.codigo}: la cantidad recibida coincide con la esperada. Márcalo como OK.")
        items.append(
            ItemRecepcion(
                material_id=entrada.material_id,
                codigo=origen.codigo,
                nombre=origen.nombre,
                cantidad_esperada=esperada,
                cantidad_recibida=recibida,
                estado=entrada.estado,
                observacion=entrada.observacion,
            )
        )

    recepcion = Recepcion(
        cotizacion_id=cotizacion.id,
        usuario_id=usuario.id,
        recibido_por=datos.recibido_por,
        observaciones=datos.observaciones,
        items=sorted(items, key=lambda i: i.codigo),
        fotos=[
            FotoValidacion(
                nombre_archivo=(foto.nombre_archivo or "foto")[:255],
                formato=formato,
                tamano_bytes=len(foto.contenido),
                contenido=foto.contenido,
            )
            for foto, formato in zip(fotos, formatos)
        ],
    )
    db.add(recepcion)
    cotizacion.estado = EstadoCotizacion.RECIBIDA
    _guardar(db)
    return obtener(db, cotizacion_id)


# ─── RF-16: instalación ────────────────────────────────────────────


def registrar_instalacion(db: Session, cotizacion_id: int, usuario: Usuario) -> Cotizacion:
    cotizacion = _bloquear(db, cotizacion_id, EstadoCotizacion.RECIBIDA, "marcarla como instalada")
    cotizacion.estado = EstadoCotizacion.INSTALADA
    cotizacion.instalada_at = datetime.now(timezone.utc)
    cotizacion.instalada_por_id = usuario.id
    _guardar(db)
    return obtener(db, cotizacion_id)


def obtener_foto(db: Session, cotizacion_id: int, foto_id: int) -> FotoValidacion:
    foto = db.get(FotoValidacion, foto_id)
    if foto is not None:
        despacho = db.get(Despacho, foto.despacho_id) if foto.despacho_id else None
        recepcion = db.get(Recepcion, foto.recepcion_id) if foto.recepcion_id else None
        duena = (despacho or recepcion).cotizacion_id
        if duena == cotizacion_id:
            return foto
    raise CotizacionNoEncontrada(f"La cotización {cotizacion_id} no tiene la foto {foto_id}")


# ─── Respuestas ────────────────────────────────────────────────────


def _fotos(fotos: list[FotoValidacion]) -> list[FotoLeer]:
    return [FotoLeer(id=f.id, nombre_archivo=f.nombre_archivo, material_id=f.material_id, conteo_ia=f.conteo_ia) for f in fotos]


def _despacho(d: Despacho) -> DespachoLeer:
    items = [
        ItemDespachoLeer(
            material_id=i.material_id,
            codigo=i.codigo,
            nombre=i.nombre,
            cantidad_cotizada=i.cantidad_cotizada,
            cantidad_despachada=i.cantidad_despachada,
            conteo_ia=i.conteo_ia,
            diferencia=i.cantidad_despachada - i.cantidad_cotizada,
        )
        for i in d.items
    ]
    return DespachoLeer(
        fabricado_por=d.fabricado_por,
        soldado_por=d.soldado_por,
        contado_por=d.contado_por,
        despachado_por=d.despachado_por,
        destino=d.destino,
        justificacion=d.justificacion,
        registrado_por=d.usuario.nombre,
        created_at=d.created_at,
        items=items,
        fotos=_fotos(d.fotos),
        con_diferencias=any(i.diferencia for i in items),
    )


def _recepcion(r: Recepcion) -> RecepcionLeer:
    items = [
        ItemRecepcionLeer(
            material_id=i.material_id,
            codigo=i.codigo,
            nombre=i.nombre,
            cantidad_esperada=i.cantidad_esperada,
            cantidad_recibida=i.cantidad_recibida,
            estado=i.estado,
            observacion=i.observacion,
            diferencia=None if i.cantidad_recibida is None else i.cantidad_recibida - i.cantidad_esperada,
        )
        for i in r.items
    ]
    return RecepcionLeer(
        recibido_por=r.recibido_por,
        observaciones=r.observaciones,
        registrado_por=r.usuario.nombre,
        created_at=r.created_at,
        items=items,
        fotos=_fotos(r.fotos),
        revisados=sum(1 for i in items if i.estado != "pendiente"),
        diferencias=sum(1 for i in items if i.estado == "diferencia"),
        pendientes=sum(1 for i in items if i.estado == "pendiente"),
    )


def linea_de_tiempo(c: Cotizacion) -> list[EventoEstadoLeer]:
    """Las cuatro etapas, en orden, con la fecha y el responsable de las alcanzadas."""
    etapas = [
        (EstadoCotizacion.COTIZADA, c.created_at, c.usuario.nombre if c.usuario else None),
        (EstadoCotizacion.DESPACHADA, c.despacho.created_at if c.despacho else None,
         c.despacho.despachado_por if c.despacho else None),
        (EstadoCotizacion.RECIBIDA, c.recepcion.created_at if c.recepcion else None,
         c.recepcion.recibido_por if c.recepcion else None),
        (EstadoCotizacion.INSTALADA, c.instalada_at, c.instalada_por.nombre if c.instalada_por else None),
    ]
    return [
        EventoEstadoLeer(estado=estado, alcanzado=fecha is not None, fecha=fecha, responsable=responsable)
        for estado, fecha, responsable in etapas
    ]


def a_respuesta(c: Cotizacion) -> ValidacionLeer:
    materiales = sorted(
        (
            MaterialAValidarLeer(
                material_id=m.material_id,
                codigo=m.material.codigo,
                nombre=m.material.nombre,
                unidad=m.material.unidad,
                cantidad=m.cantidad,
            )
            for m in c.materiales
        ),
        key=lambda m: m.codigo,
    )
    return ValidacionLeer(
        cotizacion_id=c.id,
        numero_proforma=c.numero_proforma,
        cliente_nombre=c.cliente_nombre,
        cliente_empresa=c.cliente_empresa,
        proyecto_nombre=c.proyecto_nombre,
        estado=c.estado,
        created_at=c.created_at,
        materiales=materiales,
        despacho=_despacho(c.despacho) if c.despacho else None,
        recepcion=_recepcion(c.recepcion) if c.recepcion else None,
        linea_tiempo=linea_de_tiempo(c),
    )
