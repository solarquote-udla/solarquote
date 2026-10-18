/**
 * Indicadores del negocio en el Dashboard — RF-13.
 *
 * El Dashboard no exige permiso (lo ve todo usuario, ver menu.ts), pero
 * esta sección sí: son los mismos datos que protege el historial, así
 * que solo se pide y se muestra con HISTORIAL o GENERAR_LAYOUT — quien
 * no lo tiene (p. ej. personal de producción) simplemente no la ve.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { GraficoBarras } from "@/components/graficos/GraficoBarras";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { obtenerTablero } from "@/services/tablero";
import { ETIQUETAS_ESTADO_COTIZACION, Permiso, type Tablero } from "@/types/api";
import { hoyISO, primerDiaHaceMeses } from "@/utils/fechas";

const OPCIONES_PERIODO = [3, 6, 12] as const;
const PERIODO_POR_DEFECTO = 6;

// en-US y no es-EC: con es-EC el separador decimal es coma ("$436,77"),
// distinto del "$436.77" que ya usan Precios y Materiales.
const formatoIntl = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatoMoneda = (valor: number) => formatoIntl.format(valor);
const formatoEntero = new Intl.NumberFormat("en-US");

// Supuesto acordado con Joseph: 45 min una cotización manual, 10 min con
// el asistente de principio a fin (terreno + equipo + layout + cotizar).
const MINUTOS_COTIZACION_MANUAL = 45;
const MINUTOS_COTIZACION_SISTEMA = 10;
const MINUTOS_AHORRADOS_POR_COTIZACION = MINUTOS_COTIZACION_MANUAL - MINUTOS_COTIZACION_SISTEMA;

/** 90 → "1 h 30 min"; 35 → "35 min" */
function formatoTiempoAhorrado(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

const ACCESOS_DIRECTOS: { ruta: string; etiqueta: string; permisos: Permiso[] }[] = [
  { ruta: "/generar", etiqueta: "Generar layout solar", permisos: [Permiso.GENERAR_LAYOUT] },
  { ruta: "/historial", etiqueta: "Historial", permisos: [Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT] },
  { ruta: "/clientes", etiqueta: "Clientes", permisos: [Permiso.CLIENTES] },
];

/** "2026-05" → "may 26" */
function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-EC", { month: "short", year: "2-digit" });
}

