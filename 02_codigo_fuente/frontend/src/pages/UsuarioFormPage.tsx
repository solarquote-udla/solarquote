/**
 * Seguridad → Usuarios → Nuevo usuario / Editar usuario (RF-11).
 *
 * Alta (prototipo): nombre completo, correo institucional, contraseña
 * temporal y perfil de acceso elegido en tarjetas. El usuario deberá
 * cambiar la contraseña al primer acceso (DS-07).
 *
 * Edición: los mismos datos sin la contraseña (se restablece desde la
 * lista). Nadie cambia su propio perfil ni desactiva su propia cuenta, y
 * el perfil Gerente General solo lo asigna quien tiene acceso total: el
 * backend lo impone, aquí se deshabilita para no ofrecer lo imposible.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Interruptor } from "@/components/Interruptor";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { actualizarUsuario, crearUsuario, listarPerfiles, obtenerUsuario } from "@/services/seguridad";
import type { Perfil, Usuario } from "@/types/api";
import { generarPasswordTemporal, problemaDePassword } from "@/utils/password";

const claseCampo =
  "mt-1.5 w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resumenPerfil(perfil: Perfil): string {
  if (perfil.acceso_total) return "Acceso total a todos los módulos";
  if (perfil.permisos.length === 0) return "Solo Dashboard";
  return `${perfil.permisos.length} opción${perfil.permisos.length === 1 ? "" : "es"} del menú`;
}

/**
 * La clave reinicia el formulario al pasar de un usuario a otro (o al
 * alta): sin ella quedarían los errores y campos del anterior.
 */
export function UsuarioFormPage() {
  const { usuarioId } = useParams();
  return <FormularioUsuario key={usuarioId ?? "nuevo"} usuarioId={usuarioId} />;
}

const normalizarNombre = (valor: string) => valor.trim().replace(/\s+/g, " ");
const normalizarEmail = (valor: string) => valor.trim().toLowerCase();

