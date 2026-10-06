/**
 * Configuración de panel e inversor — RF-02.
 *
 * El panel se ingresa a mano o desde un preset de marcas comunes; el
 * inversor, a mano (la lista de referencia de RF-08 se conectará aquí
 * cuando exista). Los resultados los calcula el backend y se muestran
 * después de guardar, igual que las áreas del terreno: una sola fuente
 * de verdad para las cifras.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
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

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const resultado = aPeticion(formulario);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }

    setGuardando(true);
    try {
      const configuracion = await guardarEquipo(proyectoId, resultado.datos);
      cargarEnFormulario(configuracion);
      // El estado del proyecto pudo avanzar (borrador → en diseño)
      setProyecto(await obtenerProyecto(proyectoId));
      setAviso("Configuración guardada.");
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar la configuración"));
    } finally {
      setGuardando(false);
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

  const calculos = guardado?.calculos;

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto
        proyecto={proyecto}
        titulo="Panel e inversor"
        onActualizado={async (p) => {
          setProyecto(p);
          // La separación entre filas depende de la latitud: se recalcula en el backend
          const actual = await obtenerEquipo(proyectoId);
          if (actual) setGuardado(actual);
        }}
      />

      {(error || aviso) && (
        <div
          className={[
            "mt-4 rounded-lg border px-4 py-3 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800",
          ].join(" ")}
        >
          {error ?? aviso}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ─── Formulario ───────────────────────────────── */}
        <form onSubmit={guardar} className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-acero-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-acero-700">Panel solar</h2>
              <select
                className={`${CAMPO} max-w-xs`}
                value=""
                onChange={(e) => aplicarPreset(e.target.value)}
                aria-label="Cargar datos de un panel de referencia"
              >
                <option value="">Cargar de un panel de referencia…</option>
                {presets.map((p) => (
                  <option key={p.clave} value={p.clave}>
                    {p.marca} — {p.modelo} ({p.potencia_wp} W)
                  </option>
                ))}
              </select>
            </div>

            {presetAplicado && (
              <p className="mt-2 text-xs text-acero-500">
                Datos tomados de la{" "}
                <a
                  href={presetAplicado.fuente}
                  target="_blank"
                  rel="noreferrer"
                  className="text-solar-700 hover:underline"
                >
                  ficha técnica
                </a>
                . Si tu lote es de otra potencia, ajusta potencia, Voc y Vmp.
              </p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <Entrada etiqueta="Largo" unidad="mm, lado mayor">
                <input className={CAMPO} inputMode="decimal" value={formulario.panel_largo_mm} onChange={(e) => actualizar("panel_largo_mm", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Ancho" unidad="mm">
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
          </section>

          <section className="rounded-xl border border-acero-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-acero-700">Inversor</h2>

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
              Datos eléctricos <span className="font-normal text-acero-400">— opcionales</span>
            </p>
            <p className="text-xs text-acero-400">
              Sin el voltaje máximo y mínimo no se pueden validar los límites de string.
            </p>
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
          </section>

          <div className="flex items-center justify-end gap-3">
            {guardado && hayCambios && (
              <span className="text-xs text-solar-700">Hay cambios sin guardar</span>
            )}
            <button
              type="submit"
              disabled={guardando || (!hayCambios && guardado !== null)}
              className="rounded-lg bg-solar-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Guardando…" : guardado ? "Guardar cambios" : "Guardar configuración"}
            </button>
          </div>
        </form>

        {/* ─── Resultados ───────────────────────────────── */}
        <aside className="space-y-5">
          {!calculos ? (
            <div className="rounded-xl border border-dashed border-acero-300 bg-white p-5 text-sm text-acero-500">
              Guarda la configuración para ver el área por panel, la separación entre filas y los
              límites de string.
            </div>
          ) : (
            <>
              {hayCambios && (
                <p className="rounded-lg bg-solar-50 px-3 py-2 text-xs text-solar-800">
                  Los resultados corresponden a la última versión guardada.
                </p>
              )}

              <div className="rounded-xl border border-acero-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-acero-700">Panel</h2>
                <dl className="mt-3 space-y-2">
                  <Fila nombre="Área por panel" valor={`${numero(calculos.area_panel_m2, 3)} m²`} />
                </dl>
              </div>

              <div className="rounded-xl border border-acero-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-acero-700">Separación entre filas</h2>
                {calculos.separacion ? (
                  <>
                    <p className="mt-1 text-xs text-acero-400">
                      Para una fila de un panel en vertical. RF-03 la escala según los paneles en
                      profundidad.
                    </p>
                    <dl className="mt-3 space-y-2">
                      <Fila nombre="Sol más bajo al mediodía" valor={`${numero(calculos.separacion.elevacion_solar_grados)}°`} />
                      <Fila nombre="Altura de la fila" valor={`${numero(calculos.separacion.altura_m)} m`} />
                      <Fila nombre="Ocupación en planta" valor={`${numero(calculos.separacion.proyeccion_m)} m`} />
                      <Fila nombre="Sombra (hueco libre)" valor={`${numero(calculos.separacion.sombra_m)} m`} />
                      <div className="border-t border-acero-200 pt-2">
                        <Fila
                          nombre="Paso mínimo"
                          valor={<span className="text-solar-700">{numero(calculos.separacion.paso_minimo_m)} m</span>}
                        />
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-acero-500">Falta la latitud del proyecto.</p>
                )}
              </div>

              <div className="rounded-xl border border-acero-200 bg-white p-5">
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

              {calculos.advertencias.length > 0 && (
                <ul className="space-y-2">
                  {calculos.advertencias.map((a) => (
                    <li
                      key={a}
                      className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900"
                    >
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
