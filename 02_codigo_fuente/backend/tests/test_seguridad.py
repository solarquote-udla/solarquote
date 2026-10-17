"""
Pruebas del módulo de seguridad (RF-11): login, contraseñas temporales,
bloqueo por intentos, perfiles con permisos y administración de usuarios.

Corren contra la API real (TestClient) con la sesión de pruebas, para
verificar también que cada endpoint aplica su permiso.
"""

import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, event
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import DETALLE_CAMBIO_PENDIENTE
from app.core.permisos import CATALOGO, TODOS_LOS_PERMISOS, Permiso
from app.core.security import crear_access_token, hash_password
from app.main import app
from app.models.perfil import Perfil
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioActualizar
from app.services import auth as servicio_auth
from app.services import seguridad
from tests.fabricas import (
    PASSWORD,
    crear_usuario,
    perfil_gerente,
    perfil_personalizado,
    perfil_produccion,
)


@pytest.fixture
def api(db: Session):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def cabecera(usuario) -> dict[str, str]:
    token = crear_access_token(usuario_id=usuario.id, version=usuario.version_token)
    return {"Authorization": f"Bearer {token}"}


def login(api: TestClient, email: str, password: str = PASSWORD):
    return api.post("/api/auth/login", json={"email": email, "password": password})


# ─── Login ──────────────────────────────────────────────


def test_login_correcto_entrega_token_permisos_y_registra_acceso(api, db):
    gerente = crear_usuario(db, intentos_fallidos=2)

    r = login(api, gerente.email.upper())  # el correo no distingue mayúsculas

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert set(cuerpo["usuario"]["permisos"]) == TODOS_LOS_PERMISOS
    assert cuerpo["usuario"]["perfil"]["acceso_total"] is True
    assert "password_hash" not in cuerpo["usuario"]
    db.refresh(gerente)
    assert gerente.ultimo_acceso is not None
    assert gerente.intentos_fallidos == 0

    yo = api.get("/api/auth/yo", headers={"Authorization": f"Bearer {cuerpo['access_token']}"})
    assert yo.status_code == 200
    assert yo.json()["email"] == gerente.email


def test_login_no_revela_si_el_correo_existe(api, db):
    gerente = crear_usuario(db)

    mal_password = login(api, gerente.email, "Otra12345")
    no_existe = login(api, "nadie@example.com", "Otra12345")

    assert mal_password.status_code == no_existe.status_code == 401
    assert mal_password.json() == no_existe.json()


def test_bloqueo_tras_intentos_fallidos(api, db):
    usuario = crear_usuario(db)

    for _ in range(settings.MAX_INTENTOS_LOGIN - 1):
        assert login(api, usuario.email, "Incorrecta1").status_code == 401

    ultimo = login(api, usuario.email, "Incorrecta1")
    assert ultimo.status_code == 429
    assert "Retry-After" in ultimo.headers

    # Bloqueada: ni la contraseña correcta entra
    assert login(api, usuario.email).status_code == 429

    # Vencido el bloqueo, entra
    usuario.bloqueado_hasta = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.flush()
    assert login(api, usuario.email).status_code == 200


def test_cuenta_desactivada_solo_se_informa_con_la_contraseña_correcta(api, db):
    usuario = crear_usuario(db, perfil=perfil_produccion(db), activo=False)

    assert login(api, usuario.email, "Incorrecta1").status_code == 401
    r = login(api, usuario.email)
    assert r.status_code == 403
    assert "desactivada" in r.json()["detail"]


# ─── Contraseña temporal y cambio de contraseña ─────────


def test_contraseña_temporal_obliga_a_cambiarla(api, db):
    usuario = crear_usuario(db, debe_cambiar_password=True)

    r = login(api, usuario.email)
    assert r.status_code == 200
    viejo = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert r.json()["usuario"]["estado"] == "pendiente"

    # Solo puede ver su sesión y cambiar la contraseña
    bloqueado = api.get("/api/clientes", headers=viejo)
    assert bloqueado.status_code == 403
    assert bloqueado.json()["detail"] == DETALLE_CAMBIO_PENDIENTE
    assert api.get("/api/auth/yo", headers=viejo).status_code == 200

    cambio = api.post(
        "/api/auth/cambiar-password",
        headers=viejo,
        json={"password_actual": PASSWORD, "password_nueva": "NuevaClave9"},
    )
    assert cambio.status_code == 200
    assert cambio.json()["usuario"]["debe_cambiar_password"] is False
    nuevo = {"Authorization": f"Bearer {cambio.json()['access_token']}"}

    assert api.get("/api/clientes", headers=nuevo).status_code == 200
    # El token anterior al cambio ya no vale
    assert api.get("/api/auth/yo", headers=viejo).status_code == 401
    assert login(api, usuario.email, "NuevaClave9").status_code == 200


