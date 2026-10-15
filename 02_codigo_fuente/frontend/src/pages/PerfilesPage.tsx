/**
 * Seguridad → Perfiles (RF-11).
 *
 * A la izquierda, los perfiles; a la derecha, los permisos del elegido como
 * interruptores agrupados igual que el menú (CÁLCULO, OPERACIONES,
 * CONFIGURACIÓN). Reglas que impone el backend y aquí solo se reflejan:
 *   - Gerente General: acceso total, solo lectura.
 *   - Perfiles del sistema: no se renombran ni se eliminan.
 *   - Un perfil con usuarios no se elimina.
 *   - Sin acceso total: nadie modifica su propio perfil ni otorga
 *     permisos que su perfil no tiene (sí puede quitarlos).
 * Ver DS-06 en DECISIONES-SEGURIDAD.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Interruptor } from "@/components/Interruptor";
import { useAuth } from "@/hooks/useAuth";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import {
  actualizarPerfil,
  crearPerfil,
  eliminarPerfil,
  listarPerfiles,
  listarPermisos,
} from "@/services/seguridad";
import type { Perfil, Permiso, PermisoCatalogo } from "@/types/api";

const GRUPOS: PermisoCatalogo["grupo"][] = ["CÁLCULO", "OPERACIONES", "CONFIGURACIÓN"];

interface Borrador {
  nombre: string;
  descripcion: string;
  permisos: Set<Permiso>;
}

/** null = nada elegido; "nuevo" = alta; número = id del perfil */
type Seleccion = null | "nuevo" | number;

function borradorDe(perfil: Perfil | null): Borrador {
  return {
    nombre: perfil?.nombre ?? "",
    descripcion: perfil?.descripcion ?? "",
    permisos: new Set(perfil?.permisos ?? []),
  };
}

function mismosPermisos(a: Set<Permiso>, b: Set<Permiso>): boolean {
  return a.size === b.size && [...a].every((p) => b.has(p));
}

function nivelDeAcceso(perfil: Perfil, totalPermisos: number): string {
  if (perfil.acceso_total) return "Acceso total";
  if (perfil.permisos.length === 0) return "Solo Dashboard";
  if (perfil.permisos.length === totalPermisos) return "Todas las opciones";
  return "Restringido";
}

const claseCampo =
  "w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";

