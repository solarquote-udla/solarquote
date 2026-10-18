/**
 * Asistente, Paso 2 — Panel + Inversores (RF-02).
 *
 * Como en el prototipo: a la izquierda el panel (presets en tarjetas o
 * ingreso manual) y a la derecha los inversores: la potencia objetivo del
 * sistema, la sugerencia automática de cuántos usar y una tarjeta por
 * inversor, cada una con su color (el mismo de sus bloques en el Paso 3).
 * "Siguiente" guarda si hay cambios y pasa al Paso 3.
 *
 * Cada inversor se escribe a mano o se elige del catálogo de RF-08; en
 * los dos casos sus datos se copian al proyecto. La sugerencia se
 * recalcula mientras se escribe; el resto de cifras (separación, límites
 * de string) las calcula el backend al guardar, igual que las áreas del
 * terreno: una sola fuente de verdad.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { mensajeDeError } from "@/services/api";
import { guardarEquipo, listarPanelesReferencia, obtenerEquipo } from "@/services/equipo";
import { listarInversores } from "@/services/inversores";
import { obtenerProyecto } from "@/services/proyectos";
import {
  MAX_INVERSORES,
  type ConfiguracionEquipo,
  type ConfiguracionEquipoGuardar,
  type Inversor,
  type InversorCatalogo,
  type PanelReferencia,
  type Proyecto,
} from "@/types/api";
import { colorInversor, sugerenciaInversores } from "@/utils/inversores";

// Los campos numéricos se editan como texto: así el usuario puede borrar
// un valor o escribir "52,3" con coma sin que el input lo rechace a mitad.
const PANEL_VACIO = {
  panel_marca: "",
  panel_modelo: "",
  panel_potencia_wp: "",
  panel_largo_mm: "",
  panel_ancho_mm: "",
  panel_voc_v: "",
  panel_vmp_v: "",
  angulo_montaje: "",
};

type CampoPanel = keyof typeof PANEL_VACIO;

const INVERSOR_VACIO = {
  marca: "",
  modelo: "",
  potencia_kw: "",
  vmax_v: "",
  vmin_v: "",
  mppts: "",
  strings_por_mppt: "",
};

type FormInversor = typeof INVERSOR_VACIO;
type CampoInversor = keyof FormInversor;

type Formulario = typeof PANEL_VACIO & {
  potencia_objetivo_kwp: string;
  inversores: FormInversor[];
};

const FORMULARIO_VACIO: Formulario = { ...PANEL_VACIO, potencia_objetivo_kwp: "", inversores: [INVERSOR_VACIO] };

const CAMPO =
  "w-full rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

const texto = (valor: number | null | undefined) => (valor == null ? "" : String(valor));

function inversorAFormulario(i: Inversor | InversorCatalogo): FormInversor {
  return {
    marca: i.marca,
    modelo: i.modelo,
    potencia_kw: texto(i.potencia_kw),
    vmax_v: texto(i.vmax_v),
    vmin_v: texto(i.vmin_v),
    mppts: texto(i.mppts),
    strings_por_mppt: texto(i.strings_por_mppt),
  };
}

function desdeConfiguracion(c: ConfiguracionEquipo | null): Formulario {
  if (!c) return FORMULARIO_VACIO;
  return {
    panel_marca: c.panel.marca,
    panel_modelo: c.panel.modelo,
    panel_potencia_wp: texto(c.panel.potencia_wp),
    panel_largo_mm: texto(c.panel.largo_mm),
    panel_ancho_mm: texto(c.panel.ancho_mm),
    panel_voc_v: texto(c.panel.voc_v),
    panel_vmp_v: texto(c.panel.vmp_v),
    angulo_montaje: texto(c.angulo_montaje),
    potencia_objetivo_kwp: texto(c.potencia_objetivo_kwp),
    inversores: c.inversores.map(inversorAFormulario),
  };
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

const ETIQUETAS_PANEL: Record<CampoPanel, string> = {
  panel_marca: "la marca del panel",
  panel_modelo: "el modelo del panel",
  panel_potencia_wp: "la potencia del panel",
  panel_largo_mm: "el largo del panel",
  panel_ancho_mm: "el ancho del panel",
  panel_voc_v: "el Voc",
  panel_vmp_v: "el Vmp",
  angulo_montaje: "el ángulo de montaje",
};

/**
 * Valida un inversor con las mismas reglas que el backend. Se repiten
 * aquí para poder decir cuál de los inversores tiene el problema: el
 * mensaje del backend no lo dice.
 */