@pytest.mark.parametrize(
    ("actual", "nueva", "esperado"),
    [
        ("Incorrecta1", "NuevaClave9", "actual no es correcta"),
        (PASSWORD, PASSWORD, "distinta"),
        (PASSWORD, "corta1", None),           # menos de 8
        (PASSWORD, "solamenteletras", None),  # sin número
        (PASSWORD, "1234567890", None),       # sin letra
    ],
)
def test_cambio_de_contraseña_rechazado(api, db, actual, nueva, esperado):
    usuario = crear_usuario(db)
    r = api.post(
        "/api/auth/cambiar-password",
        headers=cabecera(usuario),
        json={"password_actual": actual, "password_nueva": nueva},
    )
    assert r.status_code == 422
    if esperado:
        assert esperado in r.json()["detail"]


# ─── Tokens ─────────────────────────────────────────────


def test_token_invalido_o_alterado(api, db):
    usuario = crear_usuario(db)
    token = cabecera(usuario)["Authorization"]

    assert api.get("/api/auth/yo", headers={"Authorization": token[:-2] + "xx"}).status_code == 401
    assert api.get("/api/auth/yo", headers={"Authorization": "Bearer basura"}).status_code == 401
    assert api.get("/api/auth/yo").status_code in (401, 403)


def test_desactivar_cierra_las_sesiones_abiertas(api, db):
    gerente = crear_usuario(db)
    operario = crear_usuario(db, perfil=perfil_produccion(db))
    sesion = cabecera(operario)
    assert api.get("/api/auth/yo", headers=sesion).status_code == 200

    r = api.patch(f"/api/usuarios/{operario.id}", headers=cabecera(gerente), json={"activo": False})
    assert r.status_code == 200
    assert r.json()["estado"] == "inactivo"

    assert api.get("/api/auth/yo", headers=sesion).status_code in (401, 403)


# ─── Permisos por opción de menú ────────────────────────


def _rutas_protegidas():
    publicas = {"/api/auth/login"}
    for ruta in app.routes:
        if isinstance(ruta, APIRoute) and ruta.path.startswith("/api/") and ruta.path not in publicas:
            for metodo in ruta.methods - {"HEAD", "OPTIONS"}:
                yield metodo, ruta.path


def _url(path: str) -> str:
    return path.replace("{proyecto_id}", "1").replace("{cliente_id}", "1").replace(
        "{material_id}", "1").replace("{perfil_id}", "1").replace("{usuario_id}", "1").replace(
        "{camino_id}", "1")


def test_ningun_endpoint_queda_abierto(api):
    for metodo, path in _rutas_protegidas():
        r = api.request(metodo, _url(path))
        assert r.status_code in (401, 403), f"{metodo} {path} respondió {r.status_code} sin token"


def test_un_perfil_sin_permisos_no_entra_a_ningun_modulo(api, db):
    usuario = crear_usuario(db, perfil=perfil_personalizado(db))
    propios = {"/api/auth/yo", "/api/auth/cambiar-password"}

    for metodo, path in _rutas_protegidas():
        if path in propios:
            continue
        r = api.request(metodo, _url(path), headers=cabecera(usuario))
        assert r.status_code == 403, f"{metodo} {path} respondió {r.status_code} sin permisos"


def test_personal_de_produccion_solo_ve_validacion(api, db):
    operario = crear_usuario(db, perfil=perfil_produccion(db))
    sesion = cabecera(operario)

    yo = api.get("/api/auth/yo", headers=sesion).json()
    assert yo["permisos"] == ["despacho", "recepcion"]
    for path in ("/api/clientes", "/api/proyectos", "/api/materiales", "/api/usuarios", "/api/perfiles"):
        assert api.get(path, headers=sesion).status_code == 403, path


