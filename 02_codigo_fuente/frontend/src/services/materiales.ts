/**
 * Llamadas a los endpoints de materiales y precios (RF-09).
 */

import { api } from "@/services/api";
import type { Material, PrecioMaterial } from "@/types/api";

export async function listarMateriales(incluirInactivos = false): Promise<Material[]> {
  const { data } = await api.get<Material[]>("/api/materiales", {
    params: { incluir_inactivos: incluirInactivos || undefined },
  });
  return data;
}

export async function obtenerHistorialPrecios(materialId: number): Promise<PrecioMaterial[]> {
  const { data } = await api.get<PrecioMaterial[]>(`/api/materiales/${materialId}/precios`);
  return data;
}

export async function actualizarPrecio(materialId: number, precio: string): Promise<Material> {
  const { data } = await api.patch<Material>(`/api/materiales/${materialId}/precio`, { precio });
  return data;
}

export async function crearMaterial(datos: { codigo: string; nombre: string; unidad: string }): Promise<Material> {
  const { data } = await api.post<Material>("/api/materiales", datos);
  return data;
}

export async function actualizarMaterial(
  materialId: number,
  datos: Partial<{ nombre: string; unidad: string; activo: boolean }>,
): Promise<Material> {
  const { data } = await api.patch<Material>(`/api/materiales/${materialId}`, datos);
  return data;
}
