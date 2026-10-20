/**
 * Colores y sugerencia de inversores (RF-02, RF-03).
 *
 * Cada inversor tiene un color: el de su tarjeta en el Paso 2 y el de
 * sus bloques en el plano del Paso 3, como en el prototipo (Inversor 1
 * azul, Inversor 2 verde). Ámbar y rojo quedan fuera de la paleta: son
 * los avisos de proporción y de bloque inválido.
 *
 * Las clases van escritas completas porque Tailwind solo genera las que
 * encuentra literales en el código.
 *
 * El texto usa el tono 400 en el tema oscuro y el 700 en el claro: el 400
 * sobre fondo blanco no llega al contraste mínimo de lectura.
 */

export interface ColorInversor {
  /** Relleno del bloque en el plano (SVG) */
  relleno: string;
  /** Borde del bloque en el plano (SVG) */
  borde: string;
  /** Muestra de color en tarjetas y leyenda */
  muestra: string;
  /** Borde de la tarjeta del inversor */
  tarjeta: string;
  /** Texto con el color del inversor (con su variante para el tema claro) */
  texto: string;
}

const PALETA: ColorInversor[] = [
  { relleno: "fill-sky-600/80", borde: "stroke-sky-300", muestra: "bg-sky-600", tarjeta: "border-sky-600", texto: "text-sky-400 claro:text-sky-700" },
  { relleno: "fill-emerald-600/80", borde: "stroke-emerald-300", muestra: "bg-emerald-600", tarjeta: "border-emerald-600", texto: "text-emerald-400 claro:text-emerald-700" },
  { relleno: "fill-violet-600/80", borde: "stroke-violet-300", muestra: "bg-violet-600", tarjeta: "border-violet-600", texto: "text-violet-400 claro:text-violet-700" },
  { relleno: "fill-pink-600/80", borde: "stroke-pink-300", muestra: "bg-pink-600", tarjeta: "border-pink-600", texto: "text-pink-400 claro:text-pink-700" },
  { relleno: "fill-teal-600/80", borde: "stroke-teal-300", muestra: "bg-teal-600", tarjeta: "border-teal-600", texto: "text-teal-400 claro:text-teal-700" },
  { relleno: "fill-indigo-500/80", borde: "stroke-indigo-300", muestra: "bg-indigo-500", tarjeta: "border-indigo-500", texto: "text-indigo-400 claro:text-indigo-700" },
  { relleno: "fill-fuchsia-600/80", borde: "stroke-fuchsia-300", muestra: "bg-fuchsia-600", tarjeta: "border-fuchsia-600", texto: "text-fuchsia-400 claro:text-fuchsia-700" },
  { relleno: "fill-cyan-700/80", borde: "stroke-cyan-300", muestra: "bg-cyan-700", tarjeta: "border-cyan-700", texto: "text-cyan-400 claro:text-cyan-700" },
];

/** Color del inversor `indice` (0 = Inversor 1). Con más de 8, los colores se repiten. */
export function colorInversor(indice: number): ColorInversor {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}

/** Igual que PANELES_POR_INVERSOR en backend/app/services/calculo_equipo.py */
export const PANELES_POR_INVERSOR = 400;

export interface Sugerencia {
  paneles: number;
  potenciaKwp: number;
  inversores: number;
  panelesPorInversor: number;
  kwpPorInversor: number;
}

/**
 * Copia de `sugerencia_inversores` del backend, para que la "Sugerencia
 * automática" responda mientras se escribe. El backend la vuelve a
 * calcular al guardar y la usa para sus advertencias.
 */
export function sugerenciaInversores(potenciaObjetivoKwp: number, potenciaPanelWp: number): Sugerencia | null {
  if (!(potenciaObjetivoKwp > 0) || !(potenciaPanelWp > 0)) return null;
  const paneles = Math.ceil((potenciaObjetivoKwp * 1000) / potenciaPanelWp - 1e-9);
  const inversores = Math.max(Math.ceil(paneles / PANELES_POR_INVERSOR), 1);
  const panelesPorInversor = Math.ceil(paneles / inversores);
  return {
    paneles,
    potenciaKwp: (paneles * potenciaPanelWp) / 1000,
    inversores,
    panelesPorInversor,
    kwpPorInversor: (panelesPorInversor * potenciaPanelWp) / 1000,
  };
}