def test_perfil_personalizado_y_cambio_de_permisos_inmediato(api, db):
    perfil = perfil_personalizado(db, Permiso.CLIENTES)
    usuario = crear_usuario(db, perfil=perfil)
    sesion = cabecera(usuario)

    assert api.get("/api/clientes", headers=sesion).status_code == 200
    assert api.post("/api/clientes", headers=sesion, json={}).status_code == 422  # pasa el permiso
    assert api.get("/api/proyectos", headers=sesion).status_code == 403

    # El gerente le agrega "Generar layout": aplica sin volver a iniciar sesión
    gerente = crear_usuario(db)
    r = api.patch(
        f"/api/perfiles/{perfil.id}",
        headers=cabecera(gerente),
        json={"permisos": ["clientes", "generar_layout"]},
    )
    assert r.status_code == 200
    assert api.get("/api/proyectos", headers=sesion).status_code == 200


def test_ver_materiales_no_permite_cambiar_precios(api, db):
    usuario = crear_usuario(db, perfil=perfil_personalizado(db, Permiso.MATERIALES))
    sesion = cabecera(usuario)

    assert api.get("/api/materiales", headers=sesion).status_code == 200
    r = api.patch("/api/materiales/1/precio", headers=sesion, json={"precio_unitario": "1.00"})
    assert r.status_code == 403


def test_generar_layout_puede_leer_inversores_pero_no_administrarlos(api, db):
    """Revisión del PR #37 (Joseph): el Paso 2 del asistente lee este catálogo."""
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.GENERAR_LAYOUT)))

    assert api.get("/api/inversores", headers=sesion).status_code == 200
    assert api.post("/api/inversores", headers=sesion, json={"marca": "Huawei", "modelo": "X", "potencia_kw": 50}).status_code == 403


def test_sin_ningun_permiso_relacionado_no_lee_inversores(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))

    assert api.get("/api/inversores", headers=sesion).status_code == 403


def test_historial_lo_lee_quien_tiene_historial_o_generar_layout(api, db):
    """Revisión del PR #39 (RF-10): misma regla que la ruta /historial del frontend."""
    con_historial = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.HISTORIAL)))
    con_generar_layout = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.GENERAR_LAYOUT)))

    assert api.get("/api/cotizaciones", headers=con_historial).status_code == 200
    assert api.get("/api/cotizaciones", headers=con_generar_layout).status_code == 200


def test_historial_no_lo_lee_cualquier_otro_permiso(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CLIENTES)))

    assert api.get("/api/cotizaciones", headers=sesion).status_code == 403
    assert api.get("/api/cotizaciones/1", headers=sesion).status_code == 403


def test_historial_no_permite_crear_cotizaciones(api, db):
    """HISTORIAL es de solo lectura: crear sigue exigiendo generar_layout o cargar_boceto."""
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.HISTORIAL)))

    r = api.post("/api/cotizaciones", headers=sesion, json={"cliente_nombre": "X", "items": []})
    assert r.status_code == 403


def test_cargar_boceto_puede_cotizar_pero_no_lee_el_historial(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.CARGAR_BOCETO)))

    assert api.get("/api/cotizaciones", headers=sesion).status_code == 403
    r = api.post("/api/cotizaciones", headers=sesion, json={"cliente_nombre": "X", "items": []})
    assert r.status_code != 403


# ─── Perfiles ───────────────────────────────────────────


def test_catalogo_y_listado_de_perfiles(api, db):
    gerente = crear_usuario(db)
    perfil_produccion(db)
    sesion = cabecera(gerente)

    catalogo = api.get("/api/permisos", headers=sesion).json()
    assert [p["codigo"] for p in catalogo] == [p.codigo.value for p in CATALOGO]
    assert {p["grupo"] for p in catalogo} == {"CÁLCULO", "OPERACIONES", "CONFIGURACIÓN"}

    perfiles = api.get("/api/perfiles", headers=sesion).json()
    assert [p["nombre"] for p in perfiles[:2]] == ["Gerente General", "Personal de Producción"]
    assert perfiles[0]["es_sistema"] and perfiles[0]["total_usuarios"] >= 1
    assert set(perfiles[0]["permisos"]) == TODOS_LOS_PERMISOS


