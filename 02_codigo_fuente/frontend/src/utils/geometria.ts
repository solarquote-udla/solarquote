/**
 * Utilidades geométricas del lado del cliente.
 *
 * Solo sirven para dibujar: encuadre del lienzo, cuadrícula, cotas.
 * Las áreas oficiales (bruta, caminos, útil) las calcula el backend con
 * Shapely, que resuelve correctamente los cruces entre caminos. Duplicar
 * ese cálculo aquí abriría la puerta a que la pantalla y la base
 * muestren cifras distintas.
 */

import type { Punto } from "@/types/api";

export interface Limites {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Encuadre que contiene todos los puntos y, como mínimo, el lienzo base.
 *
 * Partir del lienzo base evita que la vista salte al primer clic: con un
 * solo punto, el encuadre "ajustado" sería un área diminuta alrededor
 * de él. El margen deja espacio para seguir haciendo clic fuera del
 * polígono sin que el borde del lienzo lo impida.
 */
export function encuadre(puntos: Punto[], base: { ancho: number; alto: number }): Limites {
  let minX = 0;
  let minY = 0;
  let maxX = base.ancho;
  let maxY = base.alto;

  for (const [x, y] of puntos) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const margen = Math.max(maxX - minX, maxY - minY) * 0.08;

  return {
    minX: minX - margen,
    minY: minY - margen,
    maxX: maxX + margen,
    maxY: maxY + margen,
  };
}

/**
 * Separación de la cuadrícula para que haya del orden de diez líneas
 * visibles, redondeada a un valor que se lee bien: 1, 2, 5, 10, 20…
 */
export function pasoCuadricula(extension: number): number {
  const bruto = extension / 10;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / magnitud;

  if (normalizado < 1.5) return magnitud;
  if (normalizado < 3.5) return 2 * magnitud;
  if (normalizado < 7.5) return 5 * magnitud;
  return 10 * magnitud;
}

/** Valores de cuadrícula dentro de [desde, hasta]. */
export function marcas(desde: number, hasta: number, paso: number): number[] {
  const resultado: number[] = [];
  for (let v = Math.ceil(desde / paso) * paso; v <= hasta; v += paso) {
    // Evita el -0 y los errores de acumulación (0.30000000000000004)
    resultado.push(Number(v.toFixed(6)) + 0);
  }
  return resultado;
}

export function ajustar(valor: number, paso: number): number {
  return Math.round(valor / paso) * paso;
}

export function distancia([x1, y1]: Punto, [x2, y2]: Punto): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Rectángulo con esquina inferior izquierda en (x, y). */
export function rectangulo(x: number, y: number, largo: number, ancho: number): Punto[] {
  return [
    [x, y],
    [x + largo, y],
    [x + largo, y + ancho],
    [x, y + ancho],
  ];
}

const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 });

export function formatearMetros(valor: number): string {
  return `${numero.format(valor)} m`;
}

/** Metros cuadrados con su equivalente en hectáreas, que es como habla HEXtructure. */
export function formatearArea(m2: number): string {
  const hectareas = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 }).format(m2 / 10_000);
  return `${numero.format(m2)} m² · ${hectareas} ha`;
}
