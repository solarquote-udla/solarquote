/**
 * Guarda de rutas.
 *
 * Bloquea el acceso a quien no haya iniciado sesión y, opcionalmente,
 * a quien no tenga el rol requerido (RF-11).
 *
 * Esto es comodidad de interfaz, no seguridad: cualquiera puede alterar
 * el JavaScript del navegador. La autorización real la impone el backend
 * con `requiere_roles`. Aquí solo se evita mostrar pantallas inútiles.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import type { RolUsuario } from "@/types/api";

interface Props {
  rolesPermitidos?: RolUsuario[];
}

export function RutaProtegida({ rolesPermitidos }: Props) {
  const { autenticado, cargando, tieneRol } = useAuth();
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

  if (!autenticado) {
    // `state` recuerda a dónde iba, para volver ahí tras iniciar sesión
    return <Navigate to="/login" state={{ destino: ubicacion.pathname }} replace />;
  }

  if (rolesPermitidos && !tieneRol(...rolesPermitidos)) {
    return <Navigate to="/sin-permisos" replace />;
  }

  return <Outlet />;
}
