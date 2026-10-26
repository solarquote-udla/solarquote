/**
 * Columna con las cotizaciones por despachar o por recibir, con búsqueda
 * por proforma, cliente o proyecto. La seleccionada se resalta.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { mensajeDeError } from "@/services/api";
import type { CotizacionAValidar } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

interface Props {
  titulo: string;
  cargar: (buscar?: string) => Promise<CotizacionAValidar[]>;
  rutaDe: (cotizacionId: number) => string;
  seleccionada: number | null;
  vacio: string;
  /** Cambia cuando la lista debe volver a pedirse (p. ej. tras confirmar) */
  version?: number;
}

export function ListaCotizacionesValidacion({ titulo, cargar, rutaDe, seleccionada, vacio, version = 0 }: Props) {
  const [buscar, setBuscar] = useState("");
  const [filas, setFilas] = useState<CotizacionAValidar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const espera = setTimeout(
      () => {
        cargar(buscar.trim() || undefined)
          .then((datos) => {
            if (!cancelado) {
              setFilas(datos);
              setError(null);
            }
          })
          .catch((e) => {
            if (!cancelado) setError(mensajeDeError(e, "No se pudo cargar la lista"));
          })
          .finally(() => {
            if (!cancelado) setCargando(false);
          });
      },
      buscar ? 300 : 0,
    );
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [buscar, cargar, version]);

  return (
    <section className="rounded-xl border border-acero-200 bg-superficie">
      <div className="border-b border-acero-200 p-4">
        <h2 className="text-xs font-semibold tracking-wider text-acero-400">{titulo}</h2>
        <input
          type="search"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por proforma, cliente o proyecto"
          aria-label="Buscar cotización"
          maxLength={100}
          className="mt-2 w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-1.5 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none"
        />
      </div>
      {error ? (
        <p className="p-4 text-sm text-red-700">{error}</p>
      ) : cargando ? (
        <p className="p-4 text-sm text-acero-500">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="p-4 text-sm text-acero-500">{buscar ? "Ninguna cotización coincide con la búsqueda." : vacio}</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-acero-100 overflow-y-auto">
          {filas.map((f) => (
            <li key={f.cotizacion_id}>
              <Link
                to={rutaDe(f.cotizacion_id)}
                aria-current={f.cotizacion_id === seleccionada ? "true" : undefined}
                className={[
                  "block px-4 py-3 transition",
                  f.cotizacion_id === seleccionada ? "border-l-4 border-solar-500 bg-solar-50" : "hover:bg-acero-100",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm text-solar-700">{f.numero_proforma ?? `#${f.cotizacion_id}`}</span>
                  <EstadoCotizacionBadge estado={f.estado} />
                </div>
                <p className="mt-0.5 text-sm text-acero-800">{f.cliente_nombre}</p>
                <p className="text-xs text-acero-500">
                  {f.proyecto_nombre ? `${f.proyecto_nombre} · ` : ""}
                  {f.fecha_despacho ? `Despachada ${fechaHora(f.fecha_despacho)}` : fechaHora(f.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
