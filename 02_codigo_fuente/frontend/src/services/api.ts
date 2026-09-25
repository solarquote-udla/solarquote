/**
 * Cliente HTTP central.
 *
 * Toda llamada a la API pasa por aquí. Los interceptores resuelven en un
 * solo lugar dos cosas que si no habría que repetir en cada petición:
 *   1. adjuntar el token JWT
 *   2. reaccionar cuando el token expira
 */

import axios, { AxiosError } from "axios";

import type { ErrorApi } from "@/types/api";

const CLAVE_TOKEN = "solarquote_token";

export const api = axios.create({
  // En desarrollo el proxy de Vite reenvía /api al backend.
  // En producción se define con VITE_API_URL.
  baseURL: import.meta.env.VITE_API_URL ?? "",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ─── Almacenamiento del token ───────────────────────────
// Nota de seguridad: localStorage es vulnerable a XSS. La alternativa
// más segura son cookies httpOnly, pero requiere que el backend las
// emita y manejar CSRF. Para el alcance de este proyecto se documenta
// la decisión y se mitiga evitando renderizar HTML sin sanitizar.

export function guardarToken(token: string): void {
  localStorage.setItem(CLAVE_TOKEN, token);
}

export function obtenerToken(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

export function borrarToken(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

// ─── Interceptor de petición: adjunta el JWT ────────────
api.interceptors.request.use((config) => {
  const token = obtenerToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Interceptor de respuesta: maneja token expirado ────
api.interceptors.response.use(
  (respuesta) => respuesta,
  (error: AxiosError<ErrorApi>) => {
    const esNoAutorizado = error.response?.status === 401;
    const esIntentoDeLogin = error.config?.url?.includes("/auth/login");

    // Un 401 fuera del login significa token vencido o inválido:
    // se limpia la sesión y se manda al usuario a iniciar de nuevo.
    // En el login, el 401 es "credenciales incorrectas" y lo maneja
    // la pantalla, no este interceptor.
    if (esNoAutorizado && !esIntentoDeLogin) {
      borrarToken();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?expirado=1";
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Traduce un error de axios a un mensaje legible en español.
 * FastAPI devuelve `detail` como string (errores de negocio) o como
 * arreglo (errores de validación de Pydantic).
 */
export function mensajeDeError(error: unknown, porDefecto = "Ocurrió un error inesperado"): string {
  if (!axios.isAxiosError(error)) {
    return porDefecto;
  }

  const err = error as AxiosError<ErrorApi>;

  if (!err.response) {
    return "No se pudo conectar con el servidor. Verifica que el backend esté corriendo.";
  }

  const detalle = err.response.data?.detail;

  if (typeof detalle === "string") {
    return detalle;
  }

  if (Array.isArray(detalle) && detalle.length > 0) {
    return detalle.map((d) => d.msg).join(". ");
  }

  return porDefecto;
}
