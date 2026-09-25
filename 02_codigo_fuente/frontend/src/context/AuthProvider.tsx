/**
 * Proveedor de autenticación.
 *
 * Mantiene el usuario en memoria y el token en localStorage. Al montar,
 * si hay token guardado, pregunta al backend quién es el usuario — así una
 * recarga de página no pierde la sesión, y un token revocado se detecta.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AuthContext, type EstadoAuth } from "@/context/AuthContext";
import { borrarToken, guardarToken, obtenerToken } from "@/services/api";
import { iniciarSesion as loginApi, obtenerUsuarioActual } from "@/services/auth";
import type { RolUsuario, Usuario } from "@/types/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al arrancar: si hay token, recuperar la sesión
  useEffect(() => {
    let cancelado = false;

    async function restaurarSesion() {
      if (!obtenerToken()) {
        setCargando(false);
        return;
      }

      try {
        const usuarioActual = await obtenerUsuarioActual();
        if (!cancelado) setUsuario(usuarioActual);
      } catch {
        // Token vencido o inválido: el interceptor ya lo limpió
        if (!cancelado) setUsuario(null);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    void restaurarSesion();

    return () => {
      cancelado = true;
    };
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const respuesta = await loginApi({ email, password });
    guardarToken(respuesta.access_token);
    setUsuario(respuesta.usuario);
  }, []);

  const cerrarSesion = useCallback(() => {
    borrarToken();
    setUsuario(null);
  }, []);

  const tieneRol = useCallback(
    (...roles: RolUsuario[]) => (usuario ? roles.includes(usuario.rol) : false),
    [usuario],
  );

  const valor = useMemo<EstadoAuth>(
    () => ({
      usuario,
      cargando,
      autenticado: usuario !== null,
      iniciarSesion,
      cerrarSesion,
      tieneRol,
    }),
    [usuario, cargando, iniciarSesion, cerrarSesion, tieneRol],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
