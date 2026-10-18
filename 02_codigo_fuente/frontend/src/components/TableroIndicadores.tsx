/**
 * Indicadores del negocio en el Dashboard — RF-13.
 *
 * El Dashboard no exige permiso (lo ve todo usuario, ver menu.ts), pero
 * esta sección sí: son los mismos datos que protege el historial, así
 * que solo se pide y se muestra con HISTORIAL o GENERAR_LAYOUT — quien
 * no lo tiene (p. ej. personal de producción) simplemente no la ve.
 */

import { useEffect, useState } from "react";

import { GraficoBarras } from "@/components/graficos/GraficoBarras";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { obtenerTablero } from "@/services/tablero";
import { ETIQUETAS_ESTADO_COTIZACION, Permiso, type Tablero } from "@/types/api";
import { hoyISO, primerDiaHaceMeses } from "@/utils/fechas";

const OPCIONES_PERIODO = [3, 6, 12] as const;
const PERIODO_POR_DEFECTO = 6;

const formatoMoneda = (valor: number) => `$${valor.toFixed(2)}`;

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

  const totalDelRango = tablero?.cotizaciones_por_periodo.reduce((acc, p) => acc + Number(p.total), 0) ?? 0;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-acero-900">Indicadores</h2>
        <div className="flex gap-1 rounded-lg border border-acero-200 bg-superficie p-1" role="group" aria-label="Periodo del tablero">
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

      {cargando ? (
        <p className="mt-4 text-sm text-acero-500">Cargando indicadores…</p>
      ) : error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : tablero ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <article className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h3 className="text-sm font-semibold text-acero-900">Cotizaciones por periodo</h3>
            <p className="text-xs text-acero-500">Total cotizado en el rango: {formatoMoneda(totalDelRango)}</p>
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
      ) : null}
    </section>
  );
}
