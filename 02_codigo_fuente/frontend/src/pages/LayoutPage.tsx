/**
 * Generación del layout solar — RF-03.
 *
 * El usuario elige L, el pasillo, la tolerancia de proporción y,
 * opcionalmente, una capacidad en kWp. El backend distribuye los bloques
 * y devuelve todo calculado; esta pantalla solo lo muestra. Igual que en
 * terreno y equipo, ninguna cifra se recalcula en el navegador.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { PestanasProyecto } from "@/components/PestanasProyecto";
import { VistaLayout } from "@/components/VistaLayout";
import { mensajeDeError } from "@/services/api";
import { obtenerEquipo } from "@/services/equipo";
import { generarLayout, obtenerLayout } from "@/services/layout";
import { obtenerProyecto } from "@/services/proyectos";
import { obtenerTerreno } from "@/services/terreno";
import type { ConfiguracionEquipo, Layout, LayoutGenerar, Proyecto, Terreno } from "@/types/api";
import { formatearArea } from "@/utils/geometria";

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

    const resultado = aPeticion(parametros);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }

    setGenerando(true);
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
      <nav className="text-sm text-acero-500">
        <Link to="/proyectos" className="hover:text-solar-700 hover:underline">
          Proyectos
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">{proyecto.nombre}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-acero-900">Layout solar</h1>
        <EstadoProyectoBadge estado={proyecto.estado} />
      </div>
      <p className="mt-1 text-sm text-acero-500">
        {proyecto.cliente.nombre}
        {proyecto.ubicacion ? ` · ${proyecto.ubicacion}` : ""}
      </p>

      <PestanasProyecto proyectoId={proyecto.id} />

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
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={!puedeGenerar || generando}
                className="rounded-lg bg-solar-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generando ? "Generando…" : layout ? "Volver a generar" : "Generar layout"}
              </button>
            </div>
          </form>

          {terreno && (
            <VistaLayout
              terreno={terreno.vertices}
              caminos={terreno.caminos.map((c) => c.vertices)}
              bloques={layout?.bloques ?? []}
              orientacionNorte={terreno.orientacion_norte}
              desactualizado={layout?.desactualizado}
            />
          )}
        </div>

        {/* ─── Resultados ───────────────────────────────── */}
        <aside className="space-y-5">
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
