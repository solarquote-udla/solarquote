/**
 * Llamadas a los endpoints del layout solar (RF-03).
 */

import axios from "axios";

import { api } from "@/services/api";
import type { Layout, LayoutGenerar } from "@/types/api";

const ruta = (proyectoId: number) => `/api/proyectos/${proyectoId}/layout`;

/** El último layout generado, o `null` si todavía no hay ninguno. */
export async function obtenerLayout(proyectoId: number): Promise<Layout | null> {
  try {
    const { data } = await api.get<Layout>(ruta(proyectoId));
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Genera un layout nuevo y reemplaza el anterior.
 *
 * Devuelve 409 si faltan terreno o equipo, y 422 si no entra ningún
 * bloque; en ambos casos `mensajeDeError` muestra el texto del backend.
 */
export async function generarLayout(proyectoId: number, datos: LayoutGenerar): Promise<Layout> {
  const { data } = await api.post<Layout>(ruta(proyectoId), datos);
  return data;
}

/**
 * Guarda la edición manual (SQ-64). Se envían todos los bloques que
 * quedan, cada uno con su esquina suroeste y su A; los que no vienen se
 * eliminan. 422 si alguno no se puede construir, 409 si el layout quedó
 * desactualizado.
 */
export async function guardarBloques(
  proyectoId: number,
  bloques: { origen: [number, number]; paneles_ancho: number }[],
): Promise<Layout> {
  const { data } = await api.put<Layout>(`${ruta(proyectoId)}/bloques`, { bloques });
  return data;
}
