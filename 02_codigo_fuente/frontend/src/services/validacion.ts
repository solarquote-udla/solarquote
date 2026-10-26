/**
 * Llamadas a la validación de materiales: despacho (RF-14), recepción
 * (RF-15) y seguimiento de la propuesta (RF-16).
 */

import { api } from "@/services/api";
import type { ConteoVarillas, CotizacionAValidar, DespachoCrear, RecepcionCrear, Validacion } from "@/types/api";

const BASE = "/api/validacion";

export const TAMANO_MAXIMO_FOTO = 10 * 1024 * 1024;
export const MAXIMO_FOTOS = 6;
export const EXTENSIONES_FOTO = [".jpg", ".jpeg", ".png"];

/** Contar una foto con la IA puede tardar cerca de un minuto */
const TIMEOUT_CONTEO_MS = 100_000;
const TIMEOUT_ENVIO_MS = 120_000;

/** Cotizadas (por despachar) y despachadas (para ver su reporte). */
export async function listarPorDespachar(buscar?: string): Promise<CotizacionAValidar[]> {
  const { data } = await api.get<CotizacionAValidar[]>(`${BASE}/despachos/pendientes`, {
    params: buscar ? { buscar } : undefined,
  });
  return data;
}

/** Despachadas (por recibir) y recibidas (para ver su reporte o marcarlas instaladas). */
export async function listarPorRecibir(buscar?: string): Promise<CotizacionAValidar[]> {
  const { data } = await api.get<CotizacionAValidar[]>(`${BASE}/recepciones/pendientes`, {
    params: buscar ? { buscar } : undefined,
  });
  return data;
}

export async function obtenerValidacion(cotizacionId: number): Promise<Validacion> {
  const { data } = await api.get<Validacion>(`${BASE}/cotizaciones/${cotizacionId}`);
  return data;
}

/** La IA cuenta las varillas de una foto. No guarda nada. */
export async function contarVarillas(cotizacionId: number, foto: File): Promise<ConteoVarillas> {
  const formulario = new FormData();
  formulario.append("foto", foto);
  const { data } = await api.post<ConteoVarillas>(`${BASE}/cotizaciones/${cotizacionId}/conteo`, formulario, {
    // Sin esto axios convierte el FormData a JSON (la instancia declara JSON por defecto)
    headers: { "Content-Type": "multipart/form-data" },
    timeout: TIMEOUT_CONTEO_MS,
  });
  return data;
}

function multipart(datos: unknown, fotos: File[]): FormData {
  const formulario = new FormData();
  formulario.append("datos", JSON.stringify(datos));
  fotos.forEach((f) => formulario.append("fotos", f));
  return formulario;
}

export async function confirmarDespacho(
  cotizacionId: number,
  datos: DespachoCrear,
  fotos: File[],
): Promise<Validacion> {
  const { data } = await api.post<Validacion>(
    `${BASE}/cotizaciones/${cotizacionId}/despacho`,
    multipart(datos, fotos),
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: TIMEOUT_ENVIO_MS,
    },
  );
  return data;
}

export async function confirmarRecepcion(
  cotizacionId: number,
  datos: RecepcionCrear,
  fotos: File[],
): Promise<Validacion> {
  const { data } = await api.post<Validacion>(
    `${BASE}/cotizaciones/${cotizacionId}/recepcion`,
    multipart(datos, fotos),
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: TIMEOUT_ENVIO_MS,
    },
  );
  return data;
}

export async function marcarInstalada(cotizacionId: number): Promise<Validacion> {
  const { data } = await api.post<Validacion>(`${BASE}/cotizaciones/${cotizacionId}/instalacion`);
  return data;
}

export async function obtenerFoto(cotizacionId: number, fotoId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`${BASE}/cotizaciones/${cotizacionId}/fotos/${fotoId}`, {
    responseType: "blob",
  });
  return data;
}

/** Motivo por el que no se puede usar la foto, o null si sirve. */
export function problemaDeLaFoto(foto: File): string | null {
  const nombre = foto.name.toLowerCase();
  if (!EXTENSIONES_FOTO.some((ext) => nombre.endsWith(ext))) return "La foto debe ser una imagen JPG o PNG.";
  if (foto.size === 0) return "La foto está vacía.";
  if (foto.size > TAMANO_MAXIMO_FOTO) return "La foto supera el máximo de 10 MB.";
  return null;
}
