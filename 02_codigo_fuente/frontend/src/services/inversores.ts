/**
 * Llamadas a los endpoints del catálogo de inversores (RF-08).
 */

import { api } from "@/services/api";
import type { InversorCatalogo } from "@/types/api";

export interface DatosInversor {
  marca: string;
  modelo: string;
  potencia_kw: number;
  vmax_v: number | null;
  vmin_v: number | null;
  mppts: number | null;
  strings_por_mppt: number | null;
}

export async function listarInversores(incluirInactivos = false): Promise<InversorCatalogo[]> {
  const { data } = await api.get<InversorCatalogo[]>("/api/inversores", {
    params: { incluir_inactivos: incluirInactivos || undefined },
  });
  return data;
}

export async function crearInversor(datos: DatosInversor): Promise<InversorCatalogo> {
  const { data } = await api.post<InversorCatalogo>("/api/inversores", datos);
  return data;
}

export async function actualizarInversor(
  inversorId: number,
  datos: Partial<DatosInversor & { activo: boolean }>,
): Promise<InversorCatalogo> {
  const { data } = await api.patch<InversorCatalogo>(`/api/inversores/${inversorId}`, datos);
  return data;
}
