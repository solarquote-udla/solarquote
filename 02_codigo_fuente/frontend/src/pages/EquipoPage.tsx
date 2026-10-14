/**
 * Asistente, Paso 2 — Panel + Inversor (RF-02).
 *
 * Como en el prototipo: a la izquierda el panel (presets en tarjetas o
 * ingreso manual) y a la derecha el inversor y los cálculos. "Siguiente"
 * guarda si hay cambios y pasa al Paso 3.
 *
 * El panel se ingresa a mano o desde un preset de marcas comunes; el
 * inversor, a mano (la lista de referencia de RF-08 se conectará aquí
 * cuando exista). Los resultados los calcula el backend y se muestran
 * después de guardar, igual que las áreas del terreno: una sola fuente
 * de verdad para las cifras.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { mensajeDeError } from "@/services/api";
import { guardarEquipo, listarPanelesReferencia, obtenerEquipo } from "@/services/equipo";
import { obtenerProyecto } from "@/services/proyectos";
import type {
  ConfiguracionEquipo,
  ConfiguracionEquipoGuardar,
  PanelReferencia,
  Proyecto,
} from "@/types/api";

// Los campos numéricos se editan como texto: así el usuario puede borrar
// un valor o escribir "52,3" con coma sin que el input lo rechace a mitad.
const FORMULARIO_VACIO = {
  panel_marca: "",
  panel_modelo: "",
  panel_potencia_wp: "",
  panel_largo_mm: "",
  panel_ancho_mm: "",
  panel_voc_v: "",
  panel_vmp_v: "",
  angulo_montaje: "",
  inversor_marca: "",
  inversor_modelo: "",
  inversor_potencia_kw: "",
  inversor_vmax_v: "",
  inversor_vmin_v: "",
  inversor_mppts: "",
  inversor_strings_por_mppt: "",
};

type Formulario = typeof FORMULARIO_VACIO;
type Campo = keyof Formulario;

const CAMPO =
  "w-full rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

const texto = (valor: number | null | undefined) => (valor == null ? "" : String(valor));

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
    inversor_marca: c.inversor.marca,
    inversor_modelo: c.inversor.modelo,
    inversor_potencia_kw: texto(c.inversor.potencia_kw),
    inversor_vmax_v: texto(c.inversor.vmax_v),
    inversor_vmin_v: texto(c.inversor.vmin_v),
    inversor_mppts: texto(c.inversor.mppts),
    inversor_strings_por_mppt: texto(c.inversor.strings_por_mppt),
  };
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

const ETIQUETAS: Partial<Record<Campo, string>> = {
  panel_marca: "la marca del panel",
  panel_modelo: "el modelo del panel",
  panel_potencia_wp: "la potencia del panel",
  panel_largo_mm: "el largo del panel",
  panel_ancho_mm: "el ancho del panel",
  panel_voc_v: "el Voc",
  panel_vmp_v: "el Vmp",
  angulo_montaje: "el ángulo de montaje",
  inversor_marca: "la marca del inversor",
  inversor_modelo: "el modelo del inversor",
  inversor_potencia_kw: "la potencia del inversor",
};

/**
 * Convierte el formulario en el cuerpo de la petición. Solo verifica que
 * lo obligatorio esté y sea numérico; las reglas de negocio (Voc > Vmp,
 * ángulo 0–90…) las valida el backend y devuelve el mensaje exacto.
 */
