/**
 * Barra de pasos del asistente (prototipo: "1 Terreno —— 2 Panel + Inversor
 * —— 3 Caminos + Layout"). Los pasos anteriores al actual se marcan como
 * hechos; con un proyecto creado, cualquier paso se puede abrir.
 */

import { Link } from "react-router-dom";

import { PASOS, rutaPaso, type NumeroPaso } from "@/components/asistente";

interface Props {
  actual: NumeroPaso;
  /** null mientras el proyecto no existe (Paso 1 de un proyecto nuevo) */
  proyectoId: number | null;
  /** Se consulta antes de cambiar de paso: false cancela (hay cambios sin guardar) */
  puedeSalir?: () => boolean;
}

export function PasosAsistente({ actual, proyectoId, puedeSalir }: Props) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Pasos del asistente">
      {PASOS.map((paso, i) => {
        const hecho = paso.numero < actual;
        const esActual = paso.numero === actual;
        const contenido = (
          <span className="flex items-center gap-2">
            <span
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                hecho
                  ? "bg-green-500 text-acero-50"
                  : esActual
                    ? "bg-solar-500 text-acero-50"
                    : "border border-acero-300 text-acero-500",
              ].join(" ")}
              aria-hidden
            >
              {hecho ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                paso.numero
              )}
            </span>
            <span
              className={[
                "text-sm",
                hecho ? "text-green-800" : esActual ? "font-semibold text-solar-700" : "text-acero-500",
              ].join(" ")}
            >
              {paso.etiqueta}
            </span>
          </span>
        );

        return (
          <li key={paso.numero} className="flex items-center gap-3" aria-current={esActual ? "step" : undefined}>
            {proyectoId !== null && !esActual ? (
              <Link
                to={rutaPaso(proyectoId, paso.numero)}
                className="rounded-md hover:opacity-80"
                onClick={(evento) => {
                  if (puedeSalir && !puedeSalir()) evento.preventDefault();
                }}
              >
                {contenido}
              </Link>
            ) : (
              contenido
            )}
            {i < PASOS.length - 1 && <span className="hidden h-px w-10 bg-acero-300 sm:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
