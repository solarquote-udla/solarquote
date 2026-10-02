"""
Endpoints de clientes — RF-12. Ver CONTRATO-CLIENTES.md.

  GET    /api/clientes        → listado (?buscar=, ?incluir_inactivos=)
  GET    /api/clientes/{id}   → detalle
  POST   /api/clientes        → alta
  PATCH  /api/clientes/{id}   → corrección parcial / reactivación
  DELETE /api/clientes/{id}   → baja lógica (idempotente)

Solo Gerente General.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import requiere_gerente
from app.models.cliente import Cliente
from app.schemas.cliente import ClienteActualizar, ClienteCrear, ClienteLeer
from app.services import cliente as servicio

router = APIRouter(
    prefix="/api/clientes",
    tags=["Clientes"],
    dependencies=[Depends(requiere_gerente)],
)


def _respuesta(cliente: Cliente, total_proyectos: int) -> ClienteLeer:
    return ClienteLeer(
        id=cliente.id,
        nombre=cliente.nombre,
        tipo_identificacion=cliente.tipo_identificacion,
        identificacion=cliente.identificacion,
        empresa=cliente.empresa,
        email=cliente.email,
        telefono=cliente.telefono,
        direccion=cliente.direccion,
        activo=cliente.activo,
        total_proyectos=total_proyectos,
        created_at=cliente.created_at,
        updated_at=cliente.updated_at,
    )


@router.get("", response_model=list[ClienteLeer])
def listar(
    buscar: str | None = Query(default=None),
    incluir_inactivos: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[ClienteLeer]:
    return [_respuesta(cliente, total) for cliente, total in servicio.listar_clientes(db, buscar, incluir_inactivos)]


@router.get("/{cliente_id}", response_model=ClienteLeer)
def detalle(cliente_id: int, db: Session = Depends(get_db)) -> ClienteLeer:
    resultado = servicio.obtener_cliente(db, cliente_id)
    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el cliente {cliente_id}")
    return _respuesta(*resultado)


@router.post("", response_model=ClienteLeer, status_code=status.HTTP_201_CREATED)
def crear(datos: ClienteCrear, db: Session = Depends(get_db)) -> ClienteLeer:
    try:
        cliente, total = servicio.crear_cliente(db, datos)
    except servicio.IdentificacionDuplicada as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return _respuesta(cliente, total)


@router.patch("/{cliente_id}", response_model=ClienteLeer)
def actualizar(cliente_id: int, datos: ClienteActualizar, db: Session = Depends(get_db)) -> ClienteLeer:
    try:
        resultado = servicio.actualizar_cliente(db, cliente_id, datos)
    except servicio.IdentificacionDuplicada as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    if resultado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el cliente {cliente_id}")
    return _respuesta(*resultado)


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def dar_de_baja(cliente_id: int, db: Session = Depends(get_db)) -> None:
    cliente = servicio.dar_de_baja(db, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No existe el cliente {cliente_id}")
