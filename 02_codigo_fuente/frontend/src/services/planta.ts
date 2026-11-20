/**
 * Planta de una cotización: el terreno y el layout del proyecto, de solo
 * lectura, con el permiso del historial (pedido de Santi, 17 de noviembre).
 */
import { api } from "@/services/api";
import type { Layout, Terreno } from "@/types/api";

export interface PlantaCotizacion {
  cotizacion_id: number;
  proyecto_id: number | null;
  /** Nulos si la cotización no tiene proyecto, salió de un boceto o el proyecto no tiene terreno o layout */
  terreno: Terreno | null;
  layout: Layout | null;
  /** El terreno o el layout se modificaron después de emitir la cotización */
  cambio_despues_de_cotizar: boolean;
}

export async function obtenerPlanta(cotizacionId: number): Promise<PlantaCotizacion> {
  const { data } = await api.get<PlantaCotizacion>(`/api/cotizaciones/${cotizacionId}/planta`);
  return data;
}
