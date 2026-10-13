/**
 * Llamadas a los endpoints de seguridad (RF-11): perfiles, catálogo de
 * permisos y usuarios. Ver DS-06 en DECISIONES-SEGURIDAD.md.
 */

import { api } from "@/services/api";
import type {
  EstadoUsuario,
  Perfil,
  PerfilGuardar,
  PermisoCatalogo,
  Usuario,
  UsuarioActualizar,
  UsuarioCrear,
} from "@/types/api";

// ─── Perfiles ───────────────────────────────────────────

export async function listarPermisos(): Promise<PermisoCatalogo[]> {
  const { data } = await api.get<PermisoCatalogo[]>("/api/permisos");
  return data;
}

export async function listarPerfiles(): Promise<Perfil[]> {
  const { data } = await api.get<Perfil[]>("/api/perfiles");
  return data;
}

export async function crearPerfil(datos: PerfilGuardar): Promise<Perfil> {
  const { data } = await api.post<Perfil>("/api/perfiles", datos);
  return data;
}

export async function actualizarPerfil(id: number, datos: PerfilGuardar): Promise<Perfil> {
  const { data } = await api.patch<Perfil>(`/api/perfiles/${id}`, datos);
  return data;
}

export async function eliminarPerfil(id: number): Promise<void> {
  await api.delete(`/api/perfiles/${id}`);
}

// ─── Usuarios ───────────────────────────────────────────

export async function listarUsuarios(filtros: {
  buscar?: string;
  perfilId?: number | null;
  estado?: EstadoUsuario | null;
} = {}): Promise<Usuario[]> {
  const { data } = await api.get<Usuario[]>("/api/usuarios", {
    params: {
      q: filtros.buscar?.trim() || undefined,
      perfil_id: filtros.perfilId ?? undefined,
      estado: filtros.estado ?? undefined,
    },
  });
  return data;
}

export async function obtenerUsuario(id: number): Promise<Usuario> {
  const { data } = await api.get<Usuario>(`/api/usuarios/${id}`);
  return data;
}

export async function crearUsuario(datos: UsuarioCrear): Promise<Usuario> {
  const { data } = await api.post<Usuario>("/api/usuarios", datos);
  return data;
}

export async function actualizarUsuario(id: number, datos: UsuarioActualizar): Promise<Usuario> {
  const { data } = await api.patch<Usuario>(`/api/usuarios/${id}`, datos);
  return data;
}

/** Asigna una contraseña temporal, desbloquea la cuenta y cierra sus sesiones. */
export async function restablecerPassword(id: number, passwordTemporal: string): Promise<Usuario> {
  const { data } = await api.put<Usuario>(`/api/usuarios/${id}/password`, {
    password_temporal: passwordTemporal,
  });
  return data;
}
