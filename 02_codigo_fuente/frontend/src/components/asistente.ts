/**
 * Pasos del asistente "Generar layout solar", como en el prototipo:
 *   1 Terreno  ->  2 Panel + Inversor  ->  3 Caminos + Layout
 *
 * Vive aparte de los componentes porque Fast Refresh exige que un archivo
 * de componentes exporte solo componentes.
 */

export type NumeroPaso = 1 | 2 | 3;

export const PASOS: { numero: NumeroPaso; ruta: string; etiqueta: string }[] = [
  { numero: 1, ruta: "terreno", etiqueta: "Terreno" },
  { numero: 2, ruta: "equipo", etiqueta: "Panel + Inversor" },
  { numero: 3, ruta: "layout", etiqueta: "Caminos + Layout" },
];

/** Ruta de un paso de un proyecto ya creado. */
export function rutaPaso(proyectoId: number, paso: NumeroPaso): string {
  return `/generar/${proyectoId}/${PASOS[paso - 1].ruta}`;
}

/** Inicio del asistente para un proyecto nuevo. */
export const RUTA_PROYECTO_NUEVO = "/generar";