def test_crear_perfil_y_validaciones(api, db):
    sesion = cabecera(crear_usuario(db))

    r = api.post(
        "/api/perfiles",
        headers=sesion,
        json={"nombre": "  Ventas   regionales ", "permisos": ["clientes", "historial"]},
    )
    assert r.status_code == 201
    assert r.json()["nombre"] == "Ventas regionales"
    assert r.json()["es_sistema"] is False
    assert r.json()["acceso_total"] is False

    duplicado = api.post("/api/perfiles", headers=sesion, json={"nombre": "VENTAS REGIONALES"})
    assert duplicado.status_code == 409
    invalido = api.post("/api/perfiles", headers=sesion, json={"nombre": "Otro", "permisos": ["root"]})
    assert invalido.status_code == 422


def test_reglas_de_los_perfiles_del_sistema(api, db):
    sesion = cabecera(crear_usuario(db))
    gerente, produccion = perfil_gerente(db), perfil_produccion(db)

    assert api.patch(f"/api/perfiles/{gerente.id}", headers=sesion, json={"permisos": []}).status_code == 409
    assert api.patch(f"/api/perfiles/{produccion.id}", headers=sesion, json={"nombre": "Bodega"}).status_code == 409
    r = api.patch(f"/api/perfiles/{produccion.id}", headers=sesion, json={"permisos": ["despacho"]})
    assert r.status_code == 200
    assert r.json()["permisos"] == ["despacho"]

    assert api.delete(f"/api/perfiles/{gerente.id}", headers=sesion).status_code == 409
    assert api.delete(f"/api/perfiles/{produccion.id}", headers=sesion).status_code == 409


def test_eliminar_perfil_personalizado(api, db):
    sesion = cabecera(crear_usuario(db))
    con_usuarios = perfil_personalizado(db, Permiso.CLIENTES)
    crear_usuario(db, perfil=con_usuarios)
    vacio = perfil_personalizado(db)

    assert api.delete(f"/api/perfiles/{con_usuarios.id}", headers=sesion).status_code == 409
    assert api.delete(f"/api/perfiles/{vacio.id}", headers=sesion).status_code == 204
    assert api.get(f"/api/perfiles/{vacio.id}", headers=sesion).status_code == 404


def test_quien_administra_usuarios_lee_perfiles_pero_no_los_edita(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.USUARIOS)))

    assert api.get("/api/perfiles", headers=sesion).status_code == 200
    assert api.post("/api/perfiles", headers=sesion, json={"nombre": "Nuevo"}).status_code == 403


# ─── Usuarios ───────────────────────────────────────────


def test_crear_usuario_con_contraseña_temporal(api, db):
    sesion = cabecera(crear_usuario(db))
    produccion = perfil_produccion(db)
    datos = {
        "nombre": "  Ana   Pérez ",
        "email": "Ana.Perez@HEXtructure.com",
        "password_temporal": "Temporal1",
        "perfil_id": produccion.id,
    }

    r = api.post("/api/usuarios", headers=sesion, json=datos)
    assert r.status_code == 201
    creado = r.json()
    assert creado["nombre"] == "Ana Pérez"
    assert creado["email"] == "ana.perez@hextructure.com"
    assert creado["estado"] == "pendiente"
    assert creado["debe_cambiar_password"] is True
    assert creado["perfil"]["nombre"] == "Personal de Producción"

    assert api.post("/api/usuarios", headers=sesion, json=datos).status_code == 409
    debil = {**datos, "email": "otro@example.com", "password_temporal": "12345678"}
    assert api.post("/api/usuarios", headers=sesion, json=debil).status_code == 422
    sin_perfil = {**datos, "email": "otro@example.com", "perfil_id": 999999}
    assert api.post("/api/usuarios", headers=sesion, json=sin_perfil).status_code == 422


def test_filtros_del_listado_de_usuarios(api, db):
    gerente = crear_usuario(db, nombre="Santiago Gerente")
    produccion = perfil_produccion(db)
    crear_usuario(db, perfil=produccion, nombre="Operario Activo")
    crear_usuario(db, perfil=produccion, nombre="Operario Nuevo", debe_cambiar_password=True)
    crear_usuario(db, perfil=produccion, nombre="Operario Retirado", activo=False)
    sesion = cabecera(gerente)

    def nombres(**params):
        return {u["nombre"] for u in api.get("/api/usuarios", headers=sesion, params=params).json()}

    assert {"Operario Activo", "Operario Nuevo", "Operario Retirado"} <= nombres(perfil_id=produccion.id)
    assert "Santiago Gerente" not in nombres(perfil_id=produccion.id)
    assert nombres(q="retirado") == {"Operario Retirado"}
    assert "Operario Nuevo" in nombres(estado="pendiente")
    assert "Operario Nuevo" not in nombres(estado="activo")
    assert nombres(estado="inactivo") >= {"Operario Retirado"}


