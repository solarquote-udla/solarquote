/**
 * Geometría de la vista 3D del layout (revisión del 16 de noviembre,
 * Lenin: ver los paneles levantados, como en Smart Design).
 *
 * La estructura de HEXtructure es "en casita": a lo largo de la pendiente
 * (L) los paneles se apoyan alternando un soporte en V (abajo, varilla de
 * 1350 mm) y uno en A (arriba, varilla de 1650 mm). Por eso L es par: el
 * bloque empieza y termina en V. Cada panel sube o baja con el ángulo de
 * montaje del Paso 2 (las aletas de los soportes vienen a 7,5°).
 *
 * Aquí solo hay números, sin Three.js, para poder probarlo: la vista 3D
 * convierte cada panel y cada soporte en una instancia.
 *
 * Ejes de la escena: x = x del plano, y = altura, z = −y del plano (así el
 * norte del plano queda hacia −z, como en Three.js).
 */
import type { Punto } from "@/types/api";

export type Vector3 = [number, number, number];

/** Altura del soporte en V sobre el suelo, en metros (aproximada, solo para ver). */
export const ALTURA_V_M = 0.35;
/** Ángulo de las aletas de los soportes cuando el equipo no lo trae. */
export const ANGULO_DEFECTO = 7.5;
/** Separación visible entre paneles, como fracción del panel. */
const HUECO = 0.02;

export interface BloqueEscena {
  /** [SE, NE, NO, SO], como los devuelve el backend */
  vertices: Punto[];
  paneles_largo: number;
  paneles_ancho: number;
}

export interface Panel3D {
  centro: Vector3;
  /** Dirección del largo del panel, ya inclinada (unitario) */
  ejeLargo: Vector3;
  /** Dirección del ancho del panel, horizontal (unitario) */
  ejeAncho: Vector3;
  /** Normal hacia arriba (unitario) */
  normal: Vector3;
  largo: number;
  ancho: number;
}

export interface Soporte3D {
  x: number;
  z: number;
  alto: number;
  tipo: "A" | "V";
}

const a3 = ([x, y]: Punto, h = 0): Vector3 => [x, h, -y];
const resta = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const suma = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const escala = (a: Vector3, k: number): Vector3 => [a[0] * k, a[1] * k, a[2] * k];
const largoDe = (a: Vector3) => Math.hypot(a[0], a[1], a[2]);
const unitario = (a: Vector3): Vector3 => escala(a, 1 / (largoDe(a) || 1));
export const producto = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Altura de la línea de soportes k (0 … L): V en las pares, A en las impares. */
export function alturaSoporte(k: number, subida: number, base = ALTURA_V_M): number {
  return k % 2 === 0 ? base : base + subida;
}

/**
 * Paneles y soportes de un bloque. `angulo` en grados. La subida de cada
 * panel es su largo en planta por la tangente del ángulo.
 */
export function geometriaBloque(
  b: BloqueEscena,
  angulo = ANGULO_DEFECTO,
  base = ALTURA_V_M,
): { paneles: Panel3D[]; soportes: Soporte3D[] } {
  const L = b.paneles_largo;
  const A = b.paneles_ancho;
  if (b.vertices.length !== 4 || L < 1 || A < 1) return { paneles: [], soportes: [] };

  const [se, , no, so] = b.vertices.map((p) => a3(p));
  const largoPlanta = resta(se, so);
  const anchoPlanta = resta(no, so);
  const paso = escala(largoPlanta, 1 / L);
  const pasoAncho = escala(anchoPlanta, 1 / A);
  const subida = largoDe(paso) * Math.tan((angulo * Math.PI) / 180);
  const ejeAncho = unitario(anchoPlanta);
  const anchoPanel = largoDe(pasoAncho) * (1 - HUECO);

  const paneles: Panel3D[] = [];
  for (let i = 0; i < L; i++) {
    const h0 = alturaSoporte(i, subida, base);
    const h1 = alturaSoporte(i + 1, subida, base);
    const ejeLargo = unitario([paso[0], h1 - h0, paso[2]]);
    // Base derecha: largo × normal = ancho, para que la normal quede hacia arriba
    let normal = unitario(producto(ejeAncho, ejeLargo));
    let ancho = ejeAncho;
    if (normal[1] < 0) {
      normal = escala(normal, -1);
      ancho = escala(ejeAncho, -1);
    }
    const largo = Math.hypot(largoDe(paso), h1 - h0) * (1 - HUECO);
    for (let j = 0; j < A; j++) {
      const piso = suma(so, suma(escala(paso, i + 0.5), escala(pasoAncho, j + 0.5)));
      paneles.push({ centro: [piso[0], (h0 + h1) / 2, piso[2]], ejeLargo, ejeAncho: ancho, normal, largo, ancho: anchoPanel });
    }
  }

  const soportes: Soporte3D[] = [];
  for (let k = 0; k <= L; k++) {
    for (let j = 0; j <= A; j++) {
      const p = suma(so, suma(escala(paso, k), escala(pasoAncho, j)));
      soportes.push({ x: p[0], z: p[2], alto: alturaSoporte(k, subida, base), tipo: k % 2 === 0 ? "V" : "A" });
    }
  }
  return { paneles, soportes };
}

/** Caja que encierra el terreno y los bloques, para ubicar la cámara. */
export function encuadre3D(puntos: Punto[]): { centro: Vector3; tamano: number } {
  if (puntos.length === 0) return { centro: [0, 0, 0], tamano: 50 };
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return {
    centro: [(minX + maxX) / 2, 0, -(minY + maxY) / 2],
    tamano: Math.max(maxX - minX, maxY - minY, 10),
  };
}
