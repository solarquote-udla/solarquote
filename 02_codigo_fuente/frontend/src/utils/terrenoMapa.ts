/**
 * Terreno dibujado sobre el mapa (revisión del 16 de noviembre, Lenin).
 *
 * El contorno se sigue guardando en metros, en el sistema del plano. El
 * origen (0, 0) es el punto de ubicación del proyecto: así el mismo
 * contorno se puede ver en el mapa y en el plano.
 *
 * Plano y mapa se relacionan con la orientación del norte del terreno
 * (grados en sentido horario desde el eje +Y del plano, igual que en el
 * backend). Con orientación 0, +X es el este y +Y el norte.
 *
 * Para pasar de grados a metros se usa una proyección plana local, con
 * error menor a 1 cm por cada 100 m en terrenos de algunos kilómetros.
 */
import type { Punto } from "@/types/api";

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

const RADIO_TIERRA_M = 6_378_137;
const GRADO = Math.PI / 180;

/** Tolerancia para ajustar un lado a 90° o en línea recta con el anterior. */
export const TOLERANCIA_ANGULO_GRADOS = 8;

const cm = (v: number) => Math.round(v * 100) / 100;

/** Este y norte (en metros) del punto, medidos desde el origen. */
function geoAEsteNorte(origen: Coordenadas, punto: Coordenadas): Punto {
  const este = (punto.longitud - origen.longitud) * GRADO * RADIO_TIERRA_M * Math.cos(origen.latitud * GRADO);
  const norte = (punto.latitud - origen.latitud) * GRADO * RADIO_TIERRA_M;
  return [este, norte];
}

/** Punto del mapa a metros del plano, redondeado al centímetro. */
export function aPlano(origen: Coordenadas, punto: Coordenadas, orientacion = 0): Punto {
  const [este, norte] = geoAEsteNorte(origen, punto);
  const t = orientacion * GRADO;
  return [cm(este * Math.cos(t) + norte * Math.sin(t)), cm(-este * Math.sin(t) + norte * Math.cos(t))];
}

/** Vértice del plano a latitud y longitud. */
export function aMapa(origen: Coordenadas, [x, y]: Punto, orientacion = 0): Coordenadas {
  const t = orientacion * GRADO;
  const este = x * Math.cos(t) - y * Math.sin(t);
  const norte = x * Math.sin(t) + y * Math.cos(t);
  return {
    latitud: origen.latitud + norte / RADIO_TIERRA_M / GRADO,
    longitud: origen.longitud + este / (RADIO_TIERRA_M * Math.cos(origen.latitud * GRADO)) / GRADO,
  };
}

/**
 * Ajusta el punto nuevo para que el lado que forma con el último quede a
 * 90° del lado anterior, o en línea recta con él, si está cerca
 * (tolerancia de 8°). El punto se proyecta sobre esa dirección, así que
 * queda donde el usuario apuntó, solo corregido el ángulo.
 */
export function ajustarAngulo(
  anterior: Punto | undefined,
  ultimo: Punto | undefined,
  nuevo: Punto,
  tolerancia = TOLERANCIA_ANGULO_GRADOS,
): Punto {
  if (!anterior || !ultimo) return nuevo;
  const dx = ultimo[0] - anterior[0];
  const dy = ultimo[1] - anterior[1];
  const largoAnterior = Math.hypot(dx, dy);
  const vx = nuevo[0] - ultimo[0];
  const vy = nuevo[1] - ultimo[1];
  if (largoAnterior === 0 || Math.hypot(vx, vy) === 0) return nuevo;

  const angulo = Math.atan2(dx * vy - dy * vx, dx * vx + dy * vy) / GRADO;
  for (const objetivo of [-90, 0, 90]) {
    if (Math.abs(angulo - objetivo) <= tolerancia) {
      const t = objetivo * GRADO;
      const ux = (dx * Math.cos(t) - dy * Math.sin(t)) / largoAnterior;
      const uy = (dx * Math.sin(t) + dy * Math.cos(t)) / largoAnterior;
      const largo = vx * ux + vy * uy;
      return [cm(ultimo[0] + ux * largo), cm(ultimo[1] + uy * largo)];
    }
  }
  return nuevo;
}

/** Largo de cada lado, en orden; el último cierra el contorno. */
export function largosDeLados(vertices: Punto[]): number[] {
  return vertices.map((p, i) => {
    const q = vertices[(i + 1) % vertices.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
}

/**
 * Cambia el largo del lado `i` (del vértice i al i + 1) estirando el
 * terreno en la dirección de ese lado: se mueven el vértice final y los
 * que quedan a la misma altura o más allá de él. En un rectángulo eso
 * mueve el lado opuesto completo y sigue siendo rectángulo.
 */
export function cambiarLargoLado(vertices: Punto[], i: number, largo: number): Punto[] {
  const n = vertices.length;
  if (n < 3 || !(largo > 0)) return vertices;
  const inicio = vertices[i];
  const fin = vertices[(i + 1) % n];
  const actual = Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]);
  if (actual === 0) return vertices;
  const ux = (fin[0] - inicio[0]) / actual;
  const uy = (fin[1] - inicio[1]) / actual;
  const delta = largo - actual;
  const proyeccion = (p: Punto) => (p[0] - inicio[0]) * ux + (p[1] - inicio[1]) * uy;
  const limite = actual - 0.01;
  return vertices.map((p, k) =>
    k !== i && proyeccion(p) >= limite ? [cm(p[0] + ux * delta), cm(p[1] + uy * delta)] : p,
  );
}

/** Agrega un vértice en la mitad del lado `i`. */
export function insertarEnMitad(vertices: Punto[], i: number): Punto[] {
  const p = vertices[i];
  const q = vertices[(i + 1) % vertices.length];
  const medio: Punto = [cm((p[0] + q[0]) / 2), cm((p[1] + q[1]) / 2)];
  return [...vertices.slice(0, i + 1), medio, ...vertices.slice(i + 1)];
}

/** Quita el vértice `i`; un contorno nunca baja de tres vértices. */
export function quitarVertice(vertices: Punto[], i: number): Punto[] {
  return vertices.length <= 3 ? vertices : vertices.filter((_, k) => k !== i);
}

/** Ángulo interior en el vértice `i`, en grados (para marcar los de 90°). */
export function anguloEnVertice(vertices: Punto[], i: number): number {
  const n = vertices.length;
  const a = vertices[(i - 1 + n) % n];
  const b = vertices[i];
  const c = vertices[(i + 1) % n];
  const ux = a[0] - b[0];
  const uy = a[1] - b[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) / GRADO;
}