function inversorAPeticion(f: FormInversor, numero: number): { datos: Inversor } | { error: string } {
  const prefijo = `Inversor ${numero}:`;
  if (!f.marca.trim()) return { error: `${prefijo} falta la marca.` };
  if (!f.modelo.trim()) return { error: `${prefijo} falta el modelo.` };

  const potencia = aNumero(f.potencia_kw);
  if (potencia === null) return { error: `${prefijo} falta la potencia.` };
  if (!(potencia > 0)) return { error: `${prefijo} la potencia debe ser un número mayor a cero.` };

  const vmax = aNumero(f.vmax_v);
  const vmin = aNumero(f.vmin_v);
  for (const [v, etiqueta] of [[vmax, "el voltaje máximo"], [vmin, "el voltaje mínimo"]] as const) {
    if (v !== null && !(v > 0)) return { error: `${prefijo} ${etiqueta} debe ser un número mayor a cero.` };
  }
  if ((vmax === null) !== (vmin === null)) {
    return { error: `${prefijo} ingresa los dos voltajes (máximo y mínimo) o ninguno.` };
  }
  if (vmax !== null && vmin !== null && vmax <= vmin) {
    return { error: `${prefijo} el voltaje máximo debe ser mayor que el mínimo.` };
  }

  const mppts = aNumero(f.mppts);
  const strings = aNumero(f.strings_por_mppt);
  for (const [v, etiqueta] of [[mppts, "MPPTs"], [strings, "strings por MPPT"]] as const) {
    if (v !== null && !(Number.isInteger(v) && v > 0)) {
      return { error: `${prefijo} ${etiqueta} debe ser un número entero mayor a cero.` };
    }
  }

  return {
    datos: {
      marca: f.marca.trim(),
      modelo: f.modelo.trim(),
      potencia_kw: potencia,
      vmax_v: vmax,
      vmin_v: vmin,
      mppts,
      strings_por_mppt: strings,
    },
  };
}

/**
 * Convierte el formulario en el cuerpo de la petición. Del panel solo
 * verifica que lo obligatorio esté y sea numérico; sus reglas de negocio
 * (Voc > Vmp, ángulo 0–90…) las valida el backend y devuelve el mensaje
 * exacto.
 */
function aPeticion(f: Formulario): { datos: ConfiguracionEquipoGuardar } | { error: string } {
  for (const campo of ["panel_marca", "panel_modelo"] as const) {
    if (!f[campo].trim()) return { error: `Falta ${ETIQUETAS_PANEL[campo]}.` };
  }

  const numericos = [
    "panel_potencia_wp",
    "panel_largo_mm",
    "panel_ancho_mm",
    "panel_voc_v",
    "panel_vmp_v",
    "angulo_montaje",
  ] as const;
  const n: Partial<Record<CampoPanel, number>> = {};
  for (const campo of numericos) {
    const valor = aNumero(f[campo]);
    if (valor === null) return { error: `Falta ${ETIQUETAS_PANEL[campo]}.` };
    if (Number.isNaN(valor)) return { error: `Revisa ${ETIQUETAS_PANEL[campo]}: no es un número.` };
    n[campo] = valor;
  }

  const objetivo = aNumero(f.potencia_objetivo_kwp);
  if (objetivo !== null && !(objetivo > 0)) {
    return { error: "La potencia objetivo debe ser un número mayor a cero, o dejarse en blanco." };
  }

  const inversores: Inversor[] = [];
  for (const [i, inversor] of f.inversores.entries()) {
    const resultado = inversorAPeticion(inversor, i + 1);
    if ("error" in resultado) return resultado;
    inversores.push(resultado.datos);
  }
  if (inversores.length === 0) return { error: "Agrega al menos un inversor." };

  return {
    datos: {
      panel: {
        marca: f.panel_marca.trim(),
        modelo: f.panel_modelo.trim(),
        potencia_wp: n.panel_potencia_wp!,
        largo_mm: n.panel_largo_mm!,
        ancho_mm: n.panel_ancho_mm!,
        voc_v: n.panel_voc_v!,
        vmp_v: n.panel_vmp_v!,
      },
      angulo_montaje: n.angulo_montaje!,
      inversores,
      potencia_objetivo_kwp: objetivo,
    },
  };
}

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

