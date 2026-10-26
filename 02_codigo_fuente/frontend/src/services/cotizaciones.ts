/**
 * Llamadas al historial de cotizaciones (RF-10).
 */

import { api } from "@/services/api";
import type { CotizacionDetalle, CotizacionesPagina, EstadoCotizacion } from "@/types/api";

export interface FiltrosHistorial {
  buscar?: string;
  estado?: EstadoCotizacion | "";
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export async function listarCotizaciones(filtros: FiltrosHistorial = {}): Promise<CotizacionesPagina> {
  const { data } = await api.get<CotizacionesPagina>("/api/cotizaciones", {
    params: {
      buscar: filtros.buscar?.trim() || undefined,
      estado: filtros.estado || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      pagina: filtros.pagina,
      por_pagina: filtros.porPagina,
    },
  });
  return data;
}

export async function obtenerCotizacion(cotizacionId: number): Promise<CotizacionDetalle> {
  const { data } = await api.get<CotizacionDetalle>(`/api/cotizaciones/${cotizacionId}`);
  return data;
}

/** Proforma en Word, con el detalle de materiales — RF-07. */
export async function obtenerProformaWord(cotizacionId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/cotizaciones/${cotizacionId}/proforma.docx`, { responseType: "blob" });
  return data;
}

/** Proforma en Excel, con las mismas cantidades que el Word — RF-07. */
export async function obtenerProformaExcel(cotizacionId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/cotizaciones/${cotizacionId}/proforma.xlsx`, { responseType: "blob" });
  return data;
}
