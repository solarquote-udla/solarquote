/**
 * Llamadas a los endpoints del boceto del cliente (RF-04 y RF-05).
 */

import axios from "axios";

import { api } from "@/services/api";
import type { BloqueBocetoEditar, Boceto, ConfirmarLayout, CotizacionEmitida } from "@/types/api";

const ruta = (proyectoId: number) => `/api/proyectos/${proyectoId}/boceto`;

/** Leer un PDF grande con la IA puede tardar cerca de dos minutos */
const TIMEOUT_CARGA_MS = 180_000;

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
export const EXTENSIONES_ADMITIDAS = [".pdf", ".jpg", ".jpeg", ".png", ".dxf"];

/** El boceto cargado, o `null` si el proyecto todavía no tiene. */
export async function obtenerBoceto(proyectoId: number): Promise<Boceto | null> {
  try {
    const { data } = await api.get<Boceto>(ruta(proyectoId));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Sube el archivo y espera a que se interprete. Reemplaza el boceto
 * anterior. `onSubido` avisa cuando terminó la subida y empezó la lectura.
 */
export async function cargarBoceto(
  proyectoId: number,
  archivo: File,
  opciones: { signal?: AbortSignal; onSubido?: () => void } = {},
): Promise<Boceto> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  const { data } = await api.post<Boceto>(ruta(proyectoId), formulario, {
    // Sin esto axios convierte el FormData a JSON (la instancia declara JSON por defecto)
    headers: { "Content-Type": "multipart/form-data" },
    timeout: TIMEOUT_CARGA_MS,
    signal: opciones.signal,
    onUploadProgress: (evento) => {
      if (evento.total && evento.loaded >= evento.total) opciones.onSubido?.();
    },
  });
  return data;
}

/** Guarda los tipos corregidos. Se envían todos: los que no vienen se eliminan. */
export async function guardarBloquesBoceto(proyectoId: number, bloques: BloqueBocetoEditar[]): Promise<Boceto> {
  const { data } = await api.put<Boceto>(`${ruta(proyectoId)}/bloques`, { bloques });
  return data;
}

/** "Confirmar y generar cotización" con los bloques del boceto. */
export async function confirmarYCotizarBoceto(proyectoId: number, datos: ConfirmarLayout): Promise<CotizacionEmitida> {
  const { data } = await api.post<CotizacionEmitida>(`${ruta(proyectoId)}/cotizacion`, datos);
  return data;
}

/** El archivo original, para verlo o descargarlo. */
export async function obtenerArchivoBoceto(proyectoId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`${ruta(proyectoId)}/archivo`, { responseType: "blob" });
  return data;
}
