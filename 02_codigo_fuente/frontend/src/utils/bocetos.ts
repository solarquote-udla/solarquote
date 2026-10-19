/**
 * Reglas del boceto del cliente que la pantalla aplica antes de llamar
 * al backend (RF-04 y RF-05). El backend vuelve a validarlas.
 */

import { EXTENSIONES_ADMITIDAS, TAMANO_MAXIMO_BYTES } from "@/services/bocetos";

// Igual que RELACION_OBJETIVO en backend/app/services/calculo_layout.py
const RELACION_OBJETIVO = 3;
const EPS = 1e-6;

const extension = (nombre: string) => {
  const punto = nombre.lastIndexOf(".");
  return punto < 0 ? "" : nombre.slice(punto).toLowerCase();
};

export const rutaCargarBoceto = (proyectoId: number) => `/bocetos/${proyectoId}`;
export const rutaConfirmacionBoceto = (proyectoId: number) => `/bocetos/${proyectoId}/confirmacion`;

export const esDxf = (nombre: string) => extension(nombre) === ".dxf";

/** Por qué no se puede cargar el archivo, o null si está bien. */
export function problemaDelArchivo(archivo: File): string | null {
  const ext = extension(archivo.name);
  if (ext === ".dwg") return "Los DWG no se pueden leer: en AutoCAD usa Guardar como > DXF y carga ese archivo.";
  if (!EXTENSIONES_ADMITIDAS.includes(ext)) return "Formato no admitido. Carga un PDF, JPG, PNG o DXF.";
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > TAMANO_MAXIMO_BYTES) return "El archivo supera el máximo de 10 MB.";
  return null;
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Ancho / largo del bloque con el panel indicado (mm), como en el backend. */
export function proporcion(L: number, A: number, panel: { largo_mm: number; ancho_mm: number }): number {
  const mayor = Math.max(panel.largo_mm, panel.ancho_mm);
  const menor = Math.min(panel.largo_mm, panel.ancho_mm);
  return (A * menor) / (L * mayor);
}

export function enProporcion(valor: number, tolerancia: number): boolean {
  return Math.abs(valor / RELACION_OBJETIVO - 1) <= tolerancia + EPS;
}

/** Fila editable de la confirmación: los números como texto mientras se escriben. */
export interface FilaBoceto {
  clave: number;
  etiqueta: string;
  L: string;
  A: string;
  B: string;
  orientacion: "vertical" | "horizontal";
}

const entero = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : Number.NaN);

/** Valores numéricos de la fila, o el problema que tiene. */
export function leerFila(f: FilaBoceto): { L: number; A: number; B: number } | { problema: string } {
  const L = entero(f.L);
  const A = entero(f.A);
  const B = entero(f.B);
  if (!Number.isInteger(L) || L < 2 || L > 50) return { problema: "L debe ser un entero entre 2 y 50" };
  if (L % 2) return { problema: "L debe ser par: la estructura apoya los paneles de a dos" };
  if (!Number.isInteger(A) || A < 1 || A > 500) return { problema: "A debe ser un entero entre 1 y 500" };
  if (!Number.isInteger(B) || B < 1 || B > 10000) return { problema: "B debe ser un entero entre 1 y 10 000" };
  return { L, A, B };
}

/** "A", "B", ..., "Z", "AA", "AB"... */
function letra(indice: number): string {
  let texto = "";
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    texto = String.fromCharCode(65 + ((n - 1) % 26)) + texto;
  }
  return texto;
}

/** Nombre de cada tipo: su etiqueta o, si no tiene, la primera letra que nadie usa. */
export function nombresDeTipos(filas: { etiqueta: string }[]): string[] {
  const usados = new Set(filas.map((f) => f.etiqueta.trim()).filter(Boolean));
  let siguiente = 0;
  return filas.map((f) => {
    const propia = f.etiqueta.trim();
    if (propia) return propia;
    while (usados.has(letra(siguiente))) siguiente += 1;
    const nombre = letra(siguiente);
    usados.add(nombre);
    return nombre;
  });
}
