"""Pruebas del CRUD de clientes (RF-12). Ver CONTRATO-CLIENTES.md."""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.cliente import Cliente, TipoIdentificacion
from app.models.usuario import RolUsuario, Usuario
from app.schemas.cliente import ClienteActualizar, ClienteCrear
from app.services.cliente import (
    IdentificacionDuplicada,
    actualizar_cliente,
    crear_cliente,
    dar_de_baja,
    listar_clientes,
    obtener_cliente,
)

CEDULA_VALIDA = "1710034065"
RUC_VALIDO = "1710034065001"


def _crear_usuario(db: Session) -> Usuario:
    usuario = Usuario(
        nombre="Gerente de prueba",
        email=f"gerente-{id(db)}@example.com",
        password_hash="hash-no-usado-en-este-test",
        rol=RolUsuario.GERENTE_GENERAL,
    )
    db.add(usuario)
    db.flush()
    return usuario


class TestClienteCrearSchema:
    def test_acepta_cedula_valida(self) -> None:
        datos = ClienteCrear(
            nombre="Juan Pérez",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
        )
        assert datos.identificacion == CEDULA_VALIDA

    def test_rechaza_cedula_invalida(self) -> None:
        with pytest.raises(ValidationError, match="no es una cédula válida"):
            ClienteCrear(
                nombre="Juan Pérez",
                tipo_identificacion=TipoIdentificacion.CEDULA,
                identificacion="1710034066",
            )

    def test_normaliza_identificacion_con_guiones(self) -> None:
        datos = ClienteCrear(
            nombre="Juan Pérez",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion="171-0034065",
        )
        assert datos.identificacion == CEDULA_VALIDA

    def test_rechaza_ruc_invalido(self) -> None:
        with pytest.raises(ValidationError, match="no es un RUC válido"):
            ClienteCrear(
                nombre="Empresa X",
                tipo_identificacion=TipoIdentificacion.RUC,
                identificacion="1234567890001",
            )

    def test_pasaporte_acepta_alfanumerico(self) -> None:
        datos = ClienteCrear(
            nombre="Visitante",
            tipo_identificacion=TipoIdentificacion.PASAPORTE,
            identificacion="AB12345",
        )
        assert datos.identificacion == "AB12345"

    def test_empresa_vacia_se_guarda_como_none(self) -> None:
        datos = ClienteCrear(
            nombre="Juan Pérez",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
            empresa="   ",
        )
        assert datos.empresa is None

    def test_rechaza_telefono_invalido(self) -> None:
        with pytest.raises(ValidationError, match="no es un teléfono válido"):
            ClienteCrear(
                nombre="Juan Pérez",
                tipo_identificacion=TipoIdentificacion.CEDULA,
                identificacion=CEDULA_VALIDA,
                telefono="abc",
            )

    def test_nombre_se_recorta(self) -> None:
        datos = ClienteCrear(
            nombre="  Juan Pérez  ",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
        )
        assert datos.nombre == "Juan Pérez"


class TestCrearCliente:
    def test_crea_el_cliente(self, db: Session) -> None:
        datos = ClienteCrear(
            nombre="Juan Pérez",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
        )
        cliente, total = crear_cliente(db, datos)

        assert cliente.id is not None
        assert cliente.activo is True
        assert total == 0

    def test_rechaza_identificacion_duplicada(self, db: Session) -> None:
        db.add(
            Cliente(
                nombre="Ya existe",
                tipo_identificacion=TipoIdentificacion.CEDULA,
                identificacion=CEDULA_VALIDA,
            )
        )
        db.flush()

        datos = ClienteCrear(
            nombre="Otro nombre",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
        )
        with pytest.raises(IdentificacionDuplicada, match="Ya existe"):
            crear_cliente(db, datos)


class TestListarClientes:
    def test_excluye_inactivos_por_defecto(self, db: Session) -> None:
        db.add_all(
            [
                Cliente(nombre="Activo", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion="1" * 10, activo=True),
                Cliente(nombre="Inactivo", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion="2" * 10, activo=False),
            ]
        )
        db.flush()

        resultado = listar_clientes(db, buscar=None, incluir_inactivos=False)

        assert [c.nombre for c, _ in resultado] == ["Activo"]

    def test_incluir_inactivos_los_trae_tambien(self, db: Session) -> None:
        db.add_all(
            [
                Cliente(nombre="Activo", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion="1" * 10, activo=True),
                Cliente(nombre="Inactivo", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion="2" * 10, activo=False),
            ]
        )
        db.flush()

        resultado = listar_clientes(db, buscar=None, incluir_inactivos=True)

        assert {c.nombre for c, _ in resultado} == {"Activo", "Inactivo"}

    def test_buscar_coincide_parcial_sin_mayusculas(self, db: Session) -> None:
        db.add(Cliente(nombre="Energy Control", tipo_identificacion=TipoIdentificacion.RUC, identificacion=RUC_VALIDO))
        db.flush()

        resultado = listar_clientes(db, buscar="energy", incluir_inactivos=False)

        assert len(resultado) == 1


