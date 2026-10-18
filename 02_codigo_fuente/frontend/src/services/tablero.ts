/**
 * Llamadas al endpoint de indicadores del tablero (RF-13).
 */

import { api } from "@/services/api";
import type { Tablero } from "@/types/api";

export interface FiltrosTablero {
  desde?: string;
  hasta?: string;
  top?: number;
}

export async function obtenerTablero(filtros: FiltrosTablero = {}): Promise<Tablero> {
  const { data } = await api.get<Tablero>("/api/tablero", {
    params: {
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      top: filtros.top,
    },
  });
  return data;
}
