/**
 * Condiciones de la proforma en la confirmación (acuerdo con Santi del 17
 * de noviembre): plazo, validez, garantía y forma de pago, que cambian
 * según el cliente. Parte de los valores de la configuración.
 *
 * Presentacional: el estado vive en useCondicionesProforma.
 */
import { Campo } from "@/components/Campo";
import type { EstadoCondiciones } from "@/hooks/useCondicionesProforma";
import { bordeCampo } from "@/utils/campo";
import { PLANTILLAS_PAGO, sumaPagos, type FormularioCondiciones } from "@/utils/condiciones";

const CAMPO = "mt-1 w-full rounded-lg border bg-acero-50 px-3 py-1.5 text-sm text-acero-900 focus:outline-none focus:ring-1";
const BOTON_CHICO =
  "rounded-md border border-acero-300 px-2 py-1 text-xs text-acero-700 transition hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-40";

export function FormularioCondiciones({ estado, deshabilitado = false }: { estado: EstadoCondiciones; deshabilitado?: boolean }) {
  const { formulario: f, setFormulario, porDefecto, errores, errorCarga } = estado;

  if (errorCarga) {
    return (
      <div className="rounded-xl border border-acero-200 bg-superficie p-5 text-xs text-acero-500">
        No se pudieron cargar las condiciones de la proforma: se usarán las de la configuración.
      </div>
    );
  }
  if (!f) {
    return <p className="text-xs text-acero-500">Cargando condiciones de la proforma…</p>;
  }

  const cambiar = (cambios: Partial<FormularioCondiciones>) => setFormulario({ ...f, ...cambios });
  const cambiarTramo = (i: number, campo: "nombre" | "porcentaje", valor: string) =>
    cambiar({ pagos: f.pagos.map((t, k) => (k === i ? { ...t, [campo]: valor } : t)) });
  const suma = sumaPagos(f);

  return (
    <section className="rounded-xl border border-acero-200 bg-superficie p-5" aria-label="Condiciones de la proforma">
      <h2 className="text-xs font-semibold tracking-wider text-acero-400">CONDICIONES DE LA PROFORMA</h2>

      <fieldset disabled={deshabilitado} className="mt-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Campo etiqueta="Plazo (días)" obligatorio error={errores.plazo}>
            <input className={`${CAMPO} ${bordeCampo(errores.plazo)}`} inputMode="numeric" value={f.plazo} onChange={(e) => cambiar({ plazo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Validez (días)" obligatorio error={errores.validez}>
            <input className={`${CAMPO} ${bordeCampo(errores.validez)}`} inputMode="numeric" value={f.validez} onChange={(e) => cambiar({ validez: e.target.value })} />
          </Campo>
          <Campo etiqueta="Garantía (años)" obligatorio error={errores.garantia}>
            <input className={`${CAMPO} ${bordeCampo(errores.garantia)}`} inputMode="numeric" value={f.garantia} onChange={(e) => cambiar({ garantia: e.target.value })} />
          </Campo>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-acero-600">Forma de pago (sobre el subtotal, sin IVA)</p>
            <div className="flex flex-wrap gap-1">
              {PLANTILLAS_PAGO.map((p) => (
                <button key={p.etiqueta} type="button" className={BOTON_CHICO} onClick={() => cambiar({ pagos: p.pagos })}>
                  {p.etiqueta}
                </button>
              ))}
              {porDefecto && (
                <button type="button" className={BOTON_CHICO} onClick={() => cambiar({ pagos: porDefecto.pagos })}>
                  Configuración
                </button>
              )}
            </div>
          </div>

          <ul className="mt-2 space-y-2" aria-label="Tramos de pago">
            {f.pagos.map((t, i) => {
              const errorNombre = errores[`pagos.${i}.nombre`];
              const errorPorcentaje = errores[`pagos.${i}.porcentaje`];
              return (
                <li key={i} className="flex items-start gap-2">
                  <Campo className="flex-1" etiqueta={<span className="sr-only">Etapa del tramo {i + 1}</span>} error={errorNombre}>
                    <input className={`${CAMPO} mt-0 ${bordeCampo(errorNombre)}`} value={t.nombre} maxLength={100} placeholder="Anticipo" onChange={(e) => cambiarTramo(i, "nombre", e.target.value)} />
                  </Campo>
                  <Campo className="w-24" etiqueta={<span className="sr-only">Porcentaje del tramo {i + 1}</span>} error={errorPorcentaje}>
                    <input className={`${CAMPO} mt-0 text-right ${bordeCampo(errorPorcentaje)}`} inputMode="decimal" value={t.porcentaje} onChange={(e) => cambiarTramo(i, "porcentaje", e.target.value)} />
                  </Campo>
                  <span className="pt-2 text-xs text-acero-500">%</span>
                  <button
                    type="button"
                    className="pt-1.5 text-acero-400 hover:text-red-600 disabled:opacity-30"
                    onClick={() => cambiar({ pagos: f.pagos.filter((_, k) => k !== i) })}
                    disabled={f.pagos.length <= 1}
                    aria-label={`Quitar el tramo ${i + 1}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 flex items-center justify-between">
            <button type="button" className={BOTON_CHICO} onClick={() => cambiar({ pagos: [...f.pagos, { nombre: "", porcentaje: "" }] })}>
              + Agregar tramo
            </button>
            <span className={`text-xs font-medium ${suma === 100 ? "text-green-700" : "text-red-600"}`} data-testid="suma-pagos">
              Suma: {suma} %
            </span>
          </div>
          {errores.pagos && <p className="mt-1 text-xs text-red-600">{errores.pagos}</p>}
        </div>

        <p className="text-[11px] text-acero-400">El precio por Wp se calcula al emitir: subtotal ÷ potencia en Wp.</p>
      </fieldset>
    </section>
  );
}
