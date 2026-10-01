/**
 * Llamadas a los endpoints de configuración de equipo (RF-02).
 */

import axios from "axios";

import { api } from "@/services/api";
import type {
  ConfiguracionEquipo,
  ConfiguracionEquipoGuardar,
  PanelReferencia,
} from "@/types/api";

const ruta = (proyectoId: number) => `/api/proyectos/${proyectoId}/equipo`;

/** La configuración del proyecto, o `null` si todavía no existe. */
export async function obtenerEquipo(proyectoId: number): Promise<ConfiguracionEquipo | null> {
  try {
    const { data } = await api.get<ConfiguracionEquipo>(ruta(proyectoId));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Crea o reemplaza la configuración (PUT idempotente). */
export async function guardarEquipo(
  proyectoId: number,
  datos: ConfiguracionEquipoGuardar,
): Promise<ConfiguracionEquipo> {
  const { data } = await api.put<ConfiguracionEquipo>(ruta(proyectoId), datos);
  return data;
}

export async function listarPanelesReferencia(): Promise<PanelReferencia[]> {
  const { data } = await api.get<PanelReferencia[]>("/api/equipo/paneles-referencia");
  return data;
}
