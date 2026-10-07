/**
 * Geometría de la edición manual de bloques — SQ-64.
 *
 * Copia de las reglas de backend/app/services/calculo_layout.py
 * (`construir_bloque` y `validar_bloques`). El backend decide al guardar;
 * esta copia marca en rojo, mientras se arrastra, lo que el backend va a
 * rechazar.
 *
 * Todo se evalúa en el marco local del layout (norte hacia +Y), donde los
 * bloques son rectángulos alineados a los ejes. Eso vuelve las pruebas
 * simples y exactas: no hace falta intersectar polígonos girados.
 */

import type { Punto } from "@/types/api";

/** Igual que TOLERANCIA_PENETRACION_M en el backend: 5 mm. */
export const TOLERANCIA_PENETRACION_M = 0.005;

/** Un bloque en edición: su esquina suroeste en el terreno y su A. */
export interface BloqueEdicion {
  /** Identificador local, estable mientras se edita */
  clave: number;
  origen: Punto;
  paneles_ancho: number;
}

export interface GeometriaLayout {
  /** Largo del bloque en planta (dirección de L), en metros */
  largo_m: number;
  /** Lo que suma cada panel de A, en metros */
  lado_menor_m: number;
  /** Grados del norte en sentido horario desde +Y */
  angulo_norte: number;
}

interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ─── Rotaciones ─────────────────────────────────────────────────────

/** Gira θ grados en sentido antihorario alrededor del origen (como Shapely). */
function girar([x, y]: Punto, grados: number): Punto {
  const r = (grados * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

/** Del terreno al marco local (norte hacia +Y). */
export const aLocal = (p: Punto, angulo: number) => girar(p, angulo);
/** Del marco local al terreno. */
export const aTerreno = (p: Punto, angulo: number) => girar(p, -angulo);

// ─── Construcción ───────────────────────────────────────────────────

function cajaLocal(b: BloqueEdicion, g: GeometriaLayout): Caja {
  const [x, y] = aLocal(b.origen, g.angulo_norte);
  return { x0: x, y0: y, x1: x + g.largo_m, y1: y + b.paneles_ancho * g.lado_menor_m };
}

/**
 * Vértices del bloque en el terreno, en el mismo orden que el backend:
 * [SE, NE, NO, SO]. El último es el origen.
 */
export function verticesBloque(b: BloqueEdicion, g: GeometriaLayout): Punto[] {
  const { x0, y0, x1, y1 } = cajaLocal(b, g);
  const locales: Punto[] = [
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return locales.map((p) => aTerreno(p, g.angulo_norte));
}

// ─── Pruebas geométricas en el marco local ──────────────────────────

/** Punto dentro del polígono (rayo hacia +X). */
function dentroDePoligono([x, y]: Punto, poligono: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Tramo del segmento PQ que cae dentro de la caja (Liang–Barsky).
 * Devuelve [t0, t1] o null si no la toca.
 */
function recorte([px, py]: Punto, [qx, qy]: Punto, c: Caja): [number, number] | null {
  const dx = qx - px;
  const dy = qy - py;
  let t0 = 0;
  let t1 = 1;
  const pruebas: [number, number][] = [
    [-dx, px - c.x0],
    [dx, c.x1 - px],
    [-dy, py - c.y0],
    [dy, c.y1 - py],
  ];
  for (const [p, q] of pruebas) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return [t0, t1];
}

/** ¿El segmento pasa por el interior abierto de la caja? */
function cruzaInterior(p: Punto, q: Punto, c: Caja): boolean {
  const tramo = recorte(p, q, c);
  if (!tramo || tramo[1] - tramo[0] <= 1e-12) return false;
  const t = (tramo[0] + tramo[1]) / 2;
  const x = p[0] + (q[0] - p[0]) * t;
  const y = p[1] + (q[1] - p[1]) * t;
  return x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1;
}

const esquinas = (c: Caja): Punto[] => [
  [c.x0, c.y0],
  [c.x1, c.y0],
  [c.x1, c.y1],
  [c.x0, c.y1],
];

const aristas = (poligono: Punto[]): [Punto, Punto][] =>
  poligono.map((p, i) => [p, poligono[(i + 1) % poligono.length]]);

/** Caja completamente dentro del polígono (puede tocar el borde). */
function cajaDentro(c: Caja, poligono: Punto[]): boolean {
  return (
    esquinas(c).every((p) => dentroDePoligono(p, poligono)) &&
    !aristas(poligono).some(([p, q]) => cruzaInterior(p, q, c))
  );
}

/** Caja y polígono comparten al menos un punto. */
function cajaToca(c: Caja, poligono: Punto[]): boolean {
  return (
    esquinas(c).some((p) => dentroDePoligono(p, poligono)) ||
    poligono.some(([x, y]) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) ||
    aristas(poligono).some(([p, q]) => recorte(p, q, c) !== null)
  );
}

const reducir = (c: Caja, t: number): Caja => ({ x0: c.x0 + t, y0: c.y0 + t, x1: c.x1 - t, y1: c.y1 - t });

// ─── Validación ─────────────────────────────────────────────────────

/**
 * Problemas de cada bloque, por clave. Sin entrada = bloque válido.
 * Mismas tres reglas y mismos textos que el backend.
 */
export function validarBloques(
  bloques: BloqueEdicion[],
  g: GeometriaLayout,
  terreno: Punto[],
  caminos: Punto[][],
): Map<number, string> {
  const t = TOLERANCIA_PENETRACION_M;
  const terrenoLocal = terreno.map((p) => aLocal(p, g.angulo_norte));
  const caminosLocal = caminos.map((c) => c.map((p) => aLocal(p, g.angulo_norte)));

  const cajas = bloques.map((b) => cajaLocal(b, g));
  const reducidas = cajas.map((c) => reducir(c, t));
  const problemas = new Map<number, string>();

  bloques.forEach((b, i) => {
    if (!cajaDentro(reducidas[i], terrenoLocal)) problemas.set(b.clave, "Se sale del terreno");
    else if (caminosLocal.some((c) => cajaToca(reducidas[i], c))) problemas.set(b.clave, "Queda sobre un camino");
  });

  // Barrido por X: solo se comparan bloques cuyos rangos en X se cruzan.
  const orden = cajas.map((_, i) => i).sort((a, b) => cajas[a].x0 - cajas[b].x0);
  for (let a = 0; a < orden.length; a++) {
    const i = orden[a];
    for (let b = a + 1; b < orden.length; b++) {
      const j = orden[b];
      if (cajas[j].x0 > cajas[i].x1) break;
      const solapan = (r: Caja, c: Caja) => r.x0 <= c.x1 && c.x0 <= r.x1 && r.y0 <= c.y1 && c.y0 <= r.y1;
      if (solapan(reducidas[i], cajas[j]) || solapan(reducidas[j], cajas[i])) {
        if (!problemas.has(bloques[i].clave)) problemas.set(bloques[i].clave, "Se superpone con otro bloque");
        if (!problemas.has(bloques[j].clave)) problemas.set(bloques[j].clave, "Se superpone con otro bloque");
      }
    }
  }
  return problemas;
}

/** Redondea al milímetro, como el backend al guardar vértices. */
export const redondearMm = ([x, y]: Punto): Punto => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
