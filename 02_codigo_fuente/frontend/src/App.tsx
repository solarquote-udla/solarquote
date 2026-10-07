/**
 * Mapa de rutas de la aplicación.
 *
 * Estructura:
 *   /login                   → pública
 *   /sin-permisos            → pública
 *   todo lo demás            → dentro de <RutaProtegida> y del shell
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { RutaProtegida } from "@/components/RutaProtegida";
import { AuthProvider } from "@/context/AuthProvider";
import { AdministracionPage } from "@/pages/AdministracionPage";
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
import { RolUsuario } from "@/types/api";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ─── Públicas ───────────────────────────── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sin-permisos" element={<SinPermisosPage />} />

          {/* ─── Requieren sesión ───────────────────── */}
          <Route element={<RutaProtegida />}>
            <Route element={<AppLayout />}>
              <Route index element={<InicioPage />} />

              <Route
                path="validacion"
                element={
                  <EnConstruccionPage
                    titulo="Validación de materiales"
                    modulo="Módulo 5"
                    requerimientos="RF-14 a RF-16"
                    sprint="Sprint 12–14"
                  />
                }
              />
            </Route>
          </Route>

          {/* ─── Solo Gerente General ───────────────── */}
          <Route element={<RutaProtegida rolesPermitidos={[RolUsuario.GERENTE_GENERAL]} />}>
            <Route element={<AppLayout />}>
              <Route path="proyectos" element={<ProyectosPage />} />
              <Route path="proyectos/:proyectoId/terreno" element={<TerrenoPage />} />
              <Route path="proyectos/:proyectoId/equipo" element={<EquipoPage />} />
              <Route path="proyectos/:proyectoId/layout" element={<LayoutPage />} />
              <Route
                path="bocetos"
                element={
                  <EnConstruccionPage
                    titulo="Bocetos"
                    modulo="Módulo 2"
                    requerimientos="RF-04 y RF-05"
                    sprint="Sprint 9 en adelante"
                  />
                }
              />
              <Route
                path="cotizaciones"
                element={
                  <EnConstruccionPage
                    titulo="Cotizaciones"
                    modulo="Módulo 3"
                    requerimientos="RF-06 y RF-07"
                    sprint="Sprint 5–6"
                  />
                }
              />
              <Route path="administracion" element={<AdministracionPage />} />
              <Route path="administracion/clientes" element={<ClientesPage />} />
              <Route path="administracion/precios" element={<PreciosPage />} />
            </Route>
          </Route>

          {/* Cualquier ruta desconocida vuelve al inicio */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
