/**
 * Llamadas a los endpoints de autenticación (RF-11).
 */

import { api } from "@/services/api";
import type { CambioPassword, LoginPeticion, RespuestaToken, UsuarioSesion } from "@/types/api";

export async function iniciarSesion(credenciales: LoginPeticion): Promise<RespuestaToken> {
  const { data } = await api.post<RespuestaToken>("/api/auth/login", credenciales);
  return data;
}

export async function obtenerUsuarioActual(): Promise<UsuarioSesion> {
  const { data } = await api.get<UsuarioSesion>("/api/auth/yo");
  return data;
}

/** Devuelve un token nuevo: el anterior deja de valer al cambiar la contraseña. */
export async function cambiarPassword(datos: CambioPassword): Promise<RespuestaToken> {
  const { data } = await api.post<RespuestaToken>("/api/auth/cambiar-password", datos);
  return data;
}