export function TableroIndicadores() {
  const { tienePermiso } = useAuth();
  const puedeVer = tienePermiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT);

  const [meses, setMeses] = useState<number>(PERIODO_POR_DEFECTO);
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!puedeVer) return;
    let cancelado = false;
    // react-hooks/set-state-in-effect no deja un setState síncrono al
    // entrar al efecto; este microtask lo evita sin meter una demora
    // artificial (no hay nada que debounciar: no es un campo de texto).
    Promise.resolve().then(() => {
      if (!cancelado) setCargando(true);
    });
    obtenerTablero({ desde: primerDiaHaceMeses(meses), hasta: hoyISO() })
      .then((datos) => {
        if (!cancelado) {
          setTablero(datos);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los indicadores"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [meses, puedeVer]);

  if (!puedeVer) {
    return null;
  }

  const accesos = ACCESOS_DIRECTOS.filter((a) => tienePermiso(...a.permisos));
  const hayCotizaciones = (tablero?.resumen.total_cotizaciones ?? 0) > 0;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-acero-900">Indicadores</h2>
        <div
          className="flex gap-1 rounded-lg border border-acero-200 bg-superficie p-1"
          role="group"
          aria-label="Periodo del tablero"
        >
          {OPCIONES_PERIODO.map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={meses === opcion}
              onClick={() => setMeses(opcion)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                meses === opcion
                  ? "bg-solar-500 text-acero-50"
                  : "text-acero-500 hover:bg-acero-100 hover:text-acero-700"
              }`}
            >
              {opcion} meses
            </button>
          ))}
        </div>
      </div>

      {accesos.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {accesos.map((a) => (
            <Link
              key={a.ruta}
              to={a.ruta}
              className="rounded-lg border border-acero-200 bg-superficie px-3 py-1.5 text-sm font-medium text-acero-700 transition-colors hover:border-solar-500 hover:text-solar-700"
            >
              {a.etiqueta} →
            </Link>
          ))}
        </div>
      )}

      {/* "Cargando…" solo en la primera carga; con datos previos, se ven
          atenuados mientras llega el nuevo periodo, en vez de desaparecer. */}
      {cargando && tablero === null ? (
        <p className="mt-4 text-sm text-acero-500">Cargando indicadores…</p>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : tablero ? (
        <div className={`mt-4 transition-opacity ${cargando ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-acero-200 bg-superficie p-4">
              <p className="text-xs text-acero-500">Cotizaciones</p>
              <p className="mt-1 text-2xl font-bold text-acero-900">
                {formatoEntero.format(tablero.resumen.total_cotizaciones)}
              </p>
            </div>
            <div className="rounded-xl border border-acero-200 bg-superficie p-4">
              <p className="text-xs text-acero-500">Monto cotizado</p>
              <p className="mt-1 text-2xl font-bold text-acero-900">
                {formatoMoneda(Number(tablero.resumen.monto_total))}
              </p>
            </div>
            <div className="rounded-xl border border-acero-200 bg-superficie p-4">
              <p className="text-xs text-acero-500">Paneles cotizados</p>
              <p className="mt-1 text-2xl font-bold text-acero-900">
                {formatoEntero.format(tablero.resumen.paneles_cotizados)}
              </p>
            </div>
            <div className="rounded-xl border border-acero-200 bg-superficie p-4">
              <p className="text-xs text-acero-500">Tiempo ahorrado</p>
              <p className="mt-1 text-2xl font-bold text-acero-900">
                {formatoTiempoAhorrado(tablero.resumen.total_cotizaciones * MINUTOS_AHORRADOS_POR_COTIZACION)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {!hayCotizaciones ? (
              <div className="rounded-xl border border-acero-200 bg-superficie p-10 text-center sm:col-span-2">
                <p className="text-sm font-medium text-acero-700">No hay cotizaciones registradas en este rango</p>
                <p className="mt-1 text-sm text-acero-500">Prueba con un periodo más amplio.</p>
              </div>
            ) : (
              <>
                <article className="rounded-xl border border-acero-200 bg-superficie p-5">
                  <h3 className="text-sm font-semibold text-acero-900">Cotizaciones por periodo</h3>
                  <div className="mt-4">
                    <GraficoBarras
                      descripcion="Cotizaciones emitidas por mes"
                      datos={tablero.cotizaciones_por_periodo.map((p) => ({
                        etiqueta: etiquetaPeriodo(p.periodo),
                        valor: p.cantidad,
                      }))}
                    />
                  </div>
                </article>

                <article className="rounded-xl border border-acero-200 bg-superficie p-5">
                  <h3 className="text-sm font-semibold text-acero-900">Distribución por estado</h3>
                  <div className="mt-4">
                    <GraficoBarras
                      descripcion="Cotizaciones por estado"
                      datos={tablero.cotizaciones_por_estado.map((e) => ({
                        etiqueta: ETIQUETAS_ESTADO_COTIZACION[e.estado],
                        valor: e.cantidad,
                      }))}
                    />
                  </div>
                </article>
              </>
            )}

            <article className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h3 className="text-sm font-semibold text-acero-900">Clientes más frecuentes</h3>
              <div className="mt-4">
                <GraficoBarras
                  descripcion="Clientes con más cotizaciones"
                  orientacion="horizontal"
                  datos={tablero.clientes_frecuentes.map((c) => ({ etiqueta: c.cliente_nombre, valor: c.cantidad }))}
                />
              </div>
            </article>

            <article className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h3 className="text-sm font-semibold text-acero-900">Materiales de mayor consumo</h3>
              <div className="mt-4">
                <GraficoBarras
                  descripcion="Materiales más consumidos"
                  orientacion="horizontal"
                  datos={tablero.materiales_mas_consumidos.map((m) => ({ etiqueta: m.nombre, valor: m.cantidad }))}
                />
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