class TestActualizarCliente:
    def test_cambia_solo_los_campos_enviados(self, db: Session) -> None:
        cliente = Cliente(
            nombre="Original",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
            telefono="0991234567",
        )
        db.add(cliente)
        db.flush()

        resultado = actualizar_cliente(db, cliente.id, ClienteActualizar(nombre="Nuevo nombre"))

        assert resultado is not None
        actualizado, _ = resultado
        assert actualizado.nombre == "Nuevo nombre"
        assert actualizado.telefono == "0991234567"  # no se tocó

    def test_null_explicito_borra_un_campo_opcional(self, db: Session) -> None:
        cliente = Cliente(
            nombre="Original",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
            telefono="0991234567",
        )
        db.add(cliente)
        db.flush()

        resultado = actualizar_cliente(db, cliente.id, ClienteActualizar(telefono=None))

        assert resultado is not None
        actualizado, _ = resultado
        assert actualizado.telefono is None

    def test_rechaza_nombre_nulo(self, db: Session) -> None:
        cliente = Cliente(nombre="Original", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()

        with pytest.raises(ValueError, match="nombre"):
            actualizar_cliente(db, cliente.id, ClienteActualizar(nombre=None))

    def test_reactiva_con_activo_true(self, db: Session) -> None:
        cliente = Cliente(
            nombre="Dado de baja",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
            activo=False,
        )
        db.add(cliente)
        db.flush()

        resultado = actualizar_cliente(db, cliente.id, ClienteActualizar(activo=True))

        assert resultado is not None
        assert resultado[0].activo is True

    def test_devuelve_none_si_no_existe(self, db: Session) -> None:
        assert actualizar_cliente(db, 999999, ClienteActualizar(nombre="No existe")) is None

    def test_rechaza_identificacion_duplicada_de_otro_cliente(self, db: Session) -> None:
        db.add(Cliente(nombre="Otro", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion="2" * 10))
        cliente = Cliente(nombre="Este", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()

        with pytest.raises(IdentificacionDuplicada):
            actualizar_cliente(db, cliente.id, ClienteActualizar(identificacion="2" * 10))

    def test_mismo_cliente_puede_guardar_con_su_propia_identificacion(self, db: Session) -> None:
        """No debe chocar consigo mismo al no cambiar nada relevante."""
        cliente = Cliente(nombre="Este", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()

        resultado = actualizar_cliente(db, cliente.id, ClienteActualizar(identificacion=CEDULA_VALIDA))

        assert resultado is not None

    def test_cambiar_tipo_sin_actualizar_identificacion_revalida_la_guardada(self, db: Session) -> None:
        cliente = Cliente(nombre="Este", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()

        # La cédula guardada no es un RUC válido (le faltan 3 dígitos).
        with pytest.raises(ValueError):
            actualizar_cliente(db, cliente.id, ClienteActualizar(tipo_identificacion=TipoIdentificacion.RUC))


class TestDarDeBaja:
    def test_marca_inactivo(self, db: Session) -> None:
        cliente = Cliente(nombre="X", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()

        resultado = dar_de_baja(db, cliente.id)

        assert resultado is not None
        assert resultado.activo is False

    def test_es_idempotente(self, db: Session) -> None:
        cliente = Cliente(
            nombre="X",
            tipo_identificacion=TipoIdentificacion.CEDULA,
            identificacion=CEDULA_VALIDA,
            activo=False,
        )
        db.add(cliente)
        db.flush()

        resultado = dar_de_baja(db, cliente.id)

        assert resultado is not None
        assert resultado.activo is False

    def test_devuelve_none_si_no_existe(self, db: Session) -> None:
        assert dar_de_baja(db, 999999) is None


class TestObtenerCliente:
    def test_cuenta_los_proyectos_del_cliente(self, db: Session) -> None:
        from app.models.proyecto import Proyecto

        usuario = _crear_usuario(db)
        cliente = Cliente(nombre="X", tipo_identificacion=TipoIdentificacion.CEDULA, identificacion=CEDULA_VALIDA)
        db.add(cliente)
        db.flush()
        db.add_all(
            [
                Proyecto(nombre="P1", cliente_id=cliente.id, usuario_id=usuario.id),
                Proyecto(nombre="P2", cliente_id=cliente.id, usuario_id=usuario.id),
            ]
        )
        db.flush()

        resultado = obtener_cliente(db, cliente.id)

        assert resultado is not None
        assert resultado[1] == 2

    def test_devuelve_none_si_no_existe(self, db: Session) -> None:
        assert obtener_cliente(db, 999999) is None
