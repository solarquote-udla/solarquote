/**
 * Seguridad → Usuarios (RF-11).
 *
 * Indicadores, búsqueda, filtros por perfil y estado, y las acciones de
 * cada cuenta: editar, restablecer la contraseña y activar o desactivar.
 * Los usuarios no se eliminan (baja lógica).
 *
 * El equipo de HEXtructure es de pocas personas: se trae la lista completa
 * una vez y se filtra aquí, así los indicadores siempre cuentan el total.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import { actualizarUsuario, listarPerfiles, listarUsuarios, restablecerPassword } from "@/services/seguridad";
import type { EstadoUsuario, Perfil, Usuario } from "@/types/api";
import { fechaHora } from "@/utils/fechas";
import { generarPasswordTemporal } from "@/utils/password";

const ETIQUETA_ESTADO: Record<EstadoUsuario, string> = {
  activo: "Activo",
  pendiente: "Pendiente",
  inactivo: "Inactivo",
};

const CLASE_ESTADO: Record<EstadoUsuario, string> = {
  activo: "bg-green-100 text-green-800",
  pendiente: "bg-amber-100 text-amber-900",
  inactivo: "bg-acero-200 text-acero-600",
};

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

interface EstadoNavegacion {
  aviso?: string;
}

/** Contraseña temporal recién asignada, para mostrarla una sola vez. */
interface Restablecida {
  usuario: Usuario;
  password: string;
}