def test_sin_acceso_total_no_se_puede_tocar_a_un_gerente(api, db):
    gerente = crear_usuario(db)
    # Puede administrar al personal de producción porque tiene sus mismos permisos
    admin = crear_usuario(db, perfil=perfil_personalizado(db, Permiso.USUARIOS, Permiso.DESPACHO, Permiso.RECEPCION))
    sesion = cabecera(admin)
    nuevo_gerente = {
        "nombre": "Intruso",
        "email": "intruso@example.com",
        "password_temporal": "Temporal1",
        "perfil_id": perfil_gerente(db).id,
    }

    assert api.post("/api/usuarios", headers=sesion, json=nuevo_gerente).status_code == 403
    assert api.patch(f"/api/usuarios/{gerente.id}", headers=sesion, json={"activo": False}).status_code == 403
    r = api.put(f"/api/usuarios/{gerente.id}/password", headers=sesion, json={"password_temporal": "Temporal1"})
    assert r.status_code == 403

    # A un usuario normal sí lo administra, pero no lo asciende a gerente
    operario = crear_usuario(db, perfil=perfil_produccion(db))
    ascenso = api.patch(f"/api/usuarios/{operario.id}", headers=sesion, json={"perfil_id": perfil_gerente(db).id})
    assert ascenso.status_code == 403
    assert api.patch(f"/api/usuarios/{operario.id}", headers=sesion, json={"nombre": "Op"}).status_code == 200


def test_nadie_se_quita_su_propio_acceso(api, db):
    gerente = crear_usuario(db)
    sesion = cabecera(gerente)

    assert api.patch(f"/api/usuarios/{gerente.id}", headers=sesion, json={"activo": False}).status_code == 403
    cambio = {"perfil_id": perfil_produccion(db).id}
    assert api.patch(f"/api/usuarios/{gerente.id}", headers=sesion, json=cambio).status_code == 403
    r = api.put(f"/api/usuarios/{gerente.id}/password", headers=sesion, json={"password_temporal": "Temporal1"})
    assert r.status_code == 403


def test_siempre_queda_un_gerente_activo(db):
    """
    Por la API no se llega a este caso (nadie se desactiva a sí mismo y
    solo un gerente modifica a otro); la regla protege igual al servicio.
    """
    unico = crear_usuario(db)
    actor = crear_usuario(db, activo=False)  # gerente inactivo: no cuenta

    with pytest.raises(seguridad.Conflicto, match="al menos un usuario activo"):
        seguridad.actualizar_usuario(db, actor, unico, UsuarioActualizar(activo=False))


