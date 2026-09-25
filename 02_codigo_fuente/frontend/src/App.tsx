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
import { EnConstruccionPage } from "@/pages/EnConstruccionPage";
import { InicioPage } from "@/pages/InicioPage";
import { LoginPage } from "@/pages/LoginPage";
import { SinPermisosPage } from "@/pages/SinPermisosPage";
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
              <Route
                path="proyectos"
                element={
                  <EnConstruccionPage
                    titulo="Proyectos y layout"
                    modulo="Módulo 1"
                    requerimientos="RF-01 a RF-03"
                    sprint="Sprint 3–4"
                  />
                }
              />
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
              <Route
                path="administracion"
                element={
                  <EnConstruccionPage
                    titulo="Administración"
                    modulo="Módulo 4"
                    requerimientos="RF-08 a RF-13"
                    sprint="Sprint 3–4"
                  />
                }
              />
            </Route>
          </Route>

          {/* Cualquier ruta desconocida vuelve al inicio */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
