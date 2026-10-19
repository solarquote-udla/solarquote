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
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useParams,
} from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { RutaProtegida } from "@/components/RutaProtegida";
import { AuthProvider } from "@/context/AuthProvider";
import { CambiarPasswordPage } from "@/pages/CambiarPasswordPage";
import { CargarBocetoPage } from "@/pages/CargarBocetoPage";
import { ClientesPage } from "@/pages/ClientesPage";
import { ConfirmacionBocetoPage } from "@/pages/ConfirmacionBocetoPage";
import { ConfirmacionPage } from "@/pages/ConfirmacionPage";
import { CotizacionDetallePage } from "@/pages/CotizacionDetallePage";
import { EnConstruccionPage } from "@/pages/EnConstruccionPage";
import { EquipoPage } from "@/pages/EquipoPage";
import { HistorialPage } from "@/pages/HistorialPage";
import { InicioPage } from "@/pages/InicioPage";
import { InversoresPage } from "@/pages/InversoresPage";
import { LayoutPage } from "@/pages/LayoutPage";
import { LoginPage } from "@/pages/LoginPage";
import { MaterialesPage } from "@/pages/MaterialesPage";
import { PerfilesPage } from "@/pages/PerfilesPage";
import { PreciosPage } from "@/pages/PreciosPage";
import { SinPermisosPage } from "@/pages/SinPermisosPage";
import { TerrenoPage } from "@/pages/TerrenoPage";
import { UsuarioFormPage } from "@/pages/UsuarioFormPage";
import { UsuariosPage } from "@/pages/UsuariosPage";
import { Permiso } from "@/types/api";

/** Rutas que exigen un permiso (basta uno de la lista), dentro del shell. */
function conPermiso(permiso: Permiso | Permiso[], rutas: ReactNode) {
  return (
    <Route element={<RutaProtegida permisos={Array.isArray(permiso) ? permiso : [permiso]} />}>
      <Route element={<AppLayout />}>{rutas}</Route>
    </Route>
  );
}

/** Rutas anteriores al asistente: /proyectos/:id/terreno → /generar/:id/terreno */
function RedirigirPaso({ paso }: { paso: string }) {
  const { proyectoId } = useParams();
  return <Navigate to={`/generar/${proyectoId}/${paso}`} replace />;
}

function pendiente(titulo: string, modulo: string, requerimientos: string) {
  return (
    <EnConstruccionPage titulo={titulo} modulo={modulo} requerimientos={requerimientos} sprint="cronograma" />
  );
}

/** La sesión envuelve a todas las rutas. */
function Raiz() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/*
 * "Data router" (createBrowserRouter) y no <BrowserRouter>: es el que
 * permite `useBlocker`, con el que el asistente avisa antes de perder
 * cambios sin guardar al salir por cualquier vía (hooks/useCambiosSinGuardar).
 */
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Raiz />}>
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
              {/* Asistente: Paso 1 sin id crea el proyecto */}
              <Route path="generar" element={<TerrenoPage />} />
              <Route path="generar/:proyectoId/terreno" element={<TerrenoPage />} />
              <Route path="generar/:proyectoId/equipo" element={<EquipoPage />} />
              <Route path="generar/:proyectoId/layout" element={<LayoutPage />} />
              <Route path="generar/:proyectoId/confirmacion" element={<ConfirmacionPage />} />
              <Route path="proyectos" element={<Navigate to="/historial" replace />} />
              <Route path="proyectos/:proyectoId/terreno" element={<RedirigirPaso paso="terreno" />} />
              <Route path="proyectos/:proyectoId/equipo" element={<RedirigirPaso paso="equipo" />} />
              <Route path="proyectos/:proyectoId/layout" element={<RedirigirPaso paso="layout" />} />
            </>,
          )}
          {conPermiso(
            Permiso.CARGAR_BOCETO,
            <>
              {/* Sin id crea el proyecto; con id carga otro boceto al mismo proyecto */}
              <Route path="bocetos" element={<CargarBocetoPage />} />
              <Route path="bocetos/:proyectoId" element={<CargarBocetoPage key="existente" />} />
              <Route path="bocetos/:proyectoId/confirmacion" element={<ConfirmacionBocetoPage />} />
            </>,
          )}
          {conPermiso(
            [Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT],
            <>
              <Route path="historial" element={<HistorialPage />} />
              <Route path="cotizaciones/:cotizacionId" element={<CotizacionDetallePage />} />
            </>,
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
          {conPermiso(Permiso.INVERSORES, <Route path="configuracion/inversores" element={<InversoresPage />} />)}
          {conPermiso(Permiso.MATERIALES, <Route path="configuracion/materiales" element={<MaterialesPage />} />)}
          {conPermiso(Permiso.PRECIOS, <Route path="configuracion/precios" element={<PreciosPage />} />)}
          {conPermiso(Permiso.PERFILES, <Route path="seguridad/perfiles" element={<PerfilesPage />} />)}
          {conPermiso(
            Permiso.USUARIOS,
            <>
              <Route path="seguridad/usuarios" element={<UsuariosPage />} />
              <Route path="seguridad/usuarios/nuevo" element={<UsuarioFormPage />} />
              <Route path="seguridad/usuarios/:usuarioId" element={<UsuarioFormPage />} />
            </>,
          )}

          {/* Rutas anteriores al menú del prototipo */}
          <Route path="administracion/clientes" element={<Navigate to="/clientes" replace />} />
          <Route path="administracion/precios" element={<Navigate to="/configuracion/precios" replace />} />

          {/* Cualquier ruta desconocida vuelve al inicio */}
          <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);

export default function App() {
  return <RouterProvider router={router} />;
}
