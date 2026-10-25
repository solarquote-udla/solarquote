/**
 * Detalle de una cotización — RF-10.
 *
 * Todo lo que quedó persistido al emitirla: snapshot del cliente,
 * ítems (L, A, B), desglose de materiales y totales. No se recalcula
 * contra el catálogo actual — ver CotizacionDetalleLeer en el backend.
 *
 * Arriba, la línea de tiempo de la propuesta (RF-16) con el enlace a los
 * reportes de despacho y recepción.
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { LineaTiempoPropuesta } from "@/components/LineaTiempoPropuesta";
import { mensajeDeError } from "@/services/api";
import { obtenerCotizacion } from "@/services/cotizaciones";
import { obtenerValidacion } from "@/services/validacion";
import type { CotizacionDetalle, EventoEstado } from "@/types/api";
import { formatoMoneda } from "@/utils/dinero";
import { fechaHora } from "@/utils/fechas";

/** Ruta por la que se llegó al detalle (con los filtros del historial activos) */
interface EstadoNavegacion {
  volverA?: string;
}

export function CotizacionDetallePage() {
  const { cotizacionId } = useParams();
  const location = useLocation();
  const volverA = (location.state as EstadoNavegacion | null)?.volverA ?? "/historial?vista=cotizaciones";
  const [cotizacion, setCotizacion] = useState<CotizacionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineaTiempo, setLineaTiempo] = useState<EventoEstado[] | null>(null);

  // La línea de tiempo es complementaria: si no carga, el detalle se muestra igual
  useEffect(() => {
    let cancelado = false;
    obtenerValidacion(Number(cotizacionId))
      .then((v) => {
        if (!cancelado) setLineaTiempo(v.linea_tiempo);
      })
      .catch(() => {
        if (!cancelado) setLineaTiempo(null);
      });
    return () => {
      cancelado = true;
    };
  }, [cotizacionId]);

  useEffect(() => {
    let cancelado = false;
    obtenerCotizacion(Number(cotizacionId))
      .then((datos) => {
        if (!cancelado) setCotizacion(datos);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudo cargar la cotización"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cotizacionId]);

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="text-sm text-acero-500">
        <Link to={volverA} className="hover:text-solar-700 hover:underline">
          Historial
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Cotización {cotizacionId}</span>
      </nav>

      {cargando ? (
        <p className="mt-6 text-sm text-acero-500">Cargando cotización…</p>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : cotizacion ? (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-acero-900">{cotizacion.cliente_nombre}</h1>
              {cotizacion.cliente_empresa && <p className="text-sm text-acero-500">{cotizacion.cliente_empresa}</p>}
            </div>
            <div className="text-right">
              <EstadoCotizacionBadge estado={cotizacion.estado} />
              {cotizacion.numero_proforma && (
                <p className="mt-1 text-xs text-acero-500">Proforma {cotizacion.numero_proforma}</p>
              )}
            </div>
          </div>

          {lineaTiempo && (
            <section className="mt-6 rounded-xl border border-acero-200 bg-superficie p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-acero-900">Estado de la propuesta</h2>
                <Link
                  to={`/validacion/seguimiento/${cotizacion.id}`}
                  className="text-sm font-medium text-solar-700 hover:underline"
                >
                  Ver despacho y recepción
                </Link>
              </div>
              <div className="mt-4">
                <LineaTiempoPropuesta eventos={lineaTiempo} />
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <section className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h2 className="text-sm font-semibold text-acero-900">Cliente</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-acero-500">Correo</dt>
                  <dd className="text-acero-800">{cotizacion.cliente_email ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-acero-500">Teléfono</dt>
                  <dd className="text-acero-800">{cotizacion.cliente_telefono ?? "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-acero-200 bg-superficie p-5">
              <h2 className="text-sm font-semibold text-acero-900">Proyecto</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-acero-500">Nombre</dt>
                  <dd className="text-acero-800">{cotizacion.proyecto_nombre ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-acero-500">Emitida</dt>
                  <dd className="text-acero-800">{fechaHora(cotizacion.created_at)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="mt-6 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
            <h2 className="border-b border-acero-200 bg-acero-50 px-5 py-3 text-sm font-semibold text-acero-900">
              Ítems cotizados
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-acero-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Paneles en el largo (L)</th>
                  <th className="px-5 py-2 font-medium">Paneles en el ancho (A)</th>
                  <th className="px-5 py-2 font-medium">Bloques (B)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-acero-100">
                {cotizacion.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2 text-acero-700">{item.paneles_largo}</td>
                    <td className="px-5 py-2 text-acero-700">{item.paneles_ancho}</td>
                    <td className="px-5 py-2 text-acero-700">{item.bloques}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
            <h2 className="border-b border-acero-200 bg-acero-50 px-5 py-3 text-sm font-semibold text-acero-900">
              Materiales
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-acero-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Código</th>
                  <th className="px-5 py-2 font-medium">Material</th>
                  <th className="px-5 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-5 py-2 text-right font-medium">Precio unitario</th>
                  <th className="px-5 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-acero-100">
                {cotizacion.materiales.map((m) => (
                  <tr key={m.material_id}>
                    <td className="px-5 py-2 font-mono text-xs text-acero-500">{m.codigo}</td>
                    <td className="px-5 py-2 text-acero-700">
                      {m.nombre} <span className="text-acero-400">({m.unidad})</span>
                    </td>
                    <td className="px-5 py-2 text-right text-acero-700">{m.cantidad}</td>
                    <td className="px-5 py-2 text-right text-acero-700">{formatoMoneda(m.precio_unitario)}</td>
                    <td className="px-5 py-2 text-right font-medium text-acero-800">
                      {formatoMoneda(m.cantidad * Number(m.precio_unitario))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 flex justify-end">
            <dl className="w-full max-w-xs space-y-1 text-sm sm:w-72">
              <div className="flex justify-between">
                <dt className="text-acero-500">Subtotal</dt>
                <dd className="text-acero-800">{formatoMoneda(cotizacion.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-acero-500">Addendum ({cotizacion.addendum_porcentaje}%)</dt>
                <dd className="text-acero-800">{formatoMoneda(cotizacion.addendum_monto)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-acero-500">IVA ({cotizacion.iva_porcentaje ?? "—"}%)</dt>
                <dd className="text-acero-800">{formatoMoneda(cotizacion.iva_monto)}</dd>
              </div>
              <div className="flex justify-between border-t border-acero-200 pt-1 text-base font-semibold">
                <dt className="text-acero-900">Total</dt>
                <dd className="text-acero-900">{formatoMoneda(cotizacion.total)}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
