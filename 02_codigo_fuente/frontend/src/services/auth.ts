/**
 * Llamadas a los endpoints de autenticación (RF-11).
 */

import { api } from "@/services/api";
import type { LoginPeticion, RespuestaToken, Usuario } from "@/types/api";

export async function iniciarSesion(credenciales: LoginPeticion): Promise<RespuestaToken> {
  const { data } = await api.post<RespuestaToken>("/api/auth/login", credenciales);
  return data;
}

export async function obtenerUsuarioActual(): Promise<Usuario> {
  const { data } = await api.get<Usuario>("/api/auth/yo");
  return data;
}