function FormularioUsuario({ usuarioId }: { usuarioId: string | undefined }) {
  const esNuevo = usuarioId === undefined;
  const { usuario: yo, refrescarSesion } = useAuth();
  const navegar = useNavigate();

  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [original, setOriginal] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [activo, setActivo] = useState(true);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    Promise.all([listarPerfiles(), esNuevo ? Promise.resolve(null) : obtenerUsuario(Number(usuarioId))])
      .then(([lista, existente]) => {
        if (cancelado) return;
        setPerfiles(lista);
        if (existente) {
          setOriginal(existente);
          setNombre(existente.nombre);
          setEmail(existente.email);
          setPerfilId(existente.perfil.id);
          setActivo(existente.activo);
        }
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudo cargar el formulario"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [esNuevo, usuarioId]);

  const soyYo = original !== null && original.id === yo?.id;
  const tengoAccesoTotal = yo?.perfil.acceso_total ?? false;
  const misPermisos = new Set(yo?.permisos ?? []);
  /** No se asigna un perfil con más permisos que el propio (DS-06). */
  const excedeMisPermisos = (p: Perfil) =>
    !tengoAccesoTotal && (p.acceso_total || p.permisos.some((permiso) => !misPermisos.has(permiso)));

  const errores = {
    nombre: nombre.trim().length < 2 ? "Ingresa el nombre completo" : null,
    email: !EMAIL_VALIDO.test(email.trim()) ? "Ingresa un correo válido" : null,
    password: esNuevo ? problemaDePassword(password) : null,
    perfil: perfilId === null ? "Elige un perfil" : null,
  };
  const valido = Object.values(errores).every((e) => e === null);

  async function manejarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setIntentado(true);
    setError(null);
    if (!valido || perfilId === null) return;

    setGuardando(true);
    try {
      if (esNuevo) {
        const creado = await crearUsuario({
          nombre: normalizarNombre(nombre),
          email: normalizarEmail(email),
          password_temporal: password,
          perfil_id: perfilId,
        });
        void navegar("/seguridad/usuarios", {
          state: {
            aviso: `Usuario ${creado.nombre} creado. Entrégale la contraseña temporal por un canal seguro; deberá cambiarla al ingresar.`,
          },
        });
      } else if (original) {
        const cambios = {
          ...(normalizarNombre(nombre) !== original.nombre ? { nombre: normalizarNombre(nombre) } : {}),
          ...(normalizarEmail(email) !== original.email ? { email: normalizarEmail(email) } : {}),
          ...(perfilId !== original.perfil.id ? { perfil_id: perfilId } : {}),
          ...(activo !== original.activo ? { activo } : {}),
        };
        const guardado = await actualizarUsuario(original.id, cambios);
        if (soyYo) await refrescarSesion();
        void navegar("/seguridad/usuarios", { state: { aviso: `Cambios guardados en ${guardado.nombre}.` } });
      }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar el usuario"));
    } finally {
      setGuardando(false);
    }
  }

  const mostrar = (campo: keyof typeof errores) => (intentado ? errores[campo] : null);

  if (cargando) return <p className="text-sm text-acero-500">Cargando…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="text-sm text-acero-500">
        <span>Configuración</span>
        <span className="mx-2">/</span>
        <Link to="/seguridad/usuarios" className="hover:text-solar-700 hover:underline">
          Usuarios
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">{esNuevo ? "Nuevo usuario" : "Editar usuario"}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold text-acero-900">{esNuevo ? "Nuevo usuario" : original?.nombre}</h1>
      <p className="mt-1 text-sm text-acero-500">
        {esNuevo
          ? "El usuario ingresará con la contraseña temporal y deberá cambiarla en su primer acceso."
          : "La contraseña se restablece desde la lista de usuarios."}
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void manejarEnvio(e)} noValidate className="mt-6 space-y-6">
        <section className="rounded-xl border border-acero-200 bg-superficie p-6">
          <h2 className="text-sm font-semibold text-acero-800">Datos de la cuenta</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-acero-700">
              Nombre completo *
              <input
                className={claseCampo}
                value={nombre}
                maxLength={120}
                autoFocus={esNuevo}
                placeholder="Ej. Ana Pérez"
                onChange={(e) => setNombre(e.target.value)}
              />
              {mostrar("nombre") && <span className="mt-1 block text-xs font-normal text-red-600">{errores.nombre}</span>}
            </label>
            <label className="block text-sm font-medium text-acero-700">
              Correo institucional *
              <input
                type="email"
                className={claseCampo}
                value={email}
                maxLength={255}
                autoComplete="off"
                placeholder="nombre@hextructure.com"
                onChange={(e) => setEmail(e.target.value)}
              />
              {mostrar("email") && <span className="mt-1 block text-xs font-normal text-red-600">{errores.email}</span>}
            </label>
          </div>

          {esNuevo && (
            <label className="mt-4 block text-sm font-medium text-acero-700">
              Contraseña temporal *
              <div className="flex gap-2">
                <input
                  type={verPassword ? "text" : "password"}
                  className={`${claseCampo} font-mono`}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  className="mt-1.5 shrink-0 rounded-lg border border-acero-300 px-3 text-xs text-acero-700 hover:bg-acero-100"
                >
                  {verPassword ? "Ocultar" : "Ver"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(generarPasswordTemporal());
                    setVerPassword(true);
                  }}
                  className="mt-1.5 shrink-0 rounded-lg border border-acero-300 px-3 text-xs text-acero-700 hover:bg-acero-100"
                >
                  Generar
                </button>
              </div>
              <span
                className={`mt-1 block text-xs font-normal ${mostrar("password") ? "text-red-600" : "text-acero-500"}`}
              >
                {mostrar("password") ??
                  "Mín. 8 caracteres, con letras y números · el usuario deberá cambiarla al primer acceso"}
              </span>
            </label>
          )}

          {!esNuevo && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-acero-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-acero-800">Cuenta activa</p>
                <p className="text-xs text-acero-500">
                  {soyYo
                    ? "No puedes desactivar tu propia cuenta."
                    : "Al desactivarla se cierran sus sesiones; sus proyectos se conservan."}
                </p>
              </div>
              <Interruptor etiqueta="Cuenta activa" activo={activo} deshabilitado={soyYo} onCambiar={setActivo} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-acero-200 bg-superficie p-6">
          <h2 className="text-sm font-semibold text-acero-800">Perfil de acceso *</h2>
          <p className="mt-1 text-xs text-acero-500">
            {soyYo ? "No puedes cambiar tu propio perfil." : "Define qué opciones del menú verá el usuario."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Perfil de acceso">
            {perfiles.map((p) => {
              const bloqueado = soyYo || excedeMisPermisos(p);
              const elegido = perfilId === p.id;
              return (
                <label
                  key={p.id}
                  className={[
                    "flex cursor-pointer gap-3 rounded-xl border p-4 transition",
                    elegido ? "border-solar-500 bg-solar-50" : "border-acero-200 hover:border-acero-300",
                    bloqueado && !elegido ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="perfil"
                    className="mt-1 h-4 w-4 accent-solar-500"
                    checked={elegido}
                    disabled={bloqueado}
                    onChange={() => setPerfilId(p.id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-acero-900">{p.nombre}</span>
                    <span className="block text-xs text-acero-500">{p.descripcion ?? resumenPerfil(p)}</span>
                    {p.descripcion && <span className="mt-1 block text-xs text-acero-400">{resumenPerfil(p)}</span>}
                    {!soyYo && excedeMisPermisos(p) && (
                      <span className="mt-1 block text-xs text-acero-400">Tiene permisos que tu perfil no tiene</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {mostrar("perfil") && <p className="mt-2 text-xs text-red-600">{errores.perfil}</p>}
        </section>

        <div className="flex justify-end gap-2">
          <Link
            to="/seguridad/usuarios"
            className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-solar-500 px-5 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Guardando…" : esNuevo ? "Crear usuario" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
