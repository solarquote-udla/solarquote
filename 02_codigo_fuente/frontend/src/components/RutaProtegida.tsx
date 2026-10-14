/**
 * Guarda de rutas.
 *
 * Bloquea el acceso a quien no haya iniciado sesión, lleva a cambiar la
 * contraseña a quien todavía tiene una temporal y, opcionalmente, exige
 * que el perfil tenga al menos uno de los permisos indicados (RF-11).
 *
 * Esto es comodidad de interfaz, no seguridad: cualquiera puede alterar
 * el JavaScript del navegador. La autorización real la impone el backend
 * con `requiere_permiso`. Aquí solo se evita mostrar pantallas inútiles.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import type { Permiso } from "@/types/api";

interface Props {
  permisos?: Permiso[];
}

export function RutaProtegida({ permisos }: Props) {
  const { usuario, cargando, tienePermiso } = useAuth();
  const ubicacion = useLocation();

  if (cargando) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-acero-200 border-t-solar-500" />
          <p className="text-sm text-acero-500">Cargando…</p>
        </div>
      </div>
    );
  }

  if (usuario === null) {
    // `state` recuerda a dónde iba, para volver ahí tras iniciar sesión
    return <Navigate to="/login" state={{ destino: ubicacion.pathname }} replace />;
  }

  if (usuario.debe_cambiar_password) {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (permisos && !tienePermiso(...permisos)) {
    return <Navigate to="/sin-permisos" replace />;
  }

  return <Outlet />;
}
