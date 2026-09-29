/**
 * Llamadas a los endpoints de terreno (RF-01).
 */

import axios from "axios";

import { api } from "@/services/api";
import type {
  Camino,
  CaminoCrear,
  Terreno,
  TerrenoActualizar,
  TerrenoCrear,
} from "@/types/api";

const ruta = (proyectoId: number) => `/api/proyectos/${proyectoId}/terreno`;

/**
 * Devuelve el terreno del proyecto, o `null` si todavía no se definió.
 *
 * El 404 aquí no es un error: es el estado normal de un proyecto nuevo.
 * Cualquier otro fallo sí se propaga.
 */
export async function obtenerTerreno(proyectoId: number): Promise<Terreno | null> {
  try {
    const { data } = await api.get<Terreno>(ruta(proyectoId));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function crearTerreno(proyectoId: number, datos: TerrenoCrear): Promise<Terreno> {
  const { data } = await api.post<Terreno>(ruta(proyectoId), datos);
  return data;
}

export async function actualizarTerreno(
  proyectoId: number,
  datos: TerrenoActualizar,
): Promise<Terreno> {
  const { data } = await api.patch<Terreno>(ruta(proyectoId), datos);
  return data;
}

export async function agregarCamino(proyectoId: number, datos: CaminoCrear): Promise<Camino> {
  const { data } = await api.post<Camino>(`${ruta(proyectoId)}/caminos`, datos);
  return data;
}

export async function eliminarCamino(proyectoId: number, caminoId: number): Promise<void> {
  await api.delete(`${ruta(proyectoId)}/caminos/${caminoId}`);
}