function aPeticion(f: Formulario): { datos: ConfiguracionEquipoGuardar } | { error: string } {
  for (const campo of ["panel_marca", "panel_modelo", "inversor_marca", "inversor_modelo"] as const) {
    if (!f[campo].trim()) return { error: `Falta ${ETIQUETAS[campo]}.` };
  }

  const obligatorios = [
    "panel_potencia_wp",
    "panel_largo_mm",
    "panel_ancho_mm",
    "panel_voc_v",
    "panel_vmp_v",
    "angulo_montaje",
    "inversor_potencia_kw",
  ] as const;

  const n: Partial<Record<Campo, number>> = {};
  for (const campo of obligatorios) {
    const valor = aNumero(f[campo]);
    if (valor === null) return { error: `Falta ${ETIQUETAS[campo]}.` };
    if (Number.isNaN(valor)) return { error: `Revisa ${ETIQUETAS[campo]}: no es un número.` };
    n[campo] = valor;
  }

  const opcionales = [
    "inversor_vmax_v",
    "inversor_vmin_v",
    "inversor_mppts",
    "inversor_strings_por_mppt",
  ] as const;
  const o: Partial<Record<Campo, number | null>> = {};
  for (const campo of opcionales) {
    const valor = aNumero(f[campo]);
    if (valor !== null && Number.isNaN(valor)) {
      return { error: "Revisa los datos eléctricos del inversor: hay un valor que no es número." };
    }
    o[campo] = valor;
  }

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
      inversor: {
        marca: f.inversor_marca.trim(),
        modelo: f.inversor_modelo.trim(),
        potencia_kw: n.inversor_potencia_kw!,
        vmax_v: o.inversor_vmax_v ?? null,
        vmin_v: o.inversor_vmin_v ?? null,
        mppts: o.inversor_mppts ?? null,
        strings_por_mppt: o.inversor_strings_por_mppt ?? null,
      },
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

export function EquipoPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const navegar = useNavigate();
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [guardado, setGuardado] = useState<ConfiguracionEquipo | null>(null);
  const [presets, setPresets] = useState<PanelReferencia[]>([]);
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

    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId, cargarEnFormulario]);

  const hayCambios = useMemo(
    () => JSON.stringify(formulario) !== JSON.stringify(desdeConfiguracion(guardado)),
    [formulario, guardado],
  );

  function actualizar(campo: Campo, valor: string) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
    // Editar a mano un dato del panel deja de coincidir con la ficha citada
    if (campo.startsWith("panel_")) setPresetAplicado(null);
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
      // El estado del proyecto pudo avanzar (borrador → en diseño)
      setProyecto(await obtenerProyecto(proyectoId));
      return true;
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar la configuración"));
      return false;
    } finally {
      setGuardando(false);
    }
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
  const resumen =
    formulario.panel_marca && formulario.inversor_marca
      ? `${formulario.panel_marca} ${formulario.panel_potencia_wp || "?"} Wp · ${formulario.inversor_marca} ${formulario.inversor_potencia_kw || "?"} kW`
      : "Configura el panel y el inversor";

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

      <form onSubmit={guardar} className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ─── Panel solar ──────────────────────────────── */}
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

        {/* ─── Inversor y resultados ─────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-sm font-semibold text-acero-900">Inversor</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Entrada etiqueta="Marca">
                <input className={CAMPO} value={formulario.inversor_marca} onChange={(e) => actualizar("inversor_marca", e.target.value)} maxLength={80} />
              </Entrada>
              <Entrada etiqueta="Modelo">
                <input className={CAMPO} value={formulario.inversor_modelo} onChange={(e) => actualizar("inversor_modelo", e.target.value)} maxLength={100} />
              </Entrada>
              <Entrada etiqueta="Potencia" unidad="kW">
                <input className={CAMPO} inputMode="decimal" value={formulario.inversor_potencia_kw} onChange={(e) => actualizar("inversor_potencia_kw", e.target.value)} />
              </Entrada>
            </div>

            <p className="mt-5 text-xs font-medium text-acero-500">
              Datos eléctricos <span className="font-normal text-acero-400">(opcionales)</span>
            </p>
            <p className="text-xs text-acero-400">Sin el voltaje máximo y mínimo no se pueden validar los límites de string.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-4">
              <Entrada etiqueta="Voltaje máx." unidad="V">
                <input className={CAMPO} inputMode="decimal" value={formulario.inversor_vmax_v} onChange={(e) => actualizar("inversor_vmax_v", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Voltaje mín." unidad="V">
                <input className={CAMPO} inputMode="decimal" value={formulario.inversor_vmin_v} onChange={(e) => actualizar("inversor_vmin_v", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="MPPTs">
                <input className={CAMPO} inputMode="numeric" value={formulario.inversor_mppts} onChange={(e) => actualizar("inversor_mppts", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Strings por MPPT">
                <input className={CAMPO} inputMode="numeric" value={formulario.inversor_strings_por_mppt} onChange={(e) => actualizar("inversor_strings_por_mppt", e.target.value)} />
              </Entrada>
            </div>

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
              Guarda la configuración para ver el área por panel, la separación entre filas y los límites de string.
            </div>
          ) : (
            <>
              {hayCambios && (
                <p className="rounded-lg bg-solar-50 px-3 py-2 text-xs text-solar-800">
                  Los resultados corresponden a la última versión guardada.
                </p>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-xl border border-acero-200 bg-superficie p-5">
                  <h2 className="text-sm font-semibold text-acero-700">Separación entre filas</h2>
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
                </div>

                <div className="rounded-xl border border-acero-200 bg-superficie p-5">
                  <h2 className="text-sm font-semibold text-acero-700">Paneles por string</h2>
                  {calculos.strings ? (
                    calculos.strings.compatible ? (
                      <>
                        <p className="mt-3 text-2xl font-bold text-acero-900">
                          {calculos.strings.paneles_min} a {calculos.strings.paneles_max}
                          <span className="ml-2 text-sm font-normal text-acero-500">paneles</span>
                        </p>
                        <span className="mt-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          Panel e inversor compatibles
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="mt-3 inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                          Incompatibles
                        </span>
                        <p className="mt-2 text-sm text-red-700">{calculos.strings.motivo}</p>
                      </>
                    )
                  ) : (
                    <p className="mt-2 text-sm text-acero-500">Faltan los voltajes del inversor.</p>
                  )}
                </div>
              </div>

              {calculos.advertencias.length > 0 && (
                <ul className="space-y-2">
                  {calculos.advertencias.map((a) => (
                    <li key={a} className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </form>

      <BarraPaso
        atras={{
          etiqueta: "← Anterior",
          onClick: () => {
            // También la primera vez: sin configuración guardada, cualquier dato escrito se perdería
            if (hayCambios && !window.confirm("Tienes cambios sin guardar en el equipo. ¿Volver al Paso 1 sin guardarlos?")) return;
            void navegar(rutaPaso(proyectoId, 1));
          },
        }}
        resumen={resumen}
        adelante={{
          etiqueta: guardando ? "Guardando…" : "Siguiente →",
          deshabilitado: guardando,
          onClick: () => {
            void guardarSiHaceFalta().then((ok) => {
              if (ok) void navegar(rutaPaso(proyectoId, 3));
            });
          },
        }}
      />
    </div>
  );
}
