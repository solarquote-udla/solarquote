/**
 * Llamadas a los endpoints del catálogo de paneles (RF-02).
 */

import { api } from "@/services/api";
import type { PanelCatalogo } from "@/types/api";

export interface DatosPanel {
  marca: string;
  modelo: string;
  potencia_wp: number;
  largo_mm: number;
  ancho_mm: number;
  voc_v: number;
  vmp_v: number;
}

export async function listarPaneles(incluirInactivos = false): Promise<PanelCatalogo[]> {
  const { data } = await api.get<PanelCatalogo[]>("/api/paneles", {
    params: { incluir_inactivos: incluirInactivos || undefined },
  });
  return data;
}

export async function crearPanel(datos: DatosPanel): Promise<PanelCatalogo> {
  const { data } = await api.post<PanelCatalogo>("/api/paneles", datos);
  return data;
}

export async function actualizarPanel(
  panelId: number,
  datos: Partial<DatosPanel & { activo: boolean }>,
): Promise<PanelCatalogo> {
  const { data } = await api.patch<PanelCatalogo>(`/api/paneles/${panelId}`, datos);
  return data;
}
