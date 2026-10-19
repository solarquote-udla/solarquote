/**
 * Diagrama de confirmación — RF-05.
 *
 * Como en el prototipo: el plano con los bloques coloreados por inversor a
 * la izquierda y, a la derecha, el resumen, el detalle de bloques (L, A,
 * B y su estado), los avisos de proporción antisísmica y el equipo. El
 * Gerente confirma explícitamente el diseño antes de calcular materiales;
 * si hay bloques fuera de proporción, debe aceptarlos bajo su
 * responsabilidad o volver a ajustarlos.
 *
 * "Confirmar y generar cotización" emite la cotización con los bloques
 * del layout (el backend la arma y le asigna el número de proforma) y
 * abre su detalle.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { VistaLayout } from "@/components/VistaLayout";
import { rutaPaso } from "@/components/asistente";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { mensajeDeError } from "@/services/api";
import { obtenerEquipo } from "@/services/equipo";
import { confirmarYCotizar, obtenerLayout } from "@/services/layout";
import { obtenerProyecto } from "@/services/proyectos";
import { obtenerTerreno } from "@/services/terreno";
import type { ConfiguracionEquipo, Layout, Proyecto, Terreno } from "@/types/api";
import { limitesDe } from "@/utils/geometria";
import { colorInversor } from "@/utils/inversores";

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

/** "120 m × 88 m · 10.560 m² · Norte 0°" */
function describirTerreno(t: Terreno): string {
  const caja = limitesDe(t.vertices);
  const medidas = caja ? `${numero(caja.maxX - caja.minX, 1)} m × ${numero(caja.maxY - caja.minY, 1)} m · ` : "";
  const norte = t.orientacion_norte == null ? "norte sin definir" : `norte a ${numero(t.orientacion_norte, 1)}°`;
  return `${medidas}${numero(t.areas.area_bruta, 0)} m² · ${norte}`;
}

