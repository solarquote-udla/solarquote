import type { Punto } from "@/types/api";

/**
 * Bloque compacto (antisísmico) de HEXtructure, revisión del 17 de
 * noviembre de 2026: A = 3 × L, contado en paneles (4 × 12, 8 × 24,
 * 2 × 6). Es una recomendación: el sistema avisa, no bloquea. Mismas
 * reglas que `paneles_ancho_ideal` y `cumple_proporcion` del backend.
 */

export const aCompacto = (l: number) => 3 * l;

/** Compacto si A / L se aparta de 3 a lo más la tolerancia (0.2 = 20 %). */
export function esCompacto(l: number, a: number, tolerancia: number): boolean {
  return Math.abs(a / l / 3 - 1) <= tolerancia + 1e-6;
}

/**
 * Divisiones entre paneles de un bloque, como un solo trazo SVG.
 *
 * Los vértices llegan como [SE, NE, NO, SO]: de SO a SE va el largo (L
 * paneles, en la pendiente) y de SO a NO el ancho (A paneles). Las
 * separaciones entre paneles (centímetros) no se ven a esta escala: se
 * reparten las divisiones en partes iguales.
 */
export function divisionesPaneles(b: { vertices: Punto[]; paneles_largo: number; paneles_ancho: number }): string {
  if (b.vertices.length !== 4) return "";
  const [se, ne, no, so] = b.vertices;
  const tramos: string[] = [];
  const punto = (p: Punto) => `${p[0]},${p[1]}`;
  const entre = (a: Punto, c: Punto, t: number): Punto => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
  for (let i = 1; i < b.paneles_largo; i++) {
    const t = i / b.paneles_largo;
    tramos.push(`M${punto(entre(so, se, t))}L${punto(entre(no, ne, t))}`);
  }
  for (let j = 1; j < b.paneles_ancho; j++) {
    const t = j / b.paneles_ancho;
    tramos.push(`M${punto(entre(so, no, t))}L${punto(entre(se, ne, t))}`);
  }
  return tramos.join("");
}
