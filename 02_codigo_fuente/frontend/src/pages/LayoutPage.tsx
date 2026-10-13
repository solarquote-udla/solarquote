/**
 * Generación del layout solar — RF-03.
 *
 * El usuario elige L, el pasillo, la tolerancia de proporción y,
 * opcionalmente, una capacidad en kWp. El backend distribuye los bloques
 * y devuelve todo calculado; esta pantalla solo lo muestra. Igual que en
 * terreno y equipo, ninguna cifra se recalcula en el navegador.
 *
 * Edición manual (SQ-64): los bloques se pueden mover, acortar, alargar y
 * eliminar sobre el plano. Se trabaja sobre un borrador local que se
 * valida en vivo con las mismas reglas del backend; al guardar, el
 * backend recalcula tipos, potencia y eléctrica.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { VistaLayout, type BloqueDibujo } from "@/components/VistaLayout";
import { mensajeDeError } from "@/services/api";
import { obtenerEquipo } from "@/services/equipo";
import { generarLayout, guardarBloques, obtenerLayout } from "@/services/layout";
import { obtenerProyecto } from "@/services/proyectos";
import { obtenerTerreno } from "@/services/terreno";
import type { ConfiguracionEquipo, Layout, LayoutGenerar, Proyecto, Punto, Terreno } from "@/types/api";
import {
  redondearMm,
  validarBloques,
  verticesBloque,
  type BloqueEdicion,
  type GeometriaLayout,
} from "@/utils/edicionLayout";
import { formatearArea } from "@/utils/geometria";

/** El arrastre se ajusta al centímetro: más fino no se puede replantear en obra. */
const AJUSTE_ARRASTRE_M = 0.01;

/** Movimiento mínimo para que un arrastre cuente: por debajo es un clic. */
const ZONA_MUERTA_M = 0.05;

/** Desplazamiento con las flechas del teclado; con Shift, 1 m. */
const PASO_TECLADO_M = 0.1;

const ajustar = (v: number) => Math.round(v / AJUSTE_ARRASTRE_M) * AJUSTE_ARRASTRE_M;

/** Misma identidad que usa el backend para contar ediciones. */
const claveIdentidad = (origen: Punto, a: number) =>
  `${origen[0].toFixed(2)}|${origen[1].toFixed(2)}|${a}`;

function contarCambios(original: BloqueEdicion[], borrador: BloqueEdicion[]): number {
  const previos = new Set(original.map((b) => claveIdentidad(b.origen, b.paneles_ancho)));
  const nuevos = new Set(borrador.map((b) => claveIdentidad(b.origen, b.paneles_ancho)));
  const agregados = [...nuevos].filter((k) => !previos.has(k)).length;
  const quitados = [...previos].filter((k) => !nuevos.has(k)).length;
  return Math.max(agregados, quitados);
}

/**
 * Letra de tipo para el borrador, con la misma regla que el backend:
 * el A más repetido es "A", luego el siguiente…
 */
function letrasPorA(bloques: BloqueEdicion[]): Map<number, string> {
  const conteo = new Map<number, number>();
  for (const b of bloques) conteo.set(b.paneles_ancho, (conteo.get(b.paneles_ancho) ?? 0) + 1);
  const orden = [...conteo.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  return new Map(orden.map(([a], i) => [a, i < 26 ? String.fromCharCode(65 + i) : `T${i + 1}`]));
}

const CAMPO =
  "w-full rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

// Mismos valores por defecto que el backend (schemas/layout.py)
const PARAMETROS_DEFECTO = { L: "4", pasillo: "2", tolerancia: "20", kwp: "" };
type Parametros = typeof PARAMETROS_DEFECTO;

const OPCIONES_L = [2, 4, 6, 8, 10, 12];

function desdeLayout(l: Layout | null): Parametros {
  if (!l) return PARAMETROS_DEFECTO;
  return {
    L: String(l.parametros.paneles_largo),
    pasillo: String(l.parametros.pasillo_m),
    tolerancia: String(Math.round(l.parametros.tolerancia_proporcion * 100)),
    kwp: l.parametros.capacidad_deseada_kwp == null ? "" : String(l.parametros.capacidad_deseada_kwp),
  };
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

function aPeticion(p: Parametros): { datos: LayoutGenerar } | { error: string } {
  const pasillo = aNumero(p.pasillo);
  const tolerancia = aNumero(p.tolerancia);
  const kwp = aNumero(p.kwp);

  if (pasillo === null || Number.isNaN(pasillo)) return { error: "Revisa el pasillo: debe ser un número en metros." };
  if (tolerancia === null || Number.isNaN(tolerancia)) return { error: "Revisa la tolerancia: debe ser un porcentaje." };
  if (kwp !== null && Number.isNaN(kwp)) return { error: "Revisa la capacidad deseada: debe ser un número en kWp." };

  return {
    datos: {
      paneles_largo: Number(p.L),
      pasillo_m: pasillo,
      tolerancia_proporcion: tolerancia / 100,
      capacidad_deseada_kwp: kwp,
    },
  };
}

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-acero-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-acero-700">{titulo}</h2>
      {children}
    </div>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-acero-500">{nombre}</dt>
      <dd className="text-right font-medium text-acero-800">{valor}</dd>
    </div>
  );
}