function Entrada({
  etiqueta,
  unidad,
  children,
}: {
  etiqueta: string;
  unidad?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-acero-600">
      {etiqueta}
      {unidad && <span className="ml-1 font-normal text-acero-400">({unidad})</span>}
      <div className="mt-1">{children}</div>
    </label>
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

/** "2 inversores Huawei 160 kW" si son iguales; si no, solo la cantidad. */
function resumenInversores(inversores: FormInversor[]): string {
  const [primero] = inversores;
  if (!primero?.marca) return "";
  const descripcion = `${primero.marca} ${primero.potencia_kw || "?"} kW`;
  if (inversores.length === 1) return descripcion;
  const iguales = inversores.every((i) => i.marca === primero.marca && i.potencia_kw === primero.potencia_kw);
  return iguales ? `${inversores.length} inversores ${descripcion}` : `${inversores.length} inversores`;
}

const esVacio = (i: FormInversor) => JSON.stringify(i) === JSON.stringify(INVERSOR_VACIO);

export function EquipoPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const navegar = useNavigate();
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [guardado, setGuardado] = useState<ConfiguracionEquipo | null>(null);
  const [presets, setPresets] = useState<PanelReferencia[]>([]);
  const [catalogo, setCatalogo] = useState<InversorCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO);
  const [presetAplicado, setPresetAplicado] = useState<PanelReferencia | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarEnFormulario = useCallback((c: ConfiguracionEquipo | null) => {
    setGuardado(c);
    setFormulario(desdeConfiguracion(c));
    setPresetAplicado(null);
  }, []);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    Promise.all([obtenerProyecto(proyectoId), obtenerEquipo(proyectoId), listarPanelesReferencia()])
      .then(([p, c, lista]) => {
        if (cancelado) return;
        setProyecto(p);
        setPresets(lista);
        cargarEnFormulario(c);
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar el proyecto"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    // El catálogo solo ayuda a llenar: si no carga, los inversores se escriben a mano
    listarInversores()
      .then((lista) => {
        if (!cancelado) setCatalogo(lista);
      })
      .catch(() => undefined);

    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId, cargarEnFormulario]);

  const hayCambios = useMemo(
    () => JSON.stringify(formulario) !== JSON.stringify(desdeConfiguracion(guardado)),
    [formulario, guardado],
  );

  // "Editar datos" del encabezado tiene su propio formulario
  const [encabezadoSucio, setEncabezadoSucio] = useState(false);
  // También la primera vez: sin configuración guardada, cualquier dato escrito se perdería
  const permitirSalida = useCambiosSinGuardar(hayCambios || encabezadoSucio);

  const unaVez = useAccionUnica();

  function actualizar(campo: CampoPanel | "potencia_objetivo_kwp", valor: string) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
    // Editar a mano un dato del panel deja de coincidir con la ficha citada
    if (campo.startsWith("panel_")) setPresetAplicado(null);
  }

  function actualizarInversor(indice: number, campo: CampoInversor, valor: string) {
    setFormulario((f) => ({
      ...f,
      inversores: f.inversores.map((inv, i) => (i === indice ? { ...inv, [campo]: valor } : inv)),
    }));
  }

  function elegirDelCatalogo(indice: number, id: string) {
    const elegido = catalogo.find((c) => String(c.id) === id);
    if (!elegido) return;
    setFormulario((f) => ({
      ...f,
      inversores: f.inversores.map((inv, i) => (i === indice ? inversorAFormulario(elegido) : inv)),
    }));
  }

  /** Agrega inversores copiando el último: lo común es repetir el mismo modelo. */
  function agregarInversores(cantidad = 1) {
    setFormulario((f) => {
      const ultimo = f.inversores[f.inversores.length - 1] ?? INVERSOR_VACIO;
      const nuevos = Array.from({ length: Math.min(cantidad, MAX_INVERSORES - f.inversores.length) }, () => ({ ...ultimo }));
      return { ...f, inversores: [...f.inversores, ...nuevos] };
    });
  }

  function quitarInversor(indice: number) {
    const inversor = formulario.inversores[indice];
    if (formulario.inversores.length <= 1) return;
    if (!esVacio(inversor) && !window.confirm(`¿Quitar el Inversor ${indice + 1}?`)) return;
    setFormulario((f) => ({ ...f, inversores: f.inversores.filter((_, i) => i !== indice) }));
  }

  function aplicarPreset(clave: string) {
    const preset = presets.find((p) => p.clave === clave);
    if (!preset) return;
    setFormulario((f) => ({
      ...f,
      panel_marca: preset.marca,
      panel_modelo: preset.modelo,
      panel_potencia_wp: texto(preset.potencia_wp),
      panel_largo_mm: texto(preset.largo_mm),
      panel_ancho_mm: texto(preset.ancho_mm),
      panel_voc_v: texto(preset.voc_v),
      panel_vmp_v: texto(preset.vmp_v),
    }));
    setPresetAplicado(preset);
  }

  /** Valida y guarda. Devuelve si quedó guardado. Lo usan el formulario y "Siguiente". */
  async function persistir(): Promise<boolean> {
    setError(null);
    setAviso(null);

    const resultado = aPeticion(formulario);
    if ("error" in resultado) {
      setError(resultado.error);
      return false;
    }

    setGuardando(true);
    try {
      cargarEnFormulario(await guardarEquipo(proyectoId, resultado.datos));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar la configuración"));
      return false;
    } finally {
      setGuardando(false);
    }
    // Ya está guardado: si refrescar el encabezado falla, no es un error de guardado
    try {
      // El estado del proyecto pudo avanzar (borrador → en diseño)
      setProyecto(await obtenerProyecto(proyectoId));
    } catch {
      // El encabezado queda con el estado anterior hasta recargar
    }
    return true;
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (await persistir()) setAviso("Configuración guardada.");
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
        <Link to="/historial" className="mt-4 inline-block text-sm text-solar-700 hover:underline">
          Volver al historial
        </Link>
      </div>
    );
  }

  const calculos = guardado?.calculos;
  const presetElegido = presets.find(
    (p) =>
      p.marca === formulario.panel_marca.trim() &&
      p.modelo === formulario.panel_modelo.trim() &&
      String(p.potencia_wp) === formulario.panel_potencia_wp.trim(),
  );
  const largoMm = aNumero(formulario.panel_largo_mm);
  const anchoMm = aNumero(formulario.panel_ancho_mm);
  const inversores = formulario.inversores;

  const sugerencia = sugerenciaInversores(
    aNumero(formulario.potencia_objetivo_kwp) ?? 0,
    aNumero(formulario.panel_potencia_wp) ?? 0,
  );
  // Paneles que le tocarían a cada inversor, en proporción a su potencia
  const potencias = inversores.map((i) => aNumero(i.potencia_kw));
  const sumaPotencias = potencias.every((p) => p !== null && p > 0)
    ? potencias.reduce<number>((s, p) => s + (p ?? 0), 0)
    : null;
  const reparto = (indice: number) =>
    sugerencia &&
    Math.round(
      sumaPotencias ? (sugerencia.paneles * (potencias[indice] ?? 0)) / sumaPotencias : sugerencia.paneles / inversores.length,
    );

  const resumen =
    formulario.panel_marca && inversores[0]?.marca
      ? `${formulario.panel_marca} ${formulario.panel_potencia_wp || "?"} Wp · ${resumenInversores(inversores)}`
      : "Configura el panel y los inversores";

  /** "Siguiente": guarda solo si hay algo nuevo y devuelve si se puede continuar. */
  async function guardarSiHaceFalta(): Promise<boolean> {
    if (guardado && !hayCambios) return true;
    return persistir();
  }

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto
        paso={2}
        proyecto={proyecto}
        onCambiosSinGuardar={setEncabezadoSucio}
        onActualizado={async (p) => {
          setProyecto(p);
          // La separación entre filas depende de la latitud: se recalcula en el backend
          const actual = await obtenerEquipo(proyectoId);
          if (actual) setGuardado(actual);
        }}
      />

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unaVez("guardar", () => guardar(e));
        }}
        className="mt-6 grid gap-6 lg:grid-cols-2"
      >
        {/* ─── Panel solar ──────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-sm font-semibold text-acero-900">Panel solar</h2>
            <p className="mt-3 text-xs font-semibold tracking-wider text-acero-400">PRESETS</p>
            <ul className="mt-2 space-y-2">
              {presets.map((p) => {
                const elegido = presetElegido?.clave === p.clave;
                return (
                  <li key={p.clave}>
                    <button
                      type="button"
                      onClick={() => aplicarPreset(p.clave)}
                      className={[
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition",
                        elegido ? "border-solar-500 bg-solar-50" : "border-acero-200 hover:border-acero-300",
                      ].join(" ")}
                      aria-pressed={elegido}
                    >
                      <span>
                        <span className={`block text-sm font-medium ${elegido ? "text-solar-700" : "text-acero-800"}`}>
                          {p.marca} {p.modelo}
                        </span>
                        <span className="block text-xs text-acero-500">
                          {p.potencia_wp} Wp · {p.largo_mm}×{p.ancho_mm} mm
                        </span>
                      </span>
                      <span
                        className={[
                          "h-5 w-5 shrink-0 rounded-full border-2",
                          elegido ? "border-solar-500 bg-solar-500" : "border-acero-300",
                        ].join(" ")}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPresetAplicado(null);
                    setFormulario((f) => ({ ...f, panel_marca: "", panel_modelo: "", panel_potencia_wp: "", panel_largo_mm: "", panel_ancho_mm: "", panel_voc_v: "", panel_vmp_v: "" }));
                  }}
                  className={[
                    "w-full rounded-lg border border-dashed px-4 py-2.5 text-left text-sm transition",
                    !presetElegido ? "border-solar-500 text-solar-700" : "border-acero-300 text-acero-500 hover:border-acero-400",
                  ].join(" ")}
                >
                  + Ingresar manualmente
                </button>
              </li>
            </ul>

            {presetAplicado && (
              <p className="mt-2 text-xs text-acero-500">
                Datos tomados de la{" "}
                <a href={presetAplicado.fuente} target="_blank" rel="noreferrer" className="text-solar-700 hover:underline">
                  ficha técnica
                </a>
                . Si tu lote es de otra potencia, ajusta potencia, Voc y Vmp.
              </p>
            )}

            <p className="mt-5 text-xs font-semibold tracking-wider text-acero-400">ESPECIFICACIONES</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Entrada etiqueta="Marca">
                <input className={CAMPO} value={formulario.panel_marca} onChange={(e) => actualizar("panel_marca", e.target.value)} maxLength={80} />
              </Entrada>
              <Entrada etiqueta="Modelo">
                <input className={CAMPO} value={formulario.panel_modelo} onChange={(e) => actualizar("panel_modelo", e.target.value)} maxLength={100} />
              </Entrada>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Entrada etiqueta="Potencia" unidad="Wp">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_potencia_wp} onChange={(e) => actualizar("panel_potencia_wp", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Largo" unidad="mm, dir. L">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_largo_mm} onChange={(e) => actualizar("panel_largo_mm", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Ancho" unidad="mm, dir. A">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_ancho_mm} onChange={(e) => actualizar("panel_ancho_mm", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Voc" unidad="V">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_voc_v} onChange={(e) => actualizar("panel_voc_v", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Vmp" unidad="V">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_vmp_v} onChange={(e) => actualizar("panel_vmp_v", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Ángulo de montaje" unidad="°, 0 a 90">
                <input className={CAMPO} inputMode="decimal" placeholder="Ej. 15" value={formulario.angulo_montaje} onChange={(e) => actualizar("angulo_montaje", e.target.value)} />
              </Entrada>
            </div>

            {largoMm && anchoMm && largoMm > 0 && anchoMm > 0 ? (
              <div className="mt-5 flex items-center gap-4 rounded-lg border border-acero-200 bg-acero-50 p-4">
                <svg viewBox={`0 0 ${anchoMm} ${largoMm}`} className="h-16 w-auto" aria-hidden>
                  <rect width={anchoMm} height={largoMm} className="fill-sky-700 stroke-sky-500" strokeWidth={anchoMm * 0.03} />
                  {[1, 2].map((i) => (
                    <line key={i} x1={0} x2={anchoMm} y1={(largoMm * i) / 3} y2={(largoMm * i) / 3} className="stroke-sky-500" strokeWidth={anchoMm * 0.015} />
                  ))}
                </svg>
                <div className="text-xs">
                  <p className="font-medium text-sky-800">
                    {largoMm} × {anchoMm} mm
                  </p>
                  <p className="text-acero-500">{formulario.panel_potencia_wp || "?"} Wp · escala referencial</p>
                </div>
              </div>
            ) : null}
          </section>

          {calculos && (
            <section className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h2 className="text-sm font-semibold text-acero-700">Separación entre filas</h2>
              {hayCambios && (
                <p className="mt-2 rounded-lg bg-solar-50 px-3 py-2 text-xs text-solar-800">
                  Los resultados corresponden a la última versión guardada.
                </p>
              )}
              <dl className="mt-3 space-y-2">
                {/* No depende de la latitud: se muestra siempre */}
                <Fila nombre="Área por panel" valor={`${numero(calculos.area_panel_m2, 3)} m²`} />
              </dl>
              {calculos.separacion ? (
                <dl className="mt-2 space-y-2">
                  <Fila nombre="Sol más bajo al mediodía" valor={`${numero(calculos.separacion.elevacion_solar_grados)}°`} />
                  <Fila nombre="Sombra (hueco libre)" valor={`${numero(calculos.separacion.sombra_m)} m`} />
                  <div className="border-t border-acero-200 pt-2">
                    <Fila nombre="Paso mínimo" valor={<span className="text-solar-700">{numero(calculos.separacion.paso_minimo_m)} m</span>} />
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-acero-500">Falta la latitud del proyecto (Paso 1).</p>
              )}
            </section>
          )}
        </div>

        {/* ─── Inversores ────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-sm font-semibold text-acero-900">Inversores</h2>
            <div className="mt-3 max-w-xs">
              <Entrada etiqueta="Potencia objetivo del sistema" unidad="kWp, opcional">
                <input
                  className={CAMPO}
                  inputMode="decimal"
                  placeholder="Ej. 316"
                  value={formulario.potencia_objetivo_kwp}
                  onChange={(e) => actualizar("potencia_objetivo_kwp", e.target.value)}
                />
              </Entrada>
            </div>

            {sugerencia ? (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <p className="font-semibold">Sugerencia automática</p>
                <p className="mt-1 text-xs">
                  Con {numero(sugerencia.paneles, 0)} paneles (~{numero(sugerencia.potenciaKwp, 1)} kWp) se recomiendan{" "}
                  <strong>
                    {sugerencia.inversores} inversor{sugerencia.inversores === 1 ? "" : "es"}
                  </strong>{" "}
                  (~{numero(sugerencia.panelesPorInversor, 0)} paneles c/u · ~{numero(sugerencia.kwpPorInversor, 1)} kWp c/u).
                </p>
                {sugerencia.inversores > inversores.length && sugerencia.inversores <= MAX_INVERSORES && (
                  <button
                    type="button"
                    onClick={() => agregarInversores(sugerencia.inversores - inversores.length)}
                    className="mt-2 rounded-md border border-green-200 px-2.5 py-1 text-xs font-medium hover:bg-green-100"
                  >
                    Usar {sugerencia.inversores} inversores
                  </button>
                )}
                {sugerencia.inversores < inversores.length && (
                  <p className="mt-1 text-xs">Tienes {inversores.length} configurados.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-acero-400">
                Con la potencia objetivo y la del panel se sugiere cuántos inversores usar (~400 paneles cada uno).
              </p>
            )}

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wider text-acero-400">INVERSORES CONFIGURADOS</p>
              <button
                type="button"
                onClick={() => agregarInversores()}
                disabled={inversores.length >= MAX_INVERSORES}
                className="rounded-md border border-solar-500 px-2.5 py-1 text-xs font-semibold text-solar-700 hover:bg-solar-50 disabled:opacity-50"
              >
                + Agregar
              </button>
            </div>

            <ul className="mt-3 space-y-3">
              {inversores.map((inv, i) => {
                const color = colorInversor(i);
                const enCatalogo = catalogo.find((c) => c.marca === inv.marca.trim() && c.modelo === inv.modelo.trim());
                const limites = !hayCambios ? calculos?.strings[i] : undefined;
                const paneles = reparto(i);
                return (
                  <li key={i} className={`rounded-xl border bg-acero-50 p-4 ${color.tarjeta}`} aria-label={`Inversor ${i + 1}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${color.muestra}`} aria-hidden />
                        <span className={`text-sm font-semibold ${color.texto}`}>Inversor {i + 1}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        {paneles != null && <span className="text-xs text-acero-500">~{numero(paneles, 0)} paneles</span>}
                        <button
                          type="button"
                          onClick={() => quitarInversor(i)}
                          disabled={inversores.length <= 1}
                          className="text-xs text-acero-500 hover:text-red-600 disabled:opacity-40"
                          aria-label={`Quitar inversor ${i + 1}`}
                        >
                          Quitar
                        </button>
                      </span>
                    </div>

                    {catalogo.length > 0 && (
                      <label className="mt-3 block text-xs font-medium text-acero-600">
                        Del catálogo
                        <select
                          className={`${CAMPO} mt-1`}
                          value={enCatalogo ? String(enCatalogo.id) : ""}
                          onChange={(e) => elegirDelCatalogo(i, e.target.value)}
                        >
                          <option value="">Escrito a mano</option>
                          {catalogo.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.marca} {c.modelo} · {c.potencia_kw} kW
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Entrada etiqueta="Marca">
                        <input className={CAMPO} value={inv.marca} onChange={(e) => actualizarInversor(i, "marca", e.target.value)} maxLength={80} />
                      </Entrada>
                      <Entrada etiqueta="Modelo">
                        <input className={CAMPO} value={inv.modelo} onChange={(e) => actualizarInversor(i, "modelo", e.target.value)} maxLength={100} />
                      </Entrada>
                      <Entrada etiqueta="Potencia" unidad="kW">
                        <input className={CAMPO} inputMode="decimal" value={inv.potencia_kw} onChange={(e) => actualizarInversor(i, "potencia_kw", e.target.value)} />
                      </Entrada>
                    </div>

                    <p className="mt-3 text-xs font-medium text-acero-500">
                      Datos eléctricos <span className="font-normal text-acero-400">(opcionales: sin Vmax y Vmin no se validan los strings)</span>
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-4">
                      <Entrada etiqueta="Voltaje máx." unidad="V">
                        <input className={CAMPO} inputMode="decimal" value={inv.vmax_v} onChange={(e) => actualizarInversor(i, "vmax_v", e.target.value)} />
                      </Entrada>
                      <Entrada etiqueta="Voltaje mín." unidad="V">
                        <input className={CAMPO} inputMode="decimal" value={inv.vmin_v} onChange={(e) => actualizarInversor(i, "vmin_v", e.target.value)} />
                      </Entrada>
                      <Entrada etiqueta="MPPTs">
                        <input className={CAMPO} inputMode="numeric" value={inv.mppts} onChange={(e) => actualizarInversor(i, "mppts", e.target.value)} />
                      </Entrada>
                      <Entrada etiqueta="Strings por MPPT">
                        <input className={CAMPO} inputMode="numeric" value={inv.strings_por_mppt} onChange={(e) => actualizarInversor(i, "strings_por_mppt", e.target.value)} />
                      </Entrada>
                    </div>

                    {limites && (
                      <p className={`mt-3 text-xs ${limites.compatible ? "text-acero-600" : "text-red-700"}`}>
                        {limites.compatible
                          ? `Strings de ${limites.paneles_min} a ${limites.paneles_max} paneles: compatible con el panel.`
                          : `Incompatible con el panel: ${limites.motivo}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex items-center justify-end gap-3">
              {guardado && hayCambios && <span className="text-xs text-solar-700">Hay cambios sin guardar</span>}
              <button
                type="submit"
                disabled={guardando || (!hayCambios && guardado !== null)}
                className="rounded-lg border border-solar-500 px-4 py-2 text-sm font-semibold text-solar-700 transition hover:bg-solar-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar y calcular"}
              </button>
            </div>
          </section>

          {!calculos ? (
            <div className="rounded-xl border border-dashed border-acero-300 bg-superficie p-5 text-sm text-acero-500">
              Guarda la configuración para ver el área por panel, la separación entre filas y los límites de string de
              cada inversor.
            </div>
          ) : (
            calculos.advertencias.length > 0 && (
              <ul className="space-y-2">
                {calculos.advertencias.map((a) => (
                  <li key={a} className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900">
                    {a}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </form>

      <BarraPaso
        atras={{
          etiqueta: "← Anterior",
          // Con cambios sin guardar, useCambiosSinGuardar pregunta antes de salir
          onClick: () => void navegar(rutaPaso(proyectoId, 1)),
        }}
        resumen={resumen}
        adelante={{
          etiqueta: guardando ? "Guardando…" : "Siguiente →",
          deshabilitado: guardando,
          onClick: () => {
            if (encabezadoSucio) {
              setError("Guarda o cancela los cambios en los datos del proyecto antes de continuar.");
              return;
            }
            void unaVez("siguiente", guardarSiHaceFalta).then((ok) => {
              if (!ok) return;
              // Recién guardado: esta navegación no debe pedir confirmación
              permitirSalida();
              void navegar(rutaPaso(proyectoId, 3));
            });
          },
        }}
      />
    </div>
  );
}
