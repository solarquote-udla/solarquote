/**
 * Definición del contexto de autenticación.
 *
 * Va separado del proveedor (AuthProvider.tsx) porque Fast Refresh de Vite
 * exige que un archivo de componentes exporte solo componentes. Mezclar el
 * contexto con el proveedor rompe la recarga en caliente.
 */

import { createContext } from "react";

import type { RolUsuario, Usuario } from "@/types/api";

export interface EstadoAuth {
  usuario: Usuario | null;
  cargando: boolean;
  autenticado: boolean;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => void;
  tieneRol: (...roles: RolUsuario[]) => boolean;
}

export const AuthContext = createContext<EstadoAuth | null>(null);
