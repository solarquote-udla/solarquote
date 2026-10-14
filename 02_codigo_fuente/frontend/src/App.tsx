/**
 * Mapa de rutas de la aplicación.
 *
 * Estructura (igual al menú del prototipo, ver components/menu.ts):
 *   /login, /sin-permisos        → públicas
 *   /cambiar-password            → con sesión, fuera del shell
 *   todo lo demás                → dentro de <RutaProtegida> y del shell;
 *                                  cada opción exige su permiso (RF-11)
 */

import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { RutaProtegida } from "@/components/RutaProtegida";
import { AuthProvider } from "@/context/AuthProvider";
import { CambiarPasswordPage } from "@/pages/CambiarPasswordPage";
import { ClientesPage } from "@/pages/ClientesPage";
import { EnConstruccionPage } from "@/pages/EnConstruccionPage";
import { EquipoPage } from "@/pages/EquipoPage";
import { InicioPage } from "@/pages/InicioPage";
import { LayoutPage } from "@/pages/LayoutPage";
import { LoginPage } from "@/pages/LoginPage";
import { PreciosPage } from "@/pages/PreciosPage";
import { ProyectosPage } from "@/pages/ProyectosPage";
import { SinPermisosPage } from "@/pages/SinPermisosPage";
import { TerrenoPage } from "@/pages/TerrenoPage";
import { Permiso } from "@/types/api";

/** Rutas que exigen un permiso, dentro del shell. */
function conPermiso(permiso: Permiso, rutas: ReactNode) {
  return (
    <Route element={<RutaProtegida permisos={[permiso]} />}>
      <Route element={<AppLayout />}>{rutas}</Route>
    </Route>
  );
}

function pendiente(titulo: string, modulo: string, requerimientos: string) {
  return (
    <EnConstruccionPage titulo={titulo} modulo={modulo} requerimientos={requerimientos} sprint="cronograma" />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ─── Públicas ───────────────────────────── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sin-permisos" element={<SinPermisosPage />} />
          <Route path="/cambiar-password" element={<CambiarPasswordPage />} />

          {/* ─── Dashboard: todo usuario con sesión ─── */}
          <Route element={<RutaProtegida />}>
            <Route element={<AppLayout />}>
              <Route index element={<InicioPage />} />
            </Route>
          </Route>

          {/* ─── CÁLCULO ────────────────────────────── */}
          {conPermiso(
            Permiso.GENERAR_LAYOUT,
            <>
              <Route path="proyectos" element={<ProyectosPage />} />
              <Route path="proyectos/:proyectoId/terreno" element={<TerrenoPage />} />
              <Route path="proyectos/:proyectoId/equipo" element={<EquipoPage />} />
              <Route path="proyectos/:proyectoId/layout" element={<LayoutPage />} />
            </>,
          )}
          {conPermiso(
            Permiso.CARGAR_BOCETO,
            <Route path="bocetos" element={pendiente("Cargar boceto", "Módulo 2", "RF-04 y RF-05")} />,
          )}
          {conPermiso(
            Permiso.HISTORIAL,
            <Route path="historial" element={pendiente("Historial", "Módulo 3", "RF-10")} />,
          )}

          {/* ─── OPERACIONES ────────────────────────── */}
          {conPermiso(
            Permiso.DESPACHO,
            <Route path="validacion/despacho" element={pendiente("Despacho en planta", "Módulo 5", "RF-14 y RF-16")} />,
          )}
          {conPermiso(
            Permiso.RECEPCION,
            <Route
              path="validacion/recepcion"
              element={pendiente("Recepción en terreno", "Módulo 5", "RF-15 y RF-16")}
            />,
          )}
          {conPermiso(Permiso.CLIENTES, <Route path="clientes" element={<ClientesPage />} />)}

          {/* ─── CONFIGURACIÓN ──────────────────────── */}
          {conPermiso(
            Permiso.INVERSORES,
            <Route path="configuracion/inversores" element={pendiente("Inversores", "Módulo 4", "RF-08")} />,
          )}
          {conPermiso(
            Permiso.MATERIALES,
            <Route path="configuracion/materiales" element={pendiente("Materiales", "Módulo 4", "RF-09")} />,
          )}
          {conPermiso(Permiso.PRECIOS, <Route path="configuracion/precios" element={<PreciosPage />} />)}
          {conPermiso(
            Permiso.PERFILES,
            <Route path="seguridad/perfiles" element={pendiente("Perfiles", "Seguridad", "RF-11")} />,
          )}
          {conPermiso(
            Permiso.USUARIOS,
            <Route path="seguridad/usuarios" element={pendiente("Usuarios", "Seguridad", "RF-11")} />,
          )}

          {/* Rutas anteriores al menú del prototipo */}
          <Route path="administracion/clientes" element={<Navigate to="/clientes" replace />} />
          <Route path="administracion/precios" element={<Navigate to="/configuracion/precios" replace />} />

          {/* Cualquier ruta desconocida vuelve al inicio */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
