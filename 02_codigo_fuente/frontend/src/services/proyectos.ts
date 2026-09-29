/**
 * Llamadas a los endpoints de proyectos.
 */

import { api } from "@/services/api";
import type { Proyecto, ProyectoCrear } from "@/types/api";

export async function listarProyectos(): Promise<Proyecto[]> {
  const { data } = await api.get<Proyecto[]>("/api/proyectos");
  return data;
}

export async function obtenerProyecto(proyectoId: number): Promise<Proyecto> {
  const { data } = await api.get<Proyecto>(`/api/proyectos/${proyectoId}`);
  return data;
}

export async function crearProyecto(datos: ProyectoCrear): Promise<Proyecto> {
  const { data } = await api.post<Proyecto>("/api/proyectos", datos);
  return data;
}
