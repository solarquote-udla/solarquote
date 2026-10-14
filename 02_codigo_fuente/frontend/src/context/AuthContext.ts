/**
 * Definición del contexto de autenticación.
 *
 * Va separado del proveedor (AuthProvider.tsx) porque Fast Refresh de Vite
 * exige que un archivo de componentes exporte solo componentes. Mezclar el
 * contexto con el proveedor rompe la recarga en caliente.
 */

import { createContext } from "react";

import type { CambioPassword, Permiso, UsuarioSesion } from "@/types/api";

export interface EstadoAuth {
  usuario: UsuarioSesion | null;
  cargando: boolean;
  autenticado: boolean;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => void;
  cambiarPassword: (datos: CambioPassword) => Promise<void>;
  /** True si el perfil tiene AL MENOS UNO de los permisos (igual que el backend). */
  tienePermiso: (...permisos: Permiso[]) => boolean;
}

export const AuthContext = createContext<EstadoAuth | null>(null);