export function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const ubicacion = useLocation();
  const navegar = useNavigate();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(
    (ubicacion.state as EstadoNavegacion | null)?.aviso ?? null,
  );
  const [recarga, setRecarga] = useState(0);

  const [buscar, setBuscar] = useState("");
  const [perfilId, setPerfilId] = useState<number | "">("");
  const [estado, setEstado] = useState<EstadoUsuario | "">("");

  const [procesando, setProcesando] = useState<number | null>(null);
  const [restableciendo, setRestableciendo] = useState<number | null>(null);
  const [restablecida, setRestablecida] = useState<Restablecida | null>(null);
  const [copiada, setCopiada] = useState(false);
  const unaVez = useAccionUnica();
  // Salir sin copiar la contraseña temporal obligaría a restablecerla otra vez
  useCambiosSinGuardar(
    restablecida !== null && !copiada,
    "La contraseña temporal no se volverá a mostrar y no la copiaste. ¿Salir de todas formas?",
  );

  // El aviso que llega desde el formulario se muestra una vez
  useEffect(() => {
    if ((ubicacion.state as EstadoNavegacion | null)?.aviso) {
      void navegar(ubicacion.pathname, { replace: true, state: null });
    }
  }, [ubicacion, navegar]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([listarUsuarios(), listarPerfiles()])
      .then(([listaUsuarios, listaPerfiles]) => {
        if (cancelado) return;
        setUsuarios(listaUsuarios);
        setPerfiles(listaPerfiles);
        setError(null);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los usuarios"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  const indicadores = useMemo(
    () => ({
      total: usuarios.length,
      activos: usuarios.filter((u) => u.estado === "activo").length,
      inactivos: usuarios.filter((u) => u.estado === "inactivo").length,
      pendientes: usuarios.filter((u) => u.estado === "pendiente").length,
    }),
    [usuarios],
  );

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    return usuarios.filter(
      (u) =>
        (!texto || u.nombre.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto)) &&
        (perfilId === "" || u.perfil.id === perfilId) &&
        (estado === "" || u.estado === estado),
    );
  }, [usuarios, buscar, perfilId, estado]);

  const perfilesPorId = useMemo(() => new Map(perfiles.map((p) => [p.id, p])), [perfiles]);

  /**
   * Sin acceso total, solo se administra a quien no tiene más permisos que
   * uno (DS-06): un Gerente General, o un perfil con permisos que el mío no
   * tiene, queda fuera. El backend aplica la misma regla.
   */
  function motivoNoAdministrable(u: Usuario): string | null {
    if (yo?.perfil.acceso_total) return null;
    if (u.perfil.acceso_total) return "Solo un Gerente General";
    const perfil = perfilesPorId.get(u.perfil.id);
    const mios = new Set(yo?.permisos ?? []);
    if (!perfil || perfil.permisos.some((p) => !mios.has(p))) return "Tiene permisos que tu perfil no tiene";
    return null;
  }

  async function cambiarActivo(u: Usuario) {
    setProcesando(u.id);
    setError(null);
    setAviso(null);
    try {
      await actualizarUsuario(u.id, { activo: !u.activo });
      setAviso(
        u.activo
          ? `${u.nombre} fue desactivado. Sus sesiones abiertas se cerraron.`
          : `${u.nombre} está activo otra vez.`,
      );
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cambiar el estado del usuario"));
    } finally {
      setProcesando(null);
    }
  }

  /**
   * La contraseña temporal en pantalla no se vuelve a mostrar: antes de
   * ocultarla o de abrir otro restablecimiento sin haberla copiado, se pregunta.
   */
  function descartarContrasenaMostrada(): boolean {
    if (restablecida === null || copiada) return true;
    return window.confirm(
      `La contraseña temporal de ${restablecida.usuario.nombre} no se copió y no se volverá a mostrar. ¿Descartarla?`,
    );
  }

  async function restablecer(u: Usuario) {
    const password = generarPasswordTemporal();
    setProcesando(u.id);
    setError(null);
    setAviso(null);
    try {
      await restablecerPassword(u.id, password);
      setRestableciendo(null);
      setRestablecida({ usuario: u, password });
      setCopiada(false);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo restablecer la contraseña"));
    } finally {
      setProcesando(null);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }

  const tarjetas: { etiqueta: string; valor: number; filtro: EstadoUsuario | "" }[] = [
    { etiqueta: "Usuarios totales", valor: indicadores.total, filtro: "" },
    { etiqueta: "Activos", valor: indicadores.activos, filtro: "activo" },
    { etiqueta: "Inactivos", valor: indicadores.inactivos, filtro: "inactivo" },
    { etiqueta: "Pendiente revisión", valor: indicadores.pendientes, filtro: "pendiente" },
  ];

  const claseFiltro =
    "rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="text-sm text-acero-500">
        <span>Configuración</span>
        <span className="mx-2">/</span>
        <span>Seguridad</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Usuarios</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Usuarios</h1>
          <p className="mt-1 text-sm text-acero-500">Cuentas de acceso y el perfil de cada una — RF-11</p>
        </div>
        <Link
          to="/seguridad/usuarios/nuevo"
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600"
        >
          + Nuevo usuario
        </Link>
      </div>

      {/* ─── Indicadores ──────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <button
            key={t.etiqueta}
            type="button"
            onClick={() => setEstado(t.filtro)}
            className={[
              "rounded-xl border p-4 text-left transition",
              estado === t.filtro ? "border-solar-500 bg-solar-50" : "border-acero-200 bg-superficie hover:border-acero-300",
            ].join(" ")}
          >
            <p className="text-xs font-medium text-acero-500">{t.etiqueta}</p>
            <p className="mt-1 text-2xl font-bold text-acero-900">{cargando ? "–" : t.valor}</p>
          </button>
        ))}
      </div>

      {(error || aviso) && (
        <div
          role={error ? "alert" : "status"}
          className={[
            "mt-4 rounded-lg border px-4 py-3 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800",
          ].join(" ")}
        >
          {error ?? aviso}
        </div>
      )}

      {restablecida && (
        <div role="status" className="mt-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-800">
          <p>
            Nueva contraseña temporal de <strong>{restablecida.usuario.nombre}</strong>. Entrégasela por un canal
            seguro: no se volverá a mostrar y deberá cambiarla al ingresar.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded bg-acero-50 px-3 py-1.5 font-mono text-base text-acero-900">
              {restablecida.password}
            </code>
            <button
              type="button"
              onClick={() => void copiar(restablecida.password)}
              className="rounded-md border border-solar-300 px-2.5 py-1 text-xs font-medium hover:bg-solar-100"
            >
              {copiada ? "Copiada" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (descartarContrasenaMostrada()) setRestablecida(null);
              }}
              className="text-xs hover:underline"
            >
              Ocultar
            </button>
          </div>
        </div>
      )}

      {/* ─── Filtros ──────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className={`w-full max-w-sm ${claseFiltro}`}
          placeholder="Buscar por nombre o correo"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          aria-label="Buscar usuarios"
        />
        <select
          className={claseFiltro}
          value={perfilId}
          onChange={(e) => setPerfilId(e.target.value ? Number(e.target.value) : "")}
          aria-label="Filtrar por perfil"
        >
          <option value="">Todos los perfiles</option>
          {perfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          className={claseFiltro}
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoUsuario | "")}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="pendiente">Pendiente</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>

      {/* ─── Listado ──────────────────────────────────── */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-acero-200 bg-superficie">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando usuarios…</p>
        ) : visibles.length === 0 ? (
          <p className="p-10 text-center text-sm font-medium text-acero-700">
            {usuarios.length === 0 ? "Todavía no hay usuarios" : "Ningún usuario coincide con los filtros"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-200">
              {visibles.map((u) => {
                const soyYo = u.id === yo?.id;
                const motivo = motivoNoAdministrable(u);
                return (
                  <tr key={u.id} className={u.activo ? "hover:bg-acero-100/40" : "text-acero-400"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-solar-100 text-xs font-semibold text-solar-700">
                          {iniciales(u.nombre)}
                        </span>
                        <span className={u.activo ? "font-medium text-acero-800" : ""}>
                          {u.nombre}
                          {soyYo && <span className="ml-1.5 text-xs font-normal text-acero-400">(tú)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-acero-600">{u.email}</td>
                    <td className="px-4 py-3">{u.perfil.nombre}</td>
                    <td className="px-4 py-3 text-xs text-acero-500">{fechaHora(u.ultimo_acceso, "Nunca")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[u.estado]}`}>
                        {ETIQUETA_ESTADO[u.estado]}
                      </span>
                      {u.bloqueado && (
                        <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Bloqueado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {motivo ? (
                        <span className="text-xs text-acero-400">{motivo}</span>
                      ) : restableciendo === u.id ? (
                        <div className="ml-auto max-w-xs text-left">
                          <p className="text-xs text-acero-700">
                            Se generará una contraseña temporal, se desbloqueará la cuenta y se cerrarán sus sesiones.
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setRestableciendo(null)}
                              className="rounded-md border border-acero-300 px-2.5 py-1 text-xs text-acero-700 hover:bg-acero-100"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={procesando === u.id}
                              onClick={() => void unaVez(`restablecer-${u.id}`, () => restablecer(u))}
                              className="rounded-md bg-solar-500 px-2.5 py-1 text-xs font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
                            >
                              Restablecer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3 whitespace-nowrap">
                          <Link to={`/seguridad/usuarios/${u.id}`} className="font-medium text-solar-700 hover:underline">
                            Editar
                          </Link>
                          {!soyYo && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!descartarContrasenaMostrada()) return;
                                  setRestablecida(null);
                                  setRestableciendo(u.id);
                                }}
                                className="text-acero-500 hover:text-acero-800"
                              >
                                Restablecer contraseña
                              </button>
                              <button
                                type="button"
                                disabled={procesando === u.id}
                                onClick={() => void unaVez(`activo-${u.id}`, () => cambiarActivo(u))}
                                className={[
                                  "disabled:opacity-50",
                                  u.activo ? "text-acero-500 hover:text-red-600" : "font-medium text-solar-700 hover:underline",
                                ].join(" ")}
                              >
                                {u.activo ? "Desactivar" : "Activar"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
