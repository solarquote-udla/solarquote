/**
 * Planta del proyecto en el detalle de la cotización (pedido de Santi, 17
 * de noviembre): el terreno, los caminos y los bloques con sus paneles,
 * igual que en el Paso 3 pero de solo lectura.
 *
 * Es complementaria: si no carga, el resto del detalle se ve igual.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { rutaPaso } from "@/components/asistente";
import { VistaLayout } from "@/components/VistaLayout";
import { useAuth } from "@/hooks/useAuth";
import { obtenerPlanta } from "@/services/planta";
import type { PlantaCotizacion as Planta } from "@/services/planta";
import { Permiso } from "@/types/api";
import { formatearArea } from "@/utils/geometria";

const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 });

export function PlantaCotizacion({ cotizacionId }: { cotizacionId: number }) {
  const { tienePermiso } = useAuth();
  const [planta, setPlanta] = useState<Planta | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");

  useEffect(() => {
    let cancelado = false;
    obtenerPlanta(cotizacionId)
      .then((p) => {
        if (cancelado) return;
        setPlanta(p);
        setEstado("listo");
      })
      .catch(() => {
        if (!cancelado) setEstado("error");
      });
    return () => {
      cancelado = true;
    };
  }, [cotizacionId]);

  const terreno = planta?.terreno ?? null;
  const layout = planta?.layout ?? null;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-acero-200 bg-superficie" aria-label="Planta del proyecto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-acero-200 bg-acero-50 px-5 py-3">
        <h2 className="text-sm font-semibold text-acero-900">Planta del proyecto</h2>
        {planta?.proyecto_id && layout && tienePermiso(Permiso.GENERAR_LAYOUT) && (
          <Link to={rutaPaso(planta.proyecto_id, 3)} className="text-xs font-medium text-solar-700 hover:underline print:hidden">
            Abrir en el Paso 3
          </Link>
        )}
      </div>

      <div className="p-5">
        {estado === "cargando" ? (
          <p className="text-sm text-acero-500">Cargando la planta…</p>
        ) : estado === "error" ? (
          <p className="text-sm text-acero-500">No se pudo cargar la planta del proyecto.</p>
        ) : !terreno ? (
          <p className="text-sm text-acero-500">
            {planta?.proyecto_id
              ? "El proyecto no tiene terreno dibujado: se cotizó desde un boceto. El plano es el archivo del cliente."
              : "Esta cotización no está asociada a un proyecto, así que no tiene planta."}
          </p>
        ) : (
          <>
            {planta?.cambio_despues_de_cotizar && (
              <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El terreno o el layout se modificaron después de emitir esta cotización: el plano puede no coincidir con
                los ítems cotizados.
              </p>
            )}
            <VistaLayout
              terreno={terreno.vertices}
              caminos={terreno.caminos.map((c) => c.vertices)}
              bloques={(layout?.bloques ?? []).map((b, i) => ({ ...b, clave: i }))}
              orientacionNorte={terreno.orientacion_norte}
              inversores={Math.max(layout?.inversores.length ?? 1, 1)}
            />
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4">
                <dt className="text-acero-500">Área del terreno</dt>
                <dd className="text-acero-800">{formatearArea(terreno.areas.area_bruta)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-acero-500">Área útil</dt>
                <dd className="text-acero-800">{formatearArea(terreno.areas.area_util)}</dd>
              </div>
              {layout ? (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-acero-500">Bloques</dt>
                    <dd className="text-acero-800">{layout.bloques.length}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-acero-500">Paneles</dt>
                    <dd className="text-acero-800">
                      {layout.total_paneles} ({numero.format(layout.potencia_kwp)} kWp)
                    </dd>
                  </div>
                </>
              ) : (
                <p className="text-acero-500 sm:col-span-2">El proyecto todavía no tiene layout generado.</p>
              )}
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