def test_restablecer_contraseña(api, db):
    gerente = crear_usuario(db)
    operario = crear_usuario(
        db,
        perfil=perfil_produccion(db),
        bloqueado_hasta=datetime.now(timezone.utc) + timedelta(minutes=10),
        intentos_fallidos=3,
    )
    sesion_vieja = cabecera(operario)

    r = api.put(
        f"/api/usuarios/{operario.id}/password",
        headers=cabecera(gerente),
        json={"password_temporal": "Temporal1"},
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "pendiente"
    assert r.json()["bloqueado"] is False

    assert api.get("/api/auth/yo", headers=sesion_vieja).status_code == 401
    assert login(api, operario.email, "Temporal1").status_code == 200
    assert login(api, operario.email, PASSWORD).status_code == 401


def test_cambiar_correo_respeta_unicidad(api, db):
    gerente = crear_usuario(db)
    otro = crear_usuario(db, perfil=perfil_produccion(db))
    sesion = cabecera(gerente)

    duplicado = api.patch(f"/api/usuarios/{otro.id}", headers=sesion, json={"email": gerente.email.upper()})
    assert duplicado.status_code == 409
    r = api.patch(f"/api/usuarios/{otro.id}", headers=sesion, json={"email": "Nuevo@Example.com"})
    assert r.status_code == 200
    assert r.json()["email"] == "nuevo@example.com"


# ─── No escalar privilegios (revisión de Esteban, PR #31) ──


def test_nadie_modifica_su_propio_perfil(api, db):
    soporte = perfil_personalizado(db, Permiso.PERFILES)
    sesion = cabecera(crear_usuario(db, perfil=soporte))

    todos = [p.value for p in Permiso]
    assert api.patch(f"/api/perfiles/{soporte.id}", headers=sesion, json={"permisos": todos}).status_code == 403
    assert api.patch(f"/api/perfiles/{soporte.id}", headers=sesion, json={"descripcion": "x"}).status_code == 403
    db.refresh(soporte)
    assert soporte.permisos == {"perfiles"}


def test_solo_se_otorgan_permisos_propios(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.PERFILES, Permiso.CLIENTES)))
    otro = perfil_personalizado(db, Permiso.HISTORIAL, Permiso.PRECIOS)

    agrega_ajeno = api.patch(f"/api/perfiles/{otro.id}", headers=sesion, json={"permisos": ["historial", "precios", "usuarios"]})
    assert agrega_ajeno.status_code == 403
    assert "usuarios" in agrega_ajeno.json()["detail"]

    # Agregar uno propio y quitar uno ajeno sí se permite
    r = api.patch(f"/api/perfiles/{otro.id}", headers=sesion, json={"permisos": ["historial", "clientes"]})
    assert r.status_code == 200
    assert r.json()["permisos"] == ["clientes", "historial"]

    assert api.post("/api/perfiles", headers=sesion, json={"nombre": "Escala", "permisos": ["usuarios"]}).status_code == 403
    assert api.post("/api/perfiles", headers=sesion, json={"nombre": "Comercial", "permisos": ["clientes"]}).status_code == 201


def test_no_se_asigna_ni_administra_un_perfil_con_mas_permisos(api, db):
    sesion = cabecera(crear_usuario(db, perfil=perfil_personalizado(db, Permiso.USUARIOS, Permiso.CLIENTES)))
    mayor = perfil_personalizado(db, Permiso.CLIENTES, Permiso.PRECIOS)
    menor = perfil_personalizado(db, Permiso.CLIENTES)
    alta = {"nombre": "Nuevo", "email": "nuevo@example.com", "password_temporal": "Temporal1"}

    assert api.post("/api/usuarios", headers=sesion, json={**alta, "perfil_id": mayor.id}).status_code == 403
    assert api.post("/api/usuarios", headers=sesion, json={**alta, "perfil_id": menor.id}).status_code == 201

    # Tomar la cuenta de alguien con más permisos tampoco
    jefe = crear_usuario(db, perfil=mayor)
    assert api.patch(f"/api/usuarios/{jefe.id}", headers=sesion, json={"activo": False}).status_code == 403
    r = api.put(f"/api/usuarios/{jefe.id}/password", headers=sesion, json={"password_temporal": "Temporal1"})
    assert r.status_code == 403


# ─── Tiempo de respuesta del login (revisión de Esteban, PR #31) ──


def test_login_hace_el_mismo_trabajo_exista_o_no_el_correo(db):
    usuario = crear_usuario(db)
    db.commit()  # dentro del savepoint del test; se revierte al final
    conexion = db.connection()

    def sentencias_de(email: str) -> list[str]:
        vistas: list[str] = []

        def anotar(conn, cursor, sentencia, parametros, contexto, many):
            # Los SAVEPOINT son del aislamiento de las pruebas, no del login
            if not sentencia.lstrip().upper().startswith(("SAVEPOINT", "RELEASE", "ROLLBACK")):
                vistas.append(sentencia)

        event.listen(conexion, "before_cursor_execute", anotar)
        try:
            with pytest.raises(servicio_auth.CredencialesInvalidas):
                servicio_auth.autenticar(db, email, "Incorrecta1")
        finally:
            event.remove(conexion, "before_cursor_execute", anotar)
        return vistas

    existe = sentencias_de(usuario.email)
    no_existe = sentencias_de("nadie-registrado@example.com")

    assert existe == no_existe
    assert any(s.lstrip().upper().startswith("UPDATE") for s in existe)


# ─── Carrera al desactivar gerentes (revisión de Esteban, PR #31) ──


