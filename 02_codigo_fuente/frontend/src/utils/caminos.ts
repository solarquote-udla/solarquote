/**
 * Caminos dibujados sobre el mapa del Paso 3 (revisión de UX del 21 de
 * noviembre: los caminos se dibujan en la vista, no en una tarjeta aparte).
 *
 * El usuario marca el eje del camino con clics (dos puntos para uno
 * recto, más para uno con curvas) y elige el ancho. El camino se guarda
 * como el polígono que rodea ese eje, en metros del plano, igual que los
 * caminos rectos de borde a borde. El backend lo recorta contra el
 * terreno, así que los extremos pueden quedar afuera.
 */
import type { Punto } from "@/types/api";

const cm = (v: number) => Math.round(v * 100) / 100;

/** Esquina más aguda que se acepta: la punta del borde exterior no pasa de 3 veces el medio ancho. */
const LIMITE_ESQUINA = 3;

/** Largo del eje, sumando sus tramos. */
export function largoEje(eje: Punto[]): number {
  return eje.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - eje[i][0], p[1] - eje[i][1]), 0);
}

/**
 * Polígono del camino: el borde izquierdo del eje de ida y el derecho de
 * vuelta. En cada quiebre el borde se prolonga hasta cortarse (esquina
 * en punta), con un límite para los giros muy cerrados.
 */
export function corredor(eje: Punto[], ancho: number): Punto[] {
  const puntos = eje.filter((p, i) => i === 0 || Math.hypot(p[0] - eje[i - 1][0], p[1] - eje[i - 1][1]) > 1e-6);
  if (puntos.length < 2 || !(ancho > 0)) return [];
  const medio = ancho / 2;
  const normal = (a: Punto, b: Punto): Punto => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };

  const izquierda: Punto[] = [];
  const derecha: Punto[] = [];
  puntos.forEach((p, i) => {
    const antes = i > 0 ? normal(puntos[i - 1], p) : null;
    const despues = i < puntos.length - 1 ? normal(p, puntos[i + 1]) : null;
    let n: Punto;
    let escala = medio;
    if (antes && despues) {
      const suma: Punto = [antes[0] + despues[0], antes[1] + despues[1]];
      const largo = Math.hypot(suma[0], suma[1]);
      n = largo < 1e-9 ? antes : [suma[0] / largo, suma[1] / largo];
      const coseno = n[0] * antes[0] + n[1] * antes[1];
      escala = Math.min(medio / Math.max(coseno, 1e-9), medio * LIMITE_ESQUINA);
    } else {
      n = (antes ?? despues) as Punto;
    }
    izquierda.push([cm(p[0] + n[0] * escala), cm(p[1] + n[1] * escala)]);
    derecha.push([cm(p[0] - n[0] * escala), cm(p[1] - n[1] * escala)]);
  });
  return [...izquierda, ...derecha.reverse()];
}

/** Los segmentos ab y cd se cruzan (sin contar los que solo se tocan en un extremo). */
function seCruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const lado = (p: Punto, q: Punto, r: Punto) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = lado(c, d, a);
  const d2 = lado(c, d, b);
  const d3 = lado(a, b, c);
  const d4 = lado(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Ningún lado del polígono cruza a otro: lo mismo que exige el backend. */
export function esPoligonoSimple(poligono: Punto[]): boolean {
  const n = poligono.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (seCruzan(poligono[i], poligono[(i + 1) % n], poligono[j], poligono[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Siguiente nombre libre para un camino dibujado: "Camino 1", "Camino 2"… */
export function nombreCaminoDibujado(existentes: (string | null)[]): string {
  const usados = existentes.flatMap((n) => {
    const m = n?.match(/^Camino (\d+)$/);
    return m ? [Number(m[1])] : [];
  });
  return `Camino ${Math.max(0, ...usados) + 1}`;
}

/**
 * Ancho y largo de un camino guardado, a partir de su polígono: área y
 * perímetro de una franja (exacto para un camino recto, muy cercano para
 * uno con quiebres). El camino no guarda su eje.
 */
export function medidasCamino(poligono: Punto[]): { ancho: number; largo: number } | null {
  const n = poligono.length;
  if (n < 3) return null;
  let area = 0;
  let perimetro = 0;
  poligono.forEach((p, i) => {
    const q = poligono[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
    perimetro += Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  area = Math.abs(area) / 2;
  const mitad = perimetro / 2;
  const discriminante = mitad * mitad - 4 * area;
  if (area === 0 || discriminante < 0) return null;
  const ancho = (mitad - Math.sqrt(discriminante)) / 2;
  return { ancho, largo: area / ancho };
}
