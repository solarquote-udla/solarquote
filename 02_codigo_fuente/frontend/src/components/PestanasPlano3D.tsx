/**
 * Pestañas del layout: Mapa (si el proyecto tiene ubicación), Plano y 3D,
 * en el Paso 3 y en la confirmación. La vista 3D se descarga recién
 * cuando se abre la pestaña: Three.js no pesa en el resto de la
 * aplicación.
 *
 * La pestaña activa la puede llevar la página (`vista` y `onVista`), por
 * ejemplo para abrir el mapa al empezar a dibujar un camino.
 */
import { lazy, Suspense, useState, type ReactNode } from "react";

import type { Props as Datos3D } from "@/components/Vista3D";

const Vista3D = lazy(() => import("@/components/Vista3D"));

export type VistaLayout = "mapa" | "plano" | "3d";

const NOMBRES: Record<VistaLayout, string> = { mapa: "Mapa", plano: "Plano", "3d": "3D" };

interface Props {
  plano: ReactNode;
  datos3d: Datos3D;
  /** Vista sobre la imagen satelital; sin ella no hay pestaña Mapa. */
  mapa?: ReactNode;
  /** Motivo para no ofrecer el 3D (por ejemplo, mientras se edita). */
  sin3D?: string;
  /** Motivo para no cambiar de pestaña (por ejemplo, a medio dibujar). */
  bloqueadas?: string;
  vista?: VistaLayout;
  onVista?: (vista: VistaLayout) => void;
}

export function PestanasPlano3D({ plano, datos3d, mapa, sin3D, bloqueadas, vista, onVista }: Props) {
  const [propia, setPropia] = useState<VistaLayout>(mapa ? "mapa" : "plano");
  const pedida = vista ?? propia;
  const opciones: VistaLayout[] = mapa ? ["mapa", "plano", "3d"] : ["plano", "3d"];
  const actual = (pedida === "3d" && sin3D) || !opciones.includes(pedida) ? "plano" : pedida;
  const cambiar = (v: VistaLayout) => (onVista ? onVista(v) : setPropia(v));

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-acero-300 p-0.5" role="tablist" aria-label="Vista del layout">
        {opciones.map((v) => {
          const motivo = v !== actual ? bloqueadas || (v === "3d" ? sin3D : undefined) : undefined;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={actual === v}
              disabled={Boolean(motivo)}
              title={motivo}
              onClick={() => cambiar(v)}
              className={[
                "rounded-md px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                actual === v ? "bg-solar-500 text-acero-50" : "text-acero-600 hover:bg-acero-100",
              ].join(" ")}
            >
              {NOMBRES[v]}
            </button>
          );
        })}
      </div>
      {actual === "mapa" ? (
        mapa
      ) : actual === "plano" ? (
        plano
      ) : (
        <Suspense fallback={<p className="text-sm text-acero-500">Cargando la vista 3D…</p>}>
          <Vista3D {...datos3d} />
        </Suspense>
      )}
    </div>
  );
}
