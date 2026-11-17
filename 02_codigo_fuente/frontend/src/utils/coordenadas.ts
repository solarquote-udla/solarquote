/**
 * Coordenadas del mapa. Leaflet repite el mundo hacia los lados: al
 * desplazarse mucho, la longitud de un clic puede salir fuera de
 * -180..180 (por ejemplo -437,24). Aquí se lleva al rango real.
 */

/** Redondeo a 6 decimales: unos 11 cm, más que suficiente para un terreno. */
export const redondearCoordenada = (n: number) => Math.round(n * 1e6) / 1e6;

/** Longitud equivalente dentro de -180..180. */
export function normalizarLongitud(longitud: number): number {
  const ajustada = ((((longitud + 180) % 360) + 360) % 360) - 180;
  // -180 y 180 son el mismo meridiano: se usa 180 para no devolver -180 por redondeo
  return redondearCoordenada(ajustada === -180 ? 180 : ajustada);
}
