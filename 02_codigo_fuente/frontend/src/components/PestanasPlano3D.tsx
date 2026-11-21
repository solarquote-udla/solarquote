/**
 * Pestañas Plano y 3D para el layout (Paso 3 y confirmación). La vista 3D
 * se descarga recién cuando se abre la pestaña: Three.js no pesa en el
 * resto de la aplicación.
 */
import { lazy, Suspense, useState, type ReactNode } from "react";

import type { Props as Datos3D } from "@/components/Vista3D";

const Vista3D = lazy(() => import("@/components/Vista3D"));

interface Props {
  plano: ReactNode;
  datos3d: Datos3D;
  /** Motivo para no ofrecer el 3D (por ejemplo, mientras se edita). */
  sin3D?: string;
}

export function PestanasPlano3D({ plano, datos3d, sin3D }: Props) {
  const [vista, setVista] = useState<"plano" | "3d">("plano");
  const actual = sin3D ? "plano" : vista;

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-acero-300 p-0.5" role="tablist" aria-label="Vista del layout">
        {(["plano", "3d"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={actual === v}
            disabled={v === "3d" && Boolean(sin3D)}
            title={v === "3d" ? sin3D : undefined}
            onClick={() => setVista(v)}
            className={[
              "rounded-md px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              actual === v ? "bg-solar-500 text-acero-50" : "text-acero-600 hover:bg-acero-100",
            ].join(" ")}
          >
            {v === "plano" ? "Plano" : "3D"}
          </button>
        ))}
      </div>
      {actual === "plano" ? (
        plano
      ) : (
        <Suspense fallback={<p className="text-sm text-acero-500">Cargando la vista 3D…</p>}>
          <Vista3D {...datos3d} />
        </Suspense>
      )}
    </div>
  );
}
