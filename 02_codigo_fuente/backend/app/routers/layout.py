"""
Endpoints del layout solar — RF-03.

  GET  /api/proyectos/{id}/layout           → último layout generado
  POST /api/proyectos/{id}/layout           → generar (reemplaza el anterior)
  PUT  /api/proyectos/{id}/layout/bloques   → guardar la edición manual (SQ-64)
  POST /api/proyectos/{id}/layout/reagrupar → repartir los bloques entre los inversores
  POST /api/proyectos/{id}/layout/cotizacion → confirmar el diseño y emitir la cotización (RF-05)

POST y no PUT: el cliente no envía el layout, envía parámetros y el
servidor lo calcula. Dos POST con los mismos parámetros dan el mismo
resultado solo si terreno y equipo no cambiaron entre medio.

Solo Gerente General, igual que RF-01 y RF-02.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_permiso
from app.core.permisos import Permiso
from app.models.usuario import Usuario
from app.schemas.layout import (
    ConfirmarLayout,
    CotizacionEmitidaLeer,
    LayoutEditar,
    LayoutGenerar,
    LayoutLeer,
)
from app.services import layout as servicio
from app.services.calc_service import CalcServiceError
from app.services.confirmacion import NoSePuedeCotizar, cotizar_layout
from app.services.material import PrecioVigenteFaltante
from app.services.proyecto import ClienteNoDisponible
from app.services.calculo_layout import EdicionInvalida, LayoutImposible
from app.services.equipo import obtener_configuracion
from app.services.proyecto import obtener_proyecto

puede_generar = requiere_permiso(Permiso.GENERAR_LAYOUT)

router = APIRouter(
    prefix="/api/proyectos/{proyecto_id}/layout",
    tags=["Módulo 1 — Layout"],
    dependencies=[Depends(puede_generar)],
)


def _proyecto_o_404(db: Session, proyecto_id: int):
    proyecto = obtener_proyecto(db, proyecto_id)
    if proyecto is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No existe el proyecto {proyecto_id}",
        )
    return proyecto


@router.get("", response_model=LayoutLeer)
def consultar_layout(proyecto_id: int, db: Session = Depends(get_db)) -> LayoutLeer:
    """Último layout generado. Indica si quedó desactualizado."""
    proyecto = _proyecto_o_404(db, proyecto_id)
    layout = servicio.obtener_layout(db, proyecto_id)
    if layout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El proyecto {proyecto_id} todavía no tiene layout generado",
        )
    return servicio.a_respuesta(
        layout, servicio.huella_actual(db, proyecto), obtener_configuracion(db, proyecto_id)
    )


@router.post("", response_model=LayoutLeer)
def generar_layout(
    proyecto_id: int,
    datos: LayoutGenerar,
    db: Session = Depends(get_db),
) -> LayoutLeer:
    """
    Distribuye los bloques sobre el terreno y guarda el resultado.

    409 si faltan terreno o equipo; 422 si no entra ningún bloque. En
    ambos casos el mensaje dice qué corregir.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        layout = servicio.generar(db, proyecto, datos)
    except servicio.FaltanDatos as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except LayoutImposible as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return servicio.a_respuesta(layout, layout.huella, obtener_configuracion(db, proyecto_id))


@router.put("/bloques", response_model=LayoutLeer)
def editar_bloques(
    proyecto_id: int,
    datos: LayoutEditar,
    db: Session = Depends(get_db),
) -> LayoutLeer:
    """
    Guarda los bloques editados a mano. Se envían todos los que quedan:
    los que no vienen se eliminan.

    409 si no hay layout o está desactualizado; 422 si un bloque se sale
    del terreno, pisa un camino o se superpone con otro.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        layout = servicio.editar_bloques(db, proyecto, datos)
    except servicio.LayoutNoEditable as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except EdicionInvalida as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return servicio.a_respuesta(layout, layout.huella, obtener_configuracion(db, proyecto_id))


@router.post("/reagrupar", response_model=LayoutLeer)
def reagrupar(proyecto_id: int, db: Session = Depends(get_db)) -> LayoutLeer:
    """
    Reparte de nuevo todos los bloques entre los inversores del equipo,
    en proporción a su potencia y por sectores de la planta. No cambia
    la geometría.

    409 si no hay layout o está desactualizado.
    """
    proyecto = _proyecto_o_404(db, proyecto_id)
    try:
        layout = servicio.reagrupar(db, proyecto)
    except servicio.LayoutNoEditable as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return servicio.a_respuesta(layout, layout.huella, obtener_configuracion(db, proyecto_id))


@router.post("/cotizacion", response_model=CotizacionEmitidaLeer, status_code=status.HTTP_201_CREATED)
def confirmar_y_cotizar(
    proyecto_id: int,
    datos: ConfirmarLayout,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(puede_generar),
) -> CotizacionEmitidaLeer:
    """
    "Confirmar y generar cotización" del diagrama de confirmación: el
    Gerente confirma el diseño y se emiten los materiales (RF-05 → RF-06).

    409 si el proyecto ya se cotizó, si no hay layout, si quedó
    desactualizado o si hay bloques fuera de proporción sin aceptar;
    422 si falta un precio o el cliente está dado de baja; 502 si
    calc-service no responde.
    """
    _proyecto_o_404(db, proyecto_id)
    try:
        cotizacion = cotizar_layout(
            db,
            proyecto_id,
            usuario,
            acepta_fuera_de_proporcion=datos.acepta_fuera_de_proporcion,
            addendum_porcentaje=datos.addendum_porcentaje,
        )
    except NoSePuedeCotizar as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except (ClienteNoDisponible, PrecioVigenteFaltante) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except CalcServiceError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return CotizacionEmitidaLeer(id=cotizacion.id, numero_proforma=cotizacion.numero_proforma, total=cotizacion.total)