def test_dos_desactivaciones_simultaneas_no_dejan_sin_gerente(_engine):
    """
    A desactiva a B mientras B desactiva a A. Sin el bloqueo, cada uno
    cuenta 2 gerentes activos y ambos pasan. Con FOR UPDATE, la segunda
    transacción espera y, al continuar, ya ve un solo gerente.
    """
    from sqlalchemy.orm import Session as Sesion

    with Sesion(_engine) as preparar:
        perfil = Perfil(nombre="Gerente carrera", clave="gerente_carrera", acceso_total=True)
        preparar.add(perfil)
        preparar.flush()
        a = Usuario(nombre="A", email="carrera-a@example.com", password_hash=hash_password("Clave1234"), perfil_id=perfil.id)
        b = Usuario(nombre="B", email="carrera-b@example.com", password_hash=hash_password("Clave1234"), perfil_id=perfil.id)
        preparar.add_all([a, b])
        preparar.commit()
        ids = (a.id, b.id, perfil.id)

    resultado: dict[str, object] = {}
    primera = Sesion(_engine)
    segunda = Sesion(_engine)
    try:

        # La primera transacción cuenta (y bloquea) antes de desactivar
        assert seguridad._gerentes_activos(primera) >= 2

        def b_desactiva_a_a():
            try:
                actor_b = segunda.get(Usuario, ids[1])
                objetivo_a = segunda.get(Usuario, ids[0])
                seguridad.actualizar_usuario(segunda, actor_b, objetivo_a, UsuarioActualizar(activo=False))
                resultado["segunda"] = "desactivó"
            except seguridad.Conflicto as exc:
                resultado["segunda"] = exc.mensaje
            finally:
                segunda.rollback()

        hilo = threading.Thread(target=b_desactiva_a_a)
        hilo.start()
        time.sleep(0.5)
        assert hilo.is_alive(), "la segunda transacción debía esperar el bloqueo"

        objetivo_b = primera.get(Usuario, ids[1])
        objetivo_b.activo = False
        primera.commit()

        hilo.join(timeout=10)
        assert "al menos un usuario activo" in str(resultado.get("segunda"))
    finally:
        # Cerrar siempre: una transacción abierta bloquearía el drop_all final
        primera.rollback()
        primera.close()
        if "hilo" in locals():
            hilo.join(timeout=10)
        segunda.close()
        with Sesion(_engine) as limpiar:
            limpiar.execute(delete(Usuario).where(Usuario.id.in_(ids[:2])))
            limpiar.execute(delete(Perfil).where(Perfil.id == ids[2]))
            limpiar.commit()


# ─── Detalles de la segunda revisión (Esteban, PR #31) ──


def test_cambiar_la_propia_contraseña_levanta_el_bloqueo(api, db):
    usuario = crear_usuario(db, intentos_fallidos=3, bloqueado_hasta=datetime.now(timezone.utc) + timedelta(minutes=10))

    r = api.post(
        "/api/auth/cambiar-password",
        headers=cabecera(usuario),
        json={"password_actual": PASSWORD, "password_nueva": "NuevaClave9"},
    )
    assert r.status_code == 200
    assert r.json()["usuario"]["bloqueado"] is False
    db.refresh(usuario)
    assert usuario.intentos_fallidos == 0
    assert login(api, usuario.email, "NuevaClave9").status_code == 200


@pytest.mark.parametrize("nombre", ["  ", " a ", "\t \n"])
def test_nombre_de_solo_espacios_se_rechaza(api, db, nombre):
    sesion = cabecera(crear_usuario(db))
    otro = crear_usuario(db, perfil=perfil_produccion(db))
    alta = {"nombre": nombre, "email": "espacios@example.com", "password_temporal": "Temporal1", "perfil_id": perfil_produccion(db).id}

    assert api.post("/api/usuarios", headers=sesion, json=alta).status_code == 422
    assert api.patch(f"/api/usuarios/{otro.id}", headers=sesion, json={"nombre": nombre}).status_code == 422


def test_eliminar_perfil_que_recibe_usuarios_a_ultimo_momento_da_409(api, db, monkeypatch):
    sesion = cabecera(crear_usuario(db))
    perfil = perfil_personalizado(db, Permiso.CLIENTES)
    crear_usuario(db, perfil=perfil)
    # Simula la carrera: el conteo no ve al usuario que se asignó justo después
    monkeypatch.setattr(seguridad, "contar_usuarios", lambda *_: 0)

    r = api.delete(f"/api/perfiles/{perfil.id}", headers=sesion)
    assert r.status_code == 409
    assert "acaba de recibir usuarios" in r.json()["detail"]
