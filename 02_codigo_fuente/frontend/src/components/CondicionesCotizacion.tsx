/**
 * Condiciones con las que se emitió la cotización (plazo, validez,
 * garantía, forma de pago sin IVA y precio por Wp), en el detalle del
 * historial. Las cotizaciones anteriores a estas condiciones no las tienen.
 */
import type { CotizacionDetalle } from "@/types/api";
import { formatoMoneda } from "@/utils/dinero";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function CondicionesCotizacion({ cotizacion }: { cotizacion: CotizacionDetalle }) {
  const { subtotal } = cotizacion;
  // Una cotización anterior a estas condiciones no las trae
  const plazo_dias = cotizacion.plazo_dias ?? null;
  const validez_dias = cotizacion.validez_dias ?? null;
  const garantia_anios = cotizacion.garantia_anios ?? null;
  const precio_wp = cotizacion.precio_wp ?? null;
  const pagos = cotizacion.pagos ?? [];
  const sinCondiciones = plazo_dias === null && validez_dias === null && garantia_anios === null && pagos.length === 0;

  return (
    <section className="mt-6 rounded-xl border border-acero-200 bg-superficie p-5" aria-label="Condiciones de la proforma">
      <h2 className="text-sm font-semibold text-acero-900">Condiciones de la proforma</h2>
      {sinCondiciones ? (
        <p className="mt-2 text-sm text-acero-500">Emitida antes de que las condiciones se guardaran por cotización.</p>
      ) : (
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-acero-500">Plazo de entrega</dt>
              <dd className="text-acero-800">{plazo_dias !== null ? plural(plazo_dias, "día", "días") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero-500">Validez de la oferta</dt>
              <dd className="text-acero-800">{validez_dias !== null ? plural(validez_dias, "día", "días") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero-500">Garantía</dt>
              <dd className="text-acero-800">{garantia_anios !== null ? plural(garantia_anios, "año", "años") : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-acero-500">Precio por Wp</dt>
              <dd className="font-medium text-acero-800">
                {precio_wp !== null ? `$ ${Number(precio_wp).toFixed(4).replace(".", ",")} USD/Wp` : "—"}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-medium text-acero-500">Forma de pago y valores sin IVA</p>
            <table className="mt-1 w-full text-sm">
              <tbody className="divide-y divide-acero-100">
                {pagos.map((t, i) => (
                  <tr key={i}>
                    <td className="py-1 text-acero-700">{Number(t.porcentaje)} %</td>
                    <td className="py-1 text-acero-700">{t.nombre}</td>
                    <td className="py-1 text-right text-acero-800">
                      {subtotal !== null ? formatoMoneda((Number(subtotal) * Number(t.porcentaje)) / 100) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1 text-acero-900" colSpan={2}>
                    Total sin IVA
                  </td>
                  <td className="py-1 text-right text-acero-900">{formatoMoneda(subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
