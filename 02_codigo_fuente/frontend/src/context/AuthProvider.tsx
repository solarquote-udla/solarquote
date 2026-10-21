/**
 * Proveedor de autenticación.
 *
 * Mantiene el usuario en memoria y el token en localStorage. Al montar,
 * si hay token guardado, pregunta al backend quién es el usuario — así una
 * recarga de página no pierde la sesión, y un token revocado se detecta.
 * Con la sesión abierta, 30 minutos sin actividad la cierran (RNF-04).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AuthContext, type EstadoAuth } from "@/context/AuthContext";
import { useCierrePorInactividad } from "@/hooks/useCierrePorInactividad";
import { borrarToken, guardarToken, obtenerToken } from "@/services/api";
import {
  cambiarPassword as cambiarPasswordApi,
  iniciarSesion as loginApi,
  obtenerUsuarioActual,
} from "@/services/auth";
import type { CambioPassword, Permiso, UsuarioSesion } from "@/types/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
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

  // RNF-04: 30 minutos sin actividad cierran la sesión. Se recarga la
  // página en el login para descartar todo lo que quedó en memoria.
  const cerrarPorInactividad = useCallback(() => {
    borrarToken();
    setUsuario(null);
    window.location.replace("/login?inactividad=1");
  }, []);
  useCierrePorInactividad(usuario !== null, cerrarPorInactividad);

  const cambiarPassword = useCallback(async (datos: CambioPassword) => {
    const respuesta = await cambiarPasswordApi(datos);
    guardarToken(respuesta.access_token);
    setUsuario(respuesta.usuario);
  }, []);

  const refrescarSesion = useCallback(async () => {
    setUsuario(await obtenerUsuarioActual());
  }, []);

  // Es solo para no mostrar opciones inútiles: quien decide es el backend
  const tienePermiso = useCallback(
    (...permisos: Permiso[]) =>
      usuario ? permisos.some((permiso) => usuario.permisos.includes(permiso)) : false,
    [usuario],
  );

  const valor = useMemo<EstadoAuth>(
    () => ({
      usuario,
      cargando,
      autenticado: usuario !== null,
      iniciarSesion,
      cerrarSesion,
      cambiarPassword,
      refrescarSesion,
      tienePermiso,
    }),
    [usuario, cargando, iniciarSesion, cerrarSesion, cambiarPassword, refrescarSesion, tienePermiso],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