function Entrada({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-acero-600">
      {etiqueta}
      <div className="mt-1">{children}</div>
      {ayuda && <span className="mt-1 block font-normal text-acero-400">{ayuda}</span>}
    </label>
  );
}

export function LayoutPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [terreno, setTerreno] = useState<Terreno | null>(null);
  const [equipo, setEquipo] = useState<ConfiguracionEquipo | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [parametros, setParametros] = useState<Parametros>(PARAMETROS_DEFECTO);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);

  // ─── Edición manual (SQ-64) ──────────────────────────
  // null = no se está editando
  const [borrador, setBorrador] = useState<BloqueEdicion[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const origenAlArrastrar = useRef<Punto | null>(null);

  const original = useMemo<BloqueEdicion[]>(
    () => (layout?.bloques ?? []).map((b, i) => ({ clave: i, origen: b.vertices[3], paneles_ancho: b.paneles_ancho })),
    [layout],
  );

  const geometria = useMemo<GeometriaLayout | null>(
    () =>
      layout
        ? { largo_m: layout.largo_bloque_m, lado_menor_m: layout.lado_menor_m, angulo_norte: layout.angulo_norte }
        : null,
    [layout],
  );

  const problemas = useMemo(
    () =>
      borrador && geometria && terreno
        ? validarBloques(borrador, geometria, terreno.vertices, terreno.caminos.map((c) => c.vertices))
        : new Map<number, string>(),
    [borrador, geometria, terreno],
  );

  const cambios = useMemo(() => (borrador ? contarCambios(original, borrador) : 0), [borrador, original]);

  /** Bloques a dibujar: los guardados, o el borrador si se está editando. */
  const dibujo = useMemo<BloqueDibujo[]>(() => {
    if (!layout) return [];
    if (!borrador || !geometria) {
      return layout.bloques.map((b, i) => ({ ...b, clave: i }));
    }
    // La proporción es lineal en A: se toma la constante de cualquier tipo guardado.
    const ref = layout.tipos[0];
    const porPanel = ref ? ref.proporcion / ref.paneles_ancho : 0;
    const tolerancia = layout.parametros.tolerancia_proporcion;
    const letras = letrasPorA(borrador);
    return borrador.map((b) => ({
      clave: b.clave,
      vertices: verticesBloque(b, geometria),
      tipo: letras.get(b.paneles_ancho) ?? "?",
      paneles_largo: layout.parametros.paneles_largo,
      paneles_ancho: b.paneles_ancho,
      en_proporcion: Math.abs((porPanel * b.paneles_ancho) / 3 - 1) <= tolerancia + 1e-6,
      problema: problemas.get(b.clave),
    }));
  }, [layout, borrador, geometria, problemas]);

  const bloqueSeleccionado = borrador?.find((b) => b.clave === seleccionado) ?? null;

  const moverSeleccionado = useCallback(
    (dx: number, dy: number) => {
      if (seleccionado === null) return;
      setBorrador((bs) =>
        bs?.map((b) =>
          b.clave === seleccionado ? { ...b, origen: [ajustar(b.origen[0] + dx), ajustar(b.origen[1] + dy)] } : b,
        ) ?? null,
      );
    },
    [seleccionado],
  );

  const eliminarSeleccionado = useCallback(() => {
    if (seleccionado === null) return;
    setBorrador((bs) => bs?.filter((b) => b.clave !== seleccionado) ?? null);
    setSeleccionado(null);
  }, [seleccionado]);

  function cambiarA(delta: number) {
    setBorrador((bs) =>
      bs?.map((b) =>
        b.clave === seleccionado ? { ...b, paneles_ancho: Math.max(1, b.paneles_ancho + delta) } : b,
      ) ?? null,
    );
  }

  // Teclado: Supr elimina, flechas mueven. No interfiere al escribir en un campo.
  useEffect(() => {
    if (!borrador) return;
    function alTeclear(e: KeyboardEvent) {
      const destino = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName)) return;
      const paso = e.shiftKey ? 1 : PASO_TECLADO_M;
      const acciones: Record<string, () => void> = {
        Delete: eliminarSeleccionado,
        Backspace: eliminarSeleccionado,
        ArrowUp: () => moverSeleccionado(0, paso),
        ArrowDown: () => moverSeleccionado(0, -paso),
        ArrowLeft: () => moverSeleccionado(-paso, 0),
        ArrowRight: () => moverSeleccionado(paso, 0),
        Escape: () => setSeleccionado(null),
      };
      const accion = acciones[e.key];
      if (accion && seleccionado !== null) {
        e.preventDefault();
        accion();
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [borrador, seleccionado, eliminarSeleccionado, moverSeleccionado]);

  function empezarEdicion() {
    setError(null);
    setAviso(null);
    setConfirmarRegenerar(false);
    setBorrador(original);
    setSeleccionado(null);
  }

  function descartarEdicion() {
    setBorrador(null);
    setSeleccionado(null);
  }

  async function guardarEdicion() {
    if (!borrador) return;
    setError(null);
    setGuardando(true);
    try {
      const nuevo = await guardarBloques(
        proyectoId,
        borrador.map((b) => ({ origen: redondearMm(b.origen), paneles_ancho: b.paneles_ancho })),
      );
      setLayout(nuevo);
      setBorrador(null);
      setSeleccionado(null);
      setAviso(`Edición guardada: ${cambios} cambio(s). Tipos, potencia y eléctrica recalculados.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar la edición"));
    } finally {
      setGuardando(false);
    }
  }

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    Promise.all([
      obtenerProyecto(proyectoId),
      obtenerTerreno(proyectoId),
      obtenerEquipo(proyectoId),
      obtenerLayout(proyectoId),
    ])
      .then(([p, t, e, l]) => {
        if (cancelado) return;
        setProyecto(p);
        setTerreno(t);
        setEquipo(e);
        setLayout(l);
        setParametros(desdeLayout(l));
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar el proyecto"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId]);

  function actualizar(campo: keyof Parametros, valor: string) {
    setParametros((p) => ({ ...p, [campo]: valor }));
  }

  async function generar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const resultado = aPeticion(parametros);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }

    // Regenerar pisa las ediciones manuales: se pide confirmación una vez.
    if (layout && layout.ediciones_manuales > 0 && !confirmarRegenerar) {
      setConfirmarRegenerar(true);
      return;
    }

    setGenerando(true);
    setConfirmarRegenerar(false);
    try {
      const nuevo = await generarLayout(proyectoId, resultado.datos);
      setLayout(nuevo);
      setParametros(desdeLayout(nuevo));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo generar el layout"));
    } finally {
      setGenerando(false);
    }
  }

  // ─── Render ──────────────────────────────────────────

  if (!idValido) {
    return <p className="text-sm text-red-600">El identificador del proyecto no es válido.</p>;
  }
  if (cargando) {
    return <p className="text-sm text-acero-500">Cargando proyecto…</p>;
  }
  if (errorCarga || !proyecto) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorCarga ?? "No se encontró el proyecto."}
        </p>
        <Link to="/proyectos" className="mt-4 inline-block text-sm text-solar-700 hover:underline">
          ← Volver a proyectos
        </Link>
      </div>
    );
  }

  const faltaTerreno = terreno === null;
  const faltaEquipo = equipo === null;
  const puedeGenerar = !faltaTerreno && !faltaEquipo;
  const fueraDeProporcion = layout?.tipos.filter((t) => !t.en_proporcion) ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto
        proyecto={proyecto}
        titulo="Layout solar"
        onActualizado={async (p) => {
          setProyecto(p);
          // La latitud entra en la huella del layout: puede quedar desactualizado
          setLayout(await obtenerLayout(proyectoId));
        }}
      />

      {!puedeGenerar && (
        <div className="mt-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-900">
          Para generar el layout falta definir
          {faltaTerreno && (
            <>
              {" "}
              <Link to={`/proyectos/${proyecto.id}/terreno`} className="font-semibold underline">
                el terreno
              </Link>
            </>
          )}
          {faltaTerreno && faltaEquipo && " y"}
          {faltaEquipo && (
            <>
              {" "}
              <Link to={`/proyectos/${proyecto.id}/equipo`} className="font-semibold underline">
                el panel y el inversor
              </Link>
            </>
          )}
          .
        </div>
      )}

      {layout?.desactualizado && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El terreno, los caminos, el equipo o la latitud cambiaron después de generar este layout.
          Vuelve a generarlo para que refleje los datos actuales.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {aviso && !error && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ─── Parámetros y plano ───────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          <form onSubmit={generar} className="rounded-xl border border-acero-200 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <Entrada etiqueta="Paneles en el largo (L)" ayuda="Par: soportes en A y V">
                <select className={CAMPO} value={parametros.L} onChange={(e) => actualizar("L", e.target.value)}>
                  {OPCIONES_L.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Entrada>
              <Entrada etiqueta="Pasillo (m)" ayuda="Entre bloques">
                <input className={CAMPO} inputMode="decimal" value={parametros.pasillo} onChange={(e) => actualizar("pasillo", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Tolerancia (%)" ayuda="Sobre ancho = 3 × largo">
                <input className={CAMPO} inputMode="decimal" value={parametros.tolerancia} onChange={(e) => actualizar("tolerancia", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Capacidad deseada (kWp)" ayuda="Opcional. Vacío = máximo">
                <input className={CAMPO} inputMode="decimal" placeholder="Máxima" value={parametros.kwp} onChange={(e) => actualizar("kwp", e.target.value)} />
              </Entrada>
            </div>
            {confirmarRegenerar ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>
                  Este layout tiene <strong>{layout?.ediciones_manuales} edición(es) manual(es)</strong>. Volver a
                  generarlo las reemplaza por completo.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirmarRegenerar(false)} className="rounded-lg border border-amber-400 px-4 py-1.5 text-sm hover:bg-amber-100">
                    Cancelar
                  </button>
                  <button type="submit" disabled={generando} className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                    {generando ? "Generando…" : "Sí, volver a generar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-end gap-3">
                {borrador && <span className="text-xs text-acero-500">Termina o descarta la edición para regenerar.</span>}
                <button
                  type="submit"
                  disabled={!puedeGenerar || generando || borrador !== null}
                  className="rounded-lg bg-solar-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generando ? "Generando…" : layout ? "Volver a generar" : "Generar layout"}
                </button>
              </div>
            )}
          </form>

          {/* ─── Barra de edición (SQ-64) ─────────────────── */}
          {layout && !borrador && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-acero-200 bg-white px-5 py-3">
              <p className="text-sm text-acero-600">
                {layout.ediciones_manuales > 0
                  ? `${layout.ediciones_manuales} edición(es) manual(es) desde la última generación.`
                  : "Puedes ajustar a mano los bloques que generó el sistema."}
              </p>
              <button
                type="button"
                onClick={empezarEdicion}
                disabled={layout.desactualizado}
                title={layout.desactualizado ? "Vuelve a generar el layout antes de editarlo" : undefined}
                className="rounded-lg border border-solar-500 px-4 py-1.5 text-sm font-semibold text-solar-700 transition hover:bg-solar-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Editar bloques
              </button>
            </div>
          )}

          {borrador && (
            <div className="rounded-xl border border-solar-300 bg-solar-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-solar-900">
                  <p className="font-semibold">Modo edición</p>
                  <p className="text-xs">
                    Arrastra un bloque para moverlo. Flechas: 10 cm (con Shift, 1 m). Supr: eliminar.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-acero-600">
                    {cambios} cambio(s)
                    {problemas.size > 0 && <span className="ml-2 font-semibold text-red-700">· {problemas.size} bloque(s) con problemas</span>}
                  </span>
                  <button type="button" onClick={descartarEdicion} className="rounded-lg border border-acero-300 bg-white px-3 py-1.5 text-sm text-acero-700 hover:bg-acero-100">
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={guardarEdicion}
                    disabled={guardando || cambios === 0 || problemas.size > 0 || borrador.length === 0}
                    title={problemas.size > 0 ? "Corrige los bloques en rojo antes de guardar" : undefined}
                    className="rounded-lg bg-solar-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guardando ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>

              {bloqueSeleccionado && (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-solar-200 pt-3 text-sm">
                  <span className="font-medium text-acero-800">
                    Bloque {dibujo.find((d) => d.clave === bloqueSeleccionado.clave)?.tipo} ·{" "}
                    {layout?.parametros.paneles_largo} × {bloqueSeleccionado.paneles_ancho}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-acero-500">A:</span>
                    <button type="button" onClick={() => cambiarA(-1)} disabled={bloqueSeleccionado.paneles_ancho <= 1} className="h-7 w-7 rounded border border-acero-300 bg-white text-acero-700 hover:bg-acero-100 disabled:opacity-40" aria-label="Quitar un panel en A">
                      −
                    </button>
                    <span className="w-8 text-center font-mono">{bloqueSeleccionado.paneles_ancho}</span>
                    <button type="button" onClick={() => cambiarA(1)} className="h-7 w-7 rounded border border-acero-300 bg-white text-acero-700 hover:bg-acero-100" aria-label="Agregar un panel en A">
                      +
                    </button>
                  </span>
                  <button type="button" onClick={eliminarSeleccionado} className="text-sm text-red-700 hover:underline">
                    Eliminar bloque
                  </button>
                  {problemas.get(bloqueSeleccionado.clave) && (
                    <span className="text-xs font-semibold text-red-700">{problemas.get(bloqueSeleccionado.clave)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {terreno && (
            <VistaLayout
              terreno={terreno.vertices}
              caminos={terreno.caminos.map((c) => c.vertices)}
              bloques={dibujo}
              orientacionNorte={terreno.orientacion_norte}
              desactualizado={layout?.desactualizado}
              editable={borrador !== null}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
              onIniciarArrastre={(clave) => {
                origenAlArrastrar.current = borrador?.find((b) => b.clave === clave)?.origen ?? null;
              }}
              onArrastrar={(clave, [dx, dy]) => {
                const base = origenAlArrastrar.current;
                // Zona muerta: un clic para seleccionar no debe mover el bloque
                if (!base || Math.hypot(dx, dy) < ZONA_MUERTA_M) return;
                setBorrador((bs) =>
                  bs?.map((b) => (b.clave === clave ? { ...b, origen: [ajustar(base[0] + dx), ajustar(base[1] + dy)] } : b)) ?? null,
                );
              }}
            />
          )}
        </div>

        {/* ─── Resultados ───────────────────────────────── */}
        <aside className="space-y-5">
          {borrador && (
            <p className="rounded-lg bg-solar-50 px-3 py-2 text-xs text-solar-800">
              Mientras editas, estos resultados son los del layout guardado. Se recalculan al guardar.
            </p>
          )}
          {!layout ? (
            <div className="rounded-xl border border-dashed border-acero-300 bg-white p-5 text-sm text-acero-500">
              Genera el layout para ver los bloques, la potencia instalada y la configuración eléctrica.
            </div>
          ) : (
            <>
              <Tarjeta titulo="Planta">
                <p className="mt-3 text-3xl font-bold text-acero-900">
                  {numero(layout.potencia_kwp, 1)}
                  <span className="ml-2 text-sm font-normal text-acero-500">kWp</span>
                </p>
                <dl className="mt-3 space-y-2">
                  <Fila nombre="Paneles" valor={numero(layout.total_paneles, 0)} />
                  <Fila nombre="Bloques" valor={numero(layout.bloques.length, 0)} />
                  <Fila nombre="Área útil" valor={formatearArea(layout.area_util_m2)} />
                  <Fila
                    nombre="Ocupación"
                    valor={`${numero((100 * layout.area_ocupada_m2) / layout.area_util_m2, 1)} %`}
                  />
                </dl>
              </Tarjeta>

              {layout.capacidad && (
                <Tarjeta titulo="Capacidad deseada">
                  <span
                    className={[
                      "mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      layout.capacidad.cabe ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900",
                    ].join(" ")}
                  >
                    {layout.capacidad.cabe ? "Cabe en el terreno" : "No cabe"}
                  </span>
                  <dl className="mt-3 space-y-2">
                    <Fila nombre="Deseada" valor={`${numero(layout.capacidad.deseada_kwp, 1)} kWp`} />
                    <Fila nombre="Instalada" valor={`${numero(layout.capacidad.instalada_kwp, 1)} kWp`} />
                    <Fila nombre="Máxima del terreno" valor={`${numero(layout.capacidad.maxima_kwp, 1)} kWp`} />
                    {layout.capacidad.cabe && (
                      <Fila nombre="Espacio remanente" valor={`${numero(layout.capacidad.remanente_kwp, 1)} kWp`} />
                    )}
                  </dl>
                </Tarjeta>
              )}

              <Tarjeta titulo="Bloques por tipo">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-acero-400">
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">L × A</th>
                      <th className="pb-2 text-right font-medium">Cant.</th>
                      <th className="pb-2 text-right font-medium">Prop.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-acero-100">
                    {layout.tipos.map((t) => (
                      <tr key={t.tipo}>
                        <td className="py-1.5">
                          <span
                            className={[
                              "inline-block min-w-6 rounded px-1.5 text-center text-xs font-semibold",
                              t.en_proporcion ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900",
                            ].join(" ")}
                          >
                            {t.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 text-acero-700">
                          {t.paneles_largo} × {t.paneles_ancho}
                        </td>
                        <td className="py-1.5 text-right font-medium text-acero-800">{t.repeticiones}</td>
                        <td className="py-1.5 text-right text-acero-600">{numero(t.proporcion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fueraDeProporcion.length > 0 && (
                  <p className="mt-3 text-xs text-amber-800">
                    Los tipos en ámbar se apartan más de{" "}
                    {numero(layout.parametros.tolerancia_proporcion * 100, 0)} % de la proporción 3 : 1.
                    Suelen ser los bloques cortos que aprovechan el final de cada franja.
                  </p>
                )}
                <dl className="mt-4 space-y-2 border-t border-acero-200 pt-3">
                  <Fila nombre="Bloque ideal" valor={`${layout.parametros.paneles_largo} × ${layout.paneles_ancho_ideal}`} />
                  <Fila nombre="Medidas en planta" valor={`${numero(layout.largo_bloque_m)} × ${numero(layout.ancho_bloque_m)} m`} />
                  <Fila nombre="Separación este-oeste" valor={`${numero(layout.separacion_este_oeste_m)} m`} />
                  <Fila nombre="Separación norte-sur" valor={`${numero(layout.separacion_norte_sur_m)} m`} />
                </dl>
              </Tarjeta>

              <Tarjeta titulo="Configuración eléctrica">
                {layout.electrica.strings_totales == null ? (
                  <>
                    <dl className="mt-3 space-y-2">
                      <Fila nombre="Inversores sugeridos" valor={layout.electrica.inversores} />
                    </dl>
                    <p className={["mt-2 text-sm", layout.electrica.compatible === false ? "text-red-700" : "text-acero-500"].join(" ")}>
                      {layout.electrica.motivo}
                    </p>
                  </>
                ) : (
                  <>
                    <dl className="mt-3 space-y-2">
                      <Fila nombre="Paneles por string" valor={`${layout.electrica.paneles_por_string} (rango ${layout.electrica.paneles_por_string_min}–${layout.electrica.paneles_por_string_max})`} />
                      <Fila nombre="Strings totales" valor={layout.electrica.strings_totales} />
                      {!!layout.electrica.paneles_sin_string && (
                        <Fila nombre="Paneles sin string completo" valor={layout.electrica.paneles_sin_string} />
                      )}
                      <Fila nombre="Inversores (~400 paneles c/u)" valor={layout.electrica.inversores} />
                      {layout.electrica.strings_por_mppt != null && (
                        <Fila nombre="Strings por MPPT" valor={layout.electrica.strings_por_mppt} />
                      )}
                    </dl>
                    {layout.electrica.compatible ? (
                      <span className="mt-3 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Configuración válida
                      </span>
                    ) : (
                      <p className="mt-3 text-sm text-red-700">{layout.electrica.motivo}</p>
                    )}
                  </>
                )}
              </Tarjeta>

              {layout.advertencias.length > 0 && (
                <ul className="space-y-2">
                  {layout.advertencias.map((a) => (
                    <li key={a} className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
