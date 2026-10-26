/**
 * Seguimiento de la propuesta — RF-16, con los reportes de despacho
 * (RF-14) y de recepción (RF-15).
 *
 * Como en el prototipo (Pantalla 9): la línea de tiempo cotizada →
 * despachada → recibida → instalada, el reporte de cada etapa y, cuando
 * la propuesta está recibida, el botón para marcarla instalada. Los
 * reportes se imprimen o se guardan como PDF desde el navegador.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { FotosValidacion } from "@/components/FotosValidacion";
import { LineaTiempoPropuesta } from "@/components/LineaTiempoPropuesta";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { marcarInstalada, obtenerValidacion } from "@/services/validacion";
import { ETIQUETAS_ESTADO_ITEM, EstadoCotizacion, Permiso, type Validacion } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5 print:break-inside-avoid";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

const firmado = (n: number) => (n > 0 ? `+${n}` : String(n));

export function SeguimientoPage() {
  const { cotizacionId } = useParams();
  const { tienePermiso } = useAuth();
  const unaVez = useAccionUnica();
  const id = Number(cotizacionId);

  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    obtenerValidacion(id)
      .then((v) => {
        if (!cancelado) setValidacion(v);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudo cargar el seguimiento"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  async function instalar() {
    if (!validacion) return;
    if (!window.confirm("¿Marcar la propuesta como instalada? Es la etapa final y no se puede deshacer.")) return;
    setErrorAccion(null);
    setInstalando(true);
    try {
      setValidacion(await marcarInstalada(validacion.cotizacion_id));
    } catch (e) {
      setErrorAccion(mensajeDeError(e, "No se pudo marcar como instalada"));
    } finally {
      setInstalando(false);
    }
  }

  if (cargando) return <p className="text-sm text-acero-500">Cargando seguimiento…</p>;
  if (error || !validacion) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? "No se encontró la cotización."}
      </p>
    );
  }

  const { despacho, recepcion } = validacion;
  const puedeInstalar =
    validacion.estado === EstadoCotizacion.RECIBIDA && tienePermiso(Permiso.RECEPCION, Permiso.HISTORIAL);
  const codigoDe = (materialId: number | null) =>
    validacion.materiales.find((m) => m.material_id === materialId)?.codigo ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-sm text-acero-500 print:hidden">
        <span>Operaciones</span>
        <span className="mx-2">/</span>
        <span>Validación de materiales</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Seguimiento</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-solar-700">{validacion.numero_proforma}</p>
          <h1 className="text-2xl font-bold text-acero-900">{validacion.cliente_nombre}</h1>
          {validacion.proyecto_nombre && <p className="text-sm text-acero-500">{validacion.proyecto_nombre}</p>}
        </div>
        <div className="flex items-center gap-3">
          <EstadoCotizacionBadge estado={validacion.estado} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-acero-300 px-3 py-1.5 text-sm text-acero-700 hover:bg-acero-100 print:hidden"
          >
            Imprimir o guardar PDF
          </button>
        </div>
      </div>

      <section className={TARJETA}>
        <h2 className={TITULO_TARJETA}>ESTADO DE LA PROPUESTA</h2>
        <div className="mt-4">
          <LineaTiempoPropuesta eventos={validacion.linea_tiempo} />
        </div>
        {errorAccion && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {errorAccion}
          </p>
        )}
        {puedeInstalar && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 print:hidden">
            <p className="text-sm text-sky-800">Cuando la instalación concluya, registra la etapa final.</p>
            <button
              type="button"
              onClick={() => void unaVez("instalar", instalar)}
              disabled={instalando}
              className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
            >
              {instalando ? "Registrando…" : "Marcar como instalada"}
            </button>
          </div>
        )}
      </section>

      {despacho ? (
        <section className={TARJETA}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-acero-900">Reporte de despacho</h2>
            <p className="text-xs text-acero-500">
              {fechaHora(despacho.created_at)} · registrado por {despacho.registrado_por}
            </p>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {[
              ["Fabricó", despacho.fabricado_por],
              ["Soldó", despacho.soldado_por],
              ["Contó", despacho.contado_por],
              ["Despachó", despacho.despachado_por],
              ["Destino", despacho.destino],
            ].map(([titulo, valor]) => (
              <div key={titulo} className="flex justify-between gap-4">
                <dt className="text-acero-500">{titulo}</dt>
                <dd className="text-right text-acero-800">{valor}</dd>
              </div>
            ))}
          </dl>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="py-2 font-medium">Material</th>
                <th className="py-2 text-right font-medium">Cotizada</th>
                <th className="py-2 text-right font-medium">Conteo IA</th>
                <th className="py-2 text-right font-medium">Despachada</th>
                <th className="py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {despacho.items.map((i) => (
                <tr key={i.material_id}>
                  <td className="py-1.5">
                    <span className="font-mono text-xs text-acero-500">{i.codigo}</span>
                    <span className="ml-2 text-acero-700">{i.nombre}</span>
                  </td>
                  <td className="py-1.5 text-right text-acero-700">{i.cantidad_cotizada}</td>
                  <td className="py-1.5 text-right text-acero-500">{i.conteo_ia ?? "—"}</td>
                  <td className="py-1.5 text-right text-acero-800">{i.cantidad_despachada}</td>
                  <td className={`py-1.5 text-right font-medium ${i.diferencia ? "text-amber-700" : "text-acero-400"}`}>
                    {firmado(i.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {despacho.justificacion && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Justificación de las diferencias</p>
              <p className="mt-1">{despacho.justificacion}</p>
            </div>
          )}
          <h3 className="mt-4 text-sm font-semibold text-acero-900">Fotos del lote</h3>
          <div className="mt-2">
            <FotosValidacion cotizacionId={validacion.cotizacion_id} fotos={despacho.fotos} materialDe={codigoDe} />
          </div>
        </section>
      ) : (
        <section className={`${TARJETA} text-sm text-acero-500`}>
          El lote todavía no se despacha.{" "}
          {tienePermiso(Permiso.DESPACHO) && (
            <Link
              to={`/validacion/despacho/${validacion.cotizacion_id}`}
              className="font-semibold text-solar-700 hover:underline"
            >
              Registrar el despacho
            </Link>
          )}
        </section>
      )}

      {recepcion ? (
        <section className={TARJETA}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-acero-900">Reporte de recepción</h2>
            <p className="text-xs text-acero-500">
              {fechaHora(recepcion.created_at)} · recibido por {recepcion.recibido_por}
            </p>
          </div>
          <p className="mt-2 text-sm text-acero-600">
            {recepcion.revisados} de {recepcion.items.length} materiales revisados · {recepcion.diferencias} con
            diferencia · {recepcion.pendientes} pendientes
          </p>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="py-2 font-medium">Material</th>
                <th className="py-2 text-right font-medium">Despachada</th>
                <th className="py-2 text-right font-medium">Recibida</th>
                <th className="py-2 text-right font-medium">Diferencia</th>
                <th className="py-2 pl-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {recepcion.items.map((i) => (
                <tr key={i.material_id}>
                  <td className="py-1.5">
                    <span className="font-mono text-xs text-acero-500">{i.codigo}</span>
                    <span className="ml-2 text-acero-700">{i.nombre}</span>
                    {i.observacion && <p className="text-xs text-amber-800">{i.observacion}</p>}
                  </td>
                  <td className="py-1.5 text-right text-acero-700">{i.cantidad_esperada}</td>
                  <td className="py-1.5 text-right text-acero-800">{i.cantidad_recibida ?? "—"}</td>
                  <td className={`py-1.5 text-right font-medium ${i.diferencia ? "text-amber-700" : "text-acero-400"}`}>
                    {i.diferencia === null ? "—" : firmado(i.diferencia)}
                  </td>
                  <td className="py-1.5 pl-4 text-acero-700">{ETIQUETAS_ESTADO_ITEM[i.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recepcion.observaciones && (
            <div className="mt-4 rounded-lg border border-acero-200 bg-acero-50 p-3 text-sm text-acero-700">
              <p className="font-semibold">Observaciones</p>
              <p className="mt-1">{recepcion.observaciones}</p>
            </div>
          )}
          <h3 className="mt-4 text-sm font-semibold text-acero-900">Evidencia de la recepción</h3>
          <div className="mt-2">
            <FotosValidacion cotizacionId={validacion.cotizacion_id} fotos={recepcion.fotos} />
          </div>
        </section>
      ) : (
        despacho && (
          <section className={`${TARJETA} text-sm text-acero-500`}>
            El lote todavía no se recibe en obra.{" "}
            {tienePermiso(Permiso.RECEPCION) && (
              <Link
                to={`/validacion/recepcion/${validacion.cotizacion_id}`}
                className="font-semibold text-solar-700 hover:underline"
              >
                Registrar la recepción
              </Link>
            )}
          </section>
        )
      )}
    </div>
  );
}
