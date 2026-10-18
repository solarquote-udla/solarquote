/**
 * Barras (verticales u horizontales) sin librería externa — RF-13.
 *
 * Decisión con Joseph: a mano con SVG en vez de una librería de charts.
 * Menos peso en el bundle, los colores salen de las clases de Tailwind
 * (fill-solar-500, etc.) así que no hay que pelear con el tema oscuro,
 * y el ancho es 100% por CSS sobre un viewBox fijo — no hace falta
 * medir el contenedor con ResizeObserver, ni simularlo en las pruebas.
 *
 * Accesible: el <svg> lleva role="img" y aria-label con la descripción
 * completa del gráfico; cada barra tiene su propio <title> (tooltip al
 * pasar el mouse, y lo que lee un lector de pantalla por esa barra).
 */

import { useId } from "react";

export interface BarraDato {
  etiqueta: string;
  valor: number;
}

interface GraficoBarrasProps {
  datos: BarraDato[];
  /** Descripción completa para aria-label, ej. "Cotizaciones por periodo" */
  descripcion: string;
  orientacion?: "vertical" | "horizontal";
  /** Formatea el valor de cada barra (ej. moneda); por defecto, el número tal cual */
  formatoValor?: (valor: number) => string;
  /** Alto del gráfico en px. En horizontal, cada fila mide 32px si se omite */
  alto?: number;
}

const ANCHO_VISTA = 600;
const ALTO_FILA_HORIZONTAL = 32;

export function GraficoBarras({
  datos,
  descripcion,
  orientacion = "vertical",
  formatoValor = (valor) => String(valor),
  alto,
}: GraficoBarrasProps) {
  const id = useId();

  if (datos.length === 0) {
    return <p className="text-sm text-acero-500">Sin datos para este rango.</p>;
  }

  const maximo = Math.max(1, ...datos.map((d) => d.valor));

  if (orientacion === "horizontal") {
    const altoFila = alto ?? ALTO_FILA_HORIZONTAL;
    const altoTotal = datos.length * altoFila;
    const anchoEtiqueta = 150;
    const anchoDisponible = ANCHO_VISTA - anchoEtiqueta - 60;

    return (
      <svg
        role="img"
        aria-label={descripcion}
        viewBox={`0 0 ${ANCHO_VISTA} ${altoTotal}`}
        style={{ width: "100%", height: altoTotal }}
      >
        {datos.map((d, i) => {
          const anchoBarra = (d.valor / maximo) * anchoDisponible;
          const y = i * altoFila;
          return (
            <g key={`${id}-${i}`}>
              <title>{`${d.etiqueta}: ${formatoValor(d.valor)}`}</title>
              <text
                x={anchoEtiqueta - 8}
                y={y + altoFila / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-acero-600 text-[11px]"
              >
                {d.etiqueta}
              </text>
              <rect
                x={anchoEtiqueta}
                y={y + 6}
                width={Math.max(anchoBarra, 0)}
                height={altoFila - 12}
                rx={3}
                className="fill-solar-500"
              />
              <text
                x={anchoEtiqueta + anchoBarra + 6}
                y={y + altoFila / 2}
                dominantBaseline="central"
                className="fill-acero-700 text-[11px]"
              >
                {formatoValor(d.valor)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const altoGrafico = alto ?? 220;
  const margenInferior = 36;
  const margenSuperior = 18;
  const altoBarras = altoGrafico - margenInferior - margenSuperior;
  const anchoColumna = ANCHO_VISTA / datos.length;

  return (
    <svg
      role="img"
      aria-label={descripcion}
      viewBox={`0 0 ${ANCHO_VISTA} ${altoGrafico}`}
      style={{ width: "100%", height: altoGrafico }}
    >
      {datos.map((d, i) => {
        const alturaBarra = (d.valor / maximo) * altoBarras;
        const x = i * anchoColumna;
        const y = margenSuperior + (altoBarras - alturaBarra);
        return (
          <g key={`${id}-${i}`}>
            <title>{`${d.etiqueta}: ${formatoValor(d.valor)}`}</title>
            {d.valor > 0 && (
              <text x={x + anchoColumna / 2} y={y - 4} textAnchor="middle" className="fill-acero-700 text-[10px]">
                {formatoValor(d.valor)}
              </text>
            )}
            <rect
              x={x + anchoColumna * 0.15}
              y={y}
              width={anchoColumna * 0.7}
              height={alturaBarra}
              rx={3}
              className="fill-solar-500"
            />
            <text
              x={x + anchoColumna / 2}
              y={altoGrafico - margenInferior + 14}
              textAnchor="middle"
              className="fill-acero-500 text-[10px]"
            >
              {d.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