export function PerfilesPage() {
  const { usuario, refrescarSesion } = useAuth();

  const [catalogo, setCatalogo] = useState<PermisoCatalogo[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [borrador, setBorrador] = useState<Borrador>(borradorDe(null));
  const [guardando, setGuardando] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const unaVez = useAccionUnica();

  const aplicar = useCallback((permisos: PermisoCatalogo[], lista: Perfil[], elegir?: number) => {
    setCatalogo(permisos);
    setPerfiles(lista);
    const elegido = lista.find((p) => p.id === elegir) ?? lista[0] ?? null;
    setSeleccion(elegido?.id ?? null);
    setBorrador(borradorDe(elegido));
  }, []);

  const cargar = useCallback(
    async (elegir?: number) => {
      const [permisos, lista] = await Promise.all([listarPermisos(), listarPerfiles()]);
      aplicar(permisos, lista, elegir);
    },
    [aplicar],
  );

  useEffect(() => {
    let cancelado = false;
    Promise.all([listarPermisos(), listarPerfiles()])
      .then(([permisos, lista]) => {
        if (!cancelado) aplicar(permisos, lista);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los perfiles"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aplicar]);

  const perfil = typeof seleccion === "number" ? (perfiles.find((p) => p.id === seleccion) ?? null) : null;
  const esNuevo = seleccion === "nuevo";
  const tengoAccesoTotal = usuario?.perfil.acceso_total ?? false;
  const misPermisos = useMemo(() => new Set(usuario?.permisos ?? []), [usuario]);
  const esMiPerfil = !tengoAccesoTotal && perfil !== null && usuario?.perfil.id === perfil.id;
  const soloLectura = (perfil?.acceso_total ?? false) || esMiPerfil;
  /** Encender un permiso que mi perfil no tiene sería escalar privilegios. */
  const puedoActivar = (codigo: Permiso) => tengoAccesoTotal || misPermisos.has(codigo);
  const nombreEditable = esNuevo || (perfil !== null && !perfil.es_sistema && !esMiPerfil);

  const original = useMemo(() => borradorDe(perfil), [perfil]);
  const sucio =
    esNuevo ||
    borrador.nombre !== original.nombre ||
    borrador.descripcion !== original.descripcion ||
    !mismosPermisos(borrador.permisos, original.permisos);

  const nombreValido = borrador.nombre.trim().replace(/\s+/g, " ").length >= 3;

  /**
   * Lo que se perdería al cambiar de perfil o salir. `sucio` siempre es
   * true en un perfil nuevo (habilita "Crear perfil"); aquí un perfil nuevo
   * solo cuenta si se escribió o marcó algo.
   */
  const cambiosPendientes = esNuevo
    ? borrador.nombre.trim() !== "" || borrador.descripcion.trim() !== "" || borrador.permisos.size > 0
    : sucio;
  useCambiosSinGuardar(cambiosPendientes);

  function elegir(nueva: Seleccion) {
    if (cambiosPendientes && !window.confirm("Tienes cambios sin guardar en este perfil. ¿Descartarlos?")) {
      return;
    }
    setAviso(null);
    setError(null);
    setConfirmandoEliminar(false);
    setSeleccion(nueva);
    setBorrador(borradorDe(typeof nueva === "number" ? (perfiles.find((p) => p.id === nueva) ?? null) : null));
  }

  function alternar(permiso: Permiso, activo: boolean) {
    setBorrador((b) => {
      const permisos = new Set(b.permisos);
      if (activo) permisos.add(permiso);
      else permisos.delete(permiso);
      return { ...b, permisos };
    });
  }

  function alternarGrupo(grupo: PermisoCatalogo["grupo"], activo: boolean) {
    setBorrador((b) => {
      const permisos = new Set(b.permisos);
      for (const p of catalogo.filter((c) => c.grupo === grupo)) {
        if (activo && puedoActivar(p.codigo)) permisos.add(p.codigo);
        else if (!activo) permisos.delete(p.codigo);
      }
      return { ...b, permisos };
    });
  }

  async function guardar() {
    if (!esNuevo && !perfil) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const datos = {
        descripcion: borrador.descripcion.trim() || null,
        permisos: [...borrador.permisos],
        ...(nombreEditable ? { nombre: borrador.nombre.trim().replace(/\s+/g, " ") } : {}),
      };
      let guardado: Perfil;
      try {
        guardado = perfil ? await actualizarPerfil(perfil.id, datos) : await crearPerfil(datos);
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo guardar el perfil"));
        return;
      }
      const mensaje = esNuevo ? `Perfil «${guardado.nombre}» creado.` : `Cambios guardados en «${guardado.nombre}».`;
      // Lo de después ya no es "guardar": si falla, el perfil igual quedó guardado
      try {
        await cargar(guardado.id);
        // Si edité mi propio perfil, el menú cambia en el acto
        if (usuario && usuario.perfil.id === guardado.id) await refrescarSesion();
        setAviso(mensaje);
      } catch {
        setAviso(`${mensaje} No se pudo actualizar la pantalla: recárgala para ver los cambios.`);
      }
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!perfil) return;
    setGuardando(true);
    setError(null);
    try {
      await eliminarPerfil(perfil.id);
      setConfirmandoEliminar(false);
      await cargar();
      setAviso(`Perfil «${perfil.nombre}» eliminado.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo eliminar el perfil"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="text-sm text-acero-500">
        <span>Configuración</span>
        <span className="mx-2">/</span>
        <span>Seguridad</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Perfiles</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Perfiles</h1>
          <p className="mt-1 text-sm text-acero-500">
            Cada perfil define qué opciones del menú ven sus usuarios — RF-11
          </p>
        </div>
        <button
          type="button"
          onClick={() => elegir("nuevo")}
          disabled={esNuevo}
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:opacity-50"
        >
          + Nuevo perfil
        </button>
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

      {cargando ? (
        <p className="mt-6 text-sm text-acero-500">Cargando perfiles…</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* ─── Lista de perfiles ───────────────────────── */}
          <ul className="space-y-2">
            {perfiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => elegir(p.id)}
                  className={[
                    "w-full rounded-xl border p-4 text-left transition",
                    seleccion === p.id
                      ? "border-solar-500 bg-solar-50"
                      : "border-acero-200 bg-superficie hover:border-acero-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-acero-900">{p.nombre}</p>
                    <span
                      className={[
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        p.es_sistema ? "bg-acero-200 text-acero-700" : "bg-sky-100 text-sky-800",
                      ].join(" ")}
                    >
                      {p.es_sistema ? "Sistema" : "Personalizado"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-acero-500">
                    {nivelDeAcceso(p, catalogo.length)} · {p.total_usuarios} usuario
                    {p.total_usuarios === 1 ? "" : "s"}
                  </p>
                </button>
              </li>
            ))}
            {esNuevo && (
              <li className="rounded-xl border border-dashed border-solar-500 bg-solar-50 p-4 text-sm font-semibold text-solar-700">
                Nuevo perfil
              </li>
            )}
          </ul>

          {/* ─── Detalle ─────────────────────────────────── */}
          {seleccion === null ? (
            <p className="text-sm text-acero-500">Elige un perfil para ver sus permisos.</p>
          ) : (
            <section className="rounded-xl border border-acero-200 bg-superficie">
              <div className="border-b border-acero-200 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-acero-700">
                    Nombre del perfil
                    <input
                      className={`mt-1.5 ${claseCampo}`}
                      value={borrador.nombre}
                      maxLength={60}
                      disabled={!nombreEditable}
                      placeholder="Ej. Ventas"
                      onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                    />
                    {nombreEditable && borrador.nombre.length > 0 && !nombreValido && (
                      <span className="mt-1 block text-xs font-normal text-red-600">Mínimo 3 caracteres</span>
                    )}
                    {!nombreEditable && (
                      <span className="mt-1 block text-xs font-normal text-acero-400">
                        {esMiPerfil ? "Es tu propio perfil" : "Los perfiles del sistema no se renombran"}
                      </span>
                    )}
                  </label>
                  <label className="block text-sm font-medium text-acero-700">
                    Descripción
                    <input
                      className={`mt-1.5 ${claseCampo}`}
                      value={borrador.descripcion}
                      maxLength={255}
                      disabled={soloLectura}
                      placeholder="Para qué sirve este perfil"
                      onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))}
                    />
                  </label>
                </div>

                {soloLectura && (
                  <p className="mt-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-800">
                    Acceso total: tiene todas las opciones, incluidas las que se agreguen en el futuro. Este perfil no
                    se puede modificar.
                  </p>
                )}
                {esMiPerfil && (
                  <p className="mt-4 rounded-lg border border-acero-300 bg-acero-100 px-4 py-3 text-sm text-acero-700">
                    Es tu propio perfil: sus permisos solo los cambia un Gerente General u otro usuario con el
                    permiso Perfiles.
                  </p>
                )}
                {!soloLectura && !tengoAccesoTotal && (
                  <p className="mt-4 text-xs text-acero-500">
                    Solo puedes activar los permisos que tu perfil también tiene; los demás aparecen bloqueados.
                  </p>
                )}
                {!soloLectura && borrador.permisos.size === 0 && (
                  <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Sin permisos, los usuarios de este perfil solo verán el Dashboard.
                  </p>
                )}
              </div>

              {/* Permisos agrupados como el menú */}
              <div className="divide-y divide-acero-200">
                {GRUPOS.map((grupo) => {
                  const opciones = catalogo.filter((c) => c.grupo === grupo);
                  const activas = opciones.filter((o) => (perfil?.acceso_total ?? false) || borrador.permisos.has(o.codigo)).length;
                  const faltanActivables = opciones.some((o) => !borrador.permisos.has(o.codigo) && puedoActivar(o.codigo));
                  return (
                    <div key={grupo} className="p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold tracking-wider text-acero-400">
                          {grupo} <span className="ml-2 font-normal">{activas} de {opciones.length}</span>
                        </p>
                        {!soloLectura && (
                          <button
                            type="button"
                            onClick={() => alternarGrupo(grupo, faltanActivables)}
                            className="text-xs font-medium text-solar-700 hover:underline"
                          >
                            {faltanActivables ? "Activar todo" : "Quitar todo"}
                          </button>
                        )}
                      </div>
                      <ul className="space-y-3">
                        {opciones.map((opcion) => (
                          <li key={opcion.codigo} className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-acero-800">{opcion.nombre}</p>
                              <p className="text-xs text-acero-500">{opcion.descripcion}</p>
                            </div>
                            <Interruptor
                              etiqueta={opcion.nombre}
                              activo={(perfil?.acceso_total ?? false) || borrador.permisos.has(opcion.codigo)}
                              deshabilitado={soloLectura || (!borrador.permisos.has(opcion.codigo) && !puedoActivar(opcion.codigo))}
                              onCambiar={(activo) => alternar(opcion.codigo, activo)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Acciones */}
              {!soloLectura && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-acero-200 p-6">
                  <div>
                    {perfil && !perfil.es_sistema && !confirmandoEliminar && (
                      <button
                        type="button"
                        onClick={() => setConfirmandoEliminar(true)}
                        disabled={perfil.total_usuarios > 0}
                        title={
                          perfil.total_usuarios > 0
                            ? "Cambia de perfil a sus usuarios antes de eliminarlo"
                            : undefined
                        }
                        className="text-sm text-acero-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-acero-500"
                      >
                        Eliminar perfil
                      </button>
                    )}
                    {perfil && confirmandoEliminar && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-acero-700">¿Eliminar «{perfil.nombre}»?</span>
                        <button
                          type="button"
                          onClick={() => setConfirmandoEliminar(false)}
                          className="rounded-md border border-acero-300 px-2.5 py-1 text-xs text-acero-700 hover:bg-acero-100"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void unaVez(eliminar)}
                          disabled={guardando}
                          className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                    {perfil?.es_sistema && (
                      <span className="text-xs text-acero-400">Perfil del sistema: no se puede eliminar</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {sucio && (
                      <button
                        type="button"
                        onClick={() => {
                          if (esNuevo) elegir(perfiles[0]?.id ?? null);
                          else setBorrador(original);
                        }}
                        className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100"
                      >
                        {esNuevo ? "Cancelar" : "Descartar cambios"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void unaVez(guardar)}
                      disabled={!sucio || guardando || (nombreEditable && !nombreValido)}
                      className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {guardando ? "Guardando…" : esNuevo ? "Crear perfil" : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
