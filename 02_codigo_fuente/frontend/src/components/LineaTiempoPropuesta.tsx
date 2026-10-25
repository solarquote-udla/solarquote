/**
 * Línea de tiempo de la propuesta — RF-16.
 *
 * Las cuatro etapas en orden (cotizada, despachada, recibida, instalada),
 * con la fecha y el responsable de las que ya se alcanzaron. La etapa
 * siguiente se resalta para que se vea qué falta.
 */

import { ETIQUETAS_ESTADO_COTIZACION, type EventoEstado } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

export function LineaTiempoPropuesta({ eventos }: { eventos: EventoEstado[] }) {
  const siguiente = eventos.findIndex((e) => !e.alcanzado);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Estado de la propuesta">
      {eventos.map((evento, i) => {
        const esSiguiente = i === siguiente;
        return (
          <li key={evento.estado} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-4 h-0.5 w-full ${evento.alcanzado ? "bg-green-500" : "bg-acero-200"}`}
              />
            )}
            <span
              className={[
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold",
                evento.alcanzado
                  ? "border-green-600 bg-green-600 text-acero-50"
                  : esSiguiente
                    ? "border-solar-500 bg-superficie text-solar-700"
                    : "border-acero-300 bg-superficie text-acero-400",
              ].join(" ")}
            >
              {evento.alcanzado ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="h-4 w-4"
                >
                  <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`mt-2 text-sm font-medium ${evento.alcanzado ? "text-acero-900" : "text-acero-500"}`}>
              {ETIQUETAS_ESTADO_COTIZACION[evento.estado]}
            </span>
            <span className="text-xs text-acero-500">
              {evento.alcanzado ? fechaHora(evento.fecha) : esSiguiente ? "siguiente" : "pendiente"}
            </span>
            {evento.responsable && <span className="text-xs text-acero-400">{evento.responsable}</span>}
          </li>
        );
      })}
    </ol>
  );
}