export function ConfirmacionPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;
  const navegar = useNavigate();
  const unaVez = useAccionUnica();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [terreno, setTerreno] = useState<Terreno | null>(null);
  const [equipo, setEquipo] = useState<ConfiguracionEquipo | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [acepta, setAcepta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;
    Promise.all([obtenerProyecto(proyectoId), obtenerTerreno(proyectoId), obtenerEquipo(proyectoId), obtenerLayout(proyectoId)])
      .then(([p, t, e, l]) => {
        if (cancelado) return;
        setProyecto(p);
        setTerreno(t);
        setEquipo(e);
        setLayout(l);
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

  const fuera = layout?.tipos.filter((t) => !t.en_proporcion) ?? [];
  const bloquesFuera = fuera.reduce((s, t) => s + t.repeticiones, 0);
  const cotizado = proyecto.cotizacion_id !== null;

  // Por qué no se puede confirmar, en el orden en que conviene resolverlo
  const impedimento = cotizado
    ? null
    : !layout
      ? "Todavía no hay layout: genéralo en el Paso 3."
      : layout.desactualizado
        ? "El terreno, los caminos, el panel o la latitud cambiaron después de generar el layout. Vuelve a generarlo en el Paso 3."
        : bloquesFuera > 0 && !acepta
          ? "Ajusta los bloques fuera de proporción o acéptalos bajo tu responsabilidad."
          : null;

  async function confirmar() {
    setError(null);
    setConfirmando(true);
    try {
      const emitida = await confirmarYCotizar(proyectoId, { acepta_fuera_de_proporcion: acepta });
      void navegar(`/cotizaciones/${emitida.id}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo generar la cotización"));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="text-sm text-acero-500">
          <span>Generación</span>
          <span className="mx-2">/</span>
          <Link to={rutaPaso(proyecto.id, 3)} className="hover:text-solar-700 hover:underline">
            Generar layout solar
          </Link>
          <span className="mx-2">/</span>
          <span className="text-acero-700">Diagrama de confirmación</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-acero-800">
            {proyecto.numero_proforma ?? <span className="font-normal text-acero-500">Proforma: se asigna al confirmar</span>}
          </span>
          {cotizado ? (
            <EstadoProyectoBadge estado={proyecto.estado} />
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
              En revisión
            </span>
          )}
        </div>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-acero-900">{proyecto.nombre}</h1>
      <p className="mt-1 text-sm text-acero-500">
        {proyecto.cliente.nombre}
        {terreno && ` · ${describirTerreno(terreno)}`}
      </p>

      {cotizado && (
        <div role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Este diseño ya se confirmó y se cotizó con la proforma {proyecto.numero_proforma ?? "sin número"}.{" "}
          <Link to={`/cotizaciones/${proyecto.cotizacion_id}`} className="font-semibold underline">
            Ver cotización
          </Link>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {terreno && layout ? (
            <VistaLayout
              terreno={terreno.vertices}
              caminos={terreno.caminos.map((c) => c.vertices)}
              bloques={layout.bloques.map((b, i) => ({ ...b, clave: i }))}
              orientacionNorte={terreno.orientacion_norte}
              desactualizado={layout.desactualizado}
              inversores={Math.max(layout.inversores.length, 1)}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-acero-300 bg-superficie p-10 text-center text-sm text-acero-500">
              Todavía no hay layout para confirmar.{" "}
              <Link to={rutaPaso(proyecto.id, 3)} className="font-semibold text-solar-700 underline">
                Ir al Paso 3
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {/* ─── Resumen ─────────────────────────────── */}
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-acero-400">RESUMEN</h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[
                { etiqueta: "paneles", valor: layout ? numero(layout.total_paneles, 0) : "–", clase: "text-sky-800" },
                { etiqueta: "kWp", valor: layout ? numero(layout.potencia_kwp, 1) : "–", clase: "text-green-800" },
                { etiqueta: "bloques", valor: layout ? numero(layout.bloques.length, 0) : "–", clase: "text-acero-900" },
                {
                  etiqueta: bloquesFuera === 1 ? "advertencia" : "advertencias",
                  valor: layout ? String(bloquesFuera) : "–",
                  clase: bloquesFuera ? "text-amber-700" : "text-acero-900",
                },
              ].map((d) => (
                <div key={d.etiqueta} className="rounded-xl border border-acero-200 bg-superficie px-4 py-3">
                  <p className={`text-xl font-bold ${d.clase}`}>{d.valor}</p>
                  <p className="text-xs text-acero-500">{d.etiqueta}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Detalle de bloques: L, A, B ─────────── */}
          {layout && (
            <div className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h2 className="text-xs font-semibold tracking-wider text-acero-400">DETALLE DE BLOQUES</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-acero-400">
                    <th className="pb-2 font-medium">Tipo</th>
                    <th className="pb-2 text-right font-medium">L</th>
                    <th className="pb-2 text-right font-medium">A</th>
                    <th className="pb-2 text-right font-medium">B</th>
                    <th className="pb-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-acero-100">
                  {layout.tipos.map((t) => (
                    <tr key={t.tipo}>
                      <td className="py-1.5 font-semibold text-acero-800">{t.tipo}</td>
                      <td className="py-1.5 text-right text-acero-700">{t.paneles_largo}</td>
                      <td className="py-1.5 text-right text-acero-700">{t.paneles_ancho}</td>
                      <td className="py-1.5 text-right text-acero-700">{t.repeticiones}</td>
                      <td className="py-1.5 text-right">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            t.en_proporcion ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900",
                          ].join(" ")}
                        >
                          {t.en_proporcion ? "OK" : "Revisar"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-acero-400">L: paneles en el largo · A: en el ancho · B: bloques iguales</p>
            </div>
          )}

          {/* ─── Proporción antisísmica ──────────────── */}
          {layout &&
            fuera.map((t) => (
              <div key={t.tipo} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Tipo {t.tipo}: proporción antisísmica</p>
                <p className="mt-1 text-xs">
                  {t.repeticiones} bloque{t.repeticiones === 1 ? "" : "s"} de {t.paneles_largo} × {t.paneles_ancho} con
                  proporción {numero(t.proporcion)} : 1, fuera de 3 : 1 ±{" "}
                  {numero(layout.parametros.tolerancia_proporcion * 100, 0)} %. Ajústalo o confírmalo bajo tu
                  responsabilidad.
                </p>
              </div>
            ))}

          {/* ─── Equipo ──────────────────────────────── */}
          {equipo && (
            <div className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h2 className="text-xs font-semibold tracking-wider text-acero-400">EQUIPO</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-acero-500">Panel</dt>
                  <dd className="text-right font-medium text-acero-800">
                    {equipo.panel.marca} {equipo.panel.potencia_wp} Wp
                  </dd>
                </div>
                {equipo.inversores.map((inv, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <dt className="text-acero-500">Inv. {i + 1}</dt>
                    <dd className={`text-right font-medium ${colorInversor(i).texto}`}>
                      {inv.marca} {inv.modelo} {numero(inv.potencia_kw, 1)} kW
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* ─── Confirmación ────────────────────────── */}
          {!cotizado && (
            <div className="space-y-3">
              {layout && !layout.desactualizado && bloquesFuera > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                    checked={acepta}
                    onChange={(e) => setAcepta(e.target.checked)}
                  />
                  <span>
                    Acepto bajo mi responsabilidad {bloquesFuera === 1 ? "el bloque" : `los ${bloquesFuera} bloques`} fuera de
                    la proporción antisísmica.
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={() => void unaVez("confirmar", confirmar)}
                disabled={impedimento !== null || confirmando}
                title={impedimento ?? undefined}
                className="w-full rounded-lg bg-solar-500 px-4 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmando ? "Generando cotización…" : "Confirmar y generar cotización"}
              </button>
              {impedimento && <p className="text-xs text-acero-500">{impedimento}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Link
              to={rutaPaso(proyecto.id, 3)}
              className="flex-1 rounded-lg border border-acero-300 px-4 py-2 text-center text-sm text-acero-700 hover:bg-acero-100"
            >
              ← Volver
            </Link>
            {!cotizado && (
              <Link
                to={rutaPaso(proyecto.id, 3)}
                state={{ editar: true }}
                className="flex-1 rounded-lg border border-acero-300 px-4 py-2 text-center text-sm text-acero-700 hover:bg-acero-100"
              >
                Editar layout
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
