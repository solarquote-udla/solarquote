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
  /** El mismo color en hexadecimal, para el mapa (Leaflet no usa clases) */
  hex: string;
}

const PALETA: ColorInversor[] = [
  { relleno: "fill-sky-600/80", borde: "stroke-sky-300", muestra: "bg-sky-600", tarjeta: "border-sky-600", texto: "text-sky-400 claro:text-sky-700", hex: "#0284c7" },
  { relleno: "fill-emerald-600/80", borde: "stroke-emerald-300", muestra: "bg-emerald-600", tarjeta: "border-emerald-600", texto: "text-emerald-400 claro:text-emerald-700", hex: "#059669" },
  { relleno: "fill-violet-600/80", borde: "stroke-violet-300", muestra: "bg-violet-600", tarjeta: "border-violet-600", texto: "text-violet-400 claro:text-violet-700", hex: "#7c3aed" },
  { relleno: "fill-pink-600/80", borde: "stroke-pink-300", muestra: "bg-pink-600", tarjeta: "border-pink-600", texto: "text-pink-400 claro:text-pink-700", hex: "#db2777" },
  { relleno: "fill-teal-600/80", borde: "stroke-teal-300", muestra: "bg-teal-600", tarjeta: "border-teal-600", texto: "text-teal-400 claro:text-teal-700", hex: "#0d9488" },
  { relleno: "fill-indigo-500/80", borde: "stroke-indigo-300", muestra: "bg-indigo-500", tarjeta: "border-indigo-500", texto: "text-indigo-400 claro:text-indigo-700", hex: "#6366f1" },
  { relleno: "fill-fuchsia-600/80", borde: "stroke-fuchsia-300", muestra: "bg-fuchsia-600", tarjeta: "border-fuchsia-600", texto: "text-fuchsia-400 claro:text-fuchsia-700", hex: "#c026d3" },
  { relleno: "fill-cyan-700/80", borde: "stroke-cyan-300", muestra: "bg-cyan-700", tarjeta: "border-cyan-700", texto: "text-cyan-400 claro:text-cyan-800", hex: "#0e7490" },
];

/** Color del inversor `indice` (0 = Inversor 1). Con más de 8, los colores se repiten. */
export function colorInversor(indice: number): ColorInversor {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}

/** Igual que RELACION_DC_AC_MAXIMA en backend/app/services/calculo_equipo.py */
export const RELACION_DC_AC_MAXIMA = 1.3;

/** Paneles necesarios para una potencia: kWp × 1000 ÷ Wp, hacia arriba. */
export function panelesParaPotencia(potenciaKwp: number, potenciaPanelWp: number): number {
  return Math.ceil((potenciaKwp * 1000) / potenciaPanelWp - 1e-9);
}

export interface InversorElectrico {
  potenciaKw: number;
  vmaxV?: number | null;
  vminV?: number | null;
  mppts?: number | null;
  stringsPorMppt?: number | null;
}

/** MPPT × strings por MPPT × floor(Vmax ÷ Voc). Null si faltan datos; 0 si el panel no entra en el rango de voltaje. */
export function panelesQueAdmite(inv: InversorElectrico, voc: number | null, vmp: number | null): number | null {
  if (!inv.mppts || !inv.stringsPorMppt || !inv.vmaxV || !inv.vminV || !voc || !vmp) return null;
  const maximo = Math.floor(inv.vmaxV / voc + 1e-9);
  const minimo = Math.ceil(inv.vminV / vmp - 1e-9);
  if (maximo < 1 || minimo > maximo) return 0;
  return inv.mppts * inv.stringsPorMppt * maximo;
}

export interface Analisis {
  paneles: number;
  potenciaDcKwp: number;
  potenciaAcKw: number;
  relacion: number;
  estado: "reserva" | "normal" | "recorte";
  admitidos: number | null;
  sugeridos: number;
  porPotencia: number;
  porEntradas: number | null;
  admiteModelo: number | null;
}

/**
 * Copia de `analizar_inversores` del backend, para que el Paso 2 responda
 * mientras se escribe. El backend la vuelve a calcular al guardar y la
 * usa en sus avisos y en el Paso 3.
 */
export function analizarInversores(
  paneles: number,
  potenciaPanelWp: number,
  inversores: InversorElectrico[],
  voc: number | null = null,
  vmp: number | null = null,
  relacionMaxima = RELACION_DC_AC_MAXIMA,
): Analisis | null {
  if (!(paneles > 0) || inversores.length === 0 || !(potenciaPanelWp > 0)) return null;
  const potenciaDcKwp = (paneles * potenciaPanelWp) / 1000;
  const potenciaAcKw = inversores.reduce((s, i) => s + i.potenciaKw, 0);
  if (!(potenciaAcKw > 0)) return null;
  const relacion = potenciaDcKwp / potenciaAcKw;
  const estado = relacion < 1 - 1e-9 ? "reserva" : relacion > relacionMaxima + 1e-9 ? "recorte" : "normal";
  const admiten = inversores.map((i) => panelesQueAdmite(i, voc, vmp));
  const admitidos = admiten.every((a) => a !== null) ? admiten.reduce<number>((s, a) => s + (a ?? 0), 0) : null;
  const porPotencia = potenciaDcKwp / (inversores[0].potenciaKw * relacionMaxima);
  const admiteModelo = admiten[0] || null;
  const porEntradas = admiteModelo ? paneles / admiteModelo : null;
  const sugeridos = Math.max(Math.ceil(porPotencia - 1e-9), porEntradas ? Math.ceil(porEntradas - 1e-9) : 0, 1);
  return { paneles, potenciaDcKwp, potenciaAcKw, relacion, estado, admitidos, sugeridos, porPotencia, porEntradas, admiteModelo };
}

export interface OcupacionTerreno {
  paneles: number;
  areaPanelesM2: number;
  areaTerrenoM2: number;
  porcentaje: number;
  cabe: boolean;
  maximoPaneles: number;
}

/** Copia de `ocupacion_terreno`: superficie de los paneles frente al área útil del terreno. */
export function ocupacionTerreno(paneles: number, largoMm: number, anchoMm: number, areaTerrenoM2: number): OcupacionTerreno | null {
  if (!(paneles > 0) || !(areaTerrenoM2 > 0) || !(largoMm > 0) || !(anchoMm > 0)) return null;
  const areaPanel = (largoMm / 1000) * (anchoMm / 1000);
  const areaPanelesM2 = paneles * areaPanel;
  return {
    paneles,
    areaPanelesM2,
    areaTerrenoM2,
    porcentaje: (areaPanelesM2 / areaTerrenoM2) * 100,
    cabe: areaPanelesM2 <= areaTerrenoM2 + 1e-9,
    maximoPaneles: Math.floor(areaTerrenoM2 / areaPanel + 1e-9),
  };
}
