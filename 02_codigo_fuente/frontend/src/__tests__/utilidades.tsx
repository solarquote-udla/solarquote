/**
 * Datos y montaje comunes de las pruebas de interfaz.
 *
 * `montar` usa un data router en memoria (como App.tsx) con un enlace que
 * hace de menú lateral: así se prueba también salir por el menú.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";

export const PROYECTO = {
  id: 5, nombre: "San Pablo", cliente: { id: 9, nombre: "Cliente" }, ubicacion: null, latitud: 0.19, longitud: null,
  estado: "en_diseno", notas: null, tiene_terreno: true, tiene_equipo: true, tiene_layout: false,
  created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z",
};

export const rect = (a: number, l: number) => [[0, 0], [a, 0], [a, l], [0, l]];

export const TERRENO = (v: number[][], caminos: unknown[] = []) => ({
  id: 1, proyecto_id: 5, vertices: v, orientacion_norte: 0, notas: null, caminos,
  areas: { area_bruta: 1, area_caminos: 0, area_util: 1 },
});

/** Pantallas de destino: si aparecen, la navegación ocurrió. */
const DESTINOS = [
  { path: "/generar/:proyectoId/terreno", element: <p>PASO 1</p> },
  { path: "/generar/:proyectoId/equipo", element: <p>PASO 2</p> },
  { path: "/generar/:proyectoId/layout", element: <p>PASO 3</p> },
  { path: "/historial", element: <p>HISTORIAL</p> },
  { path: "/seguridad/usuarios", element: <p>LISTA USUARIOS</p> },
];

export function montar(pagina: ReactNode, ruta: string, patrones: string[]) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Link to="/historial">MENU HISTORIAL</Link>
            <Outlet />
          </>
        ),
        children: [
          ...patrones.map((path) => ({ path, element: pagina })),
          ...DESTINOS.filter((d) => !patrones.includes(d.path)),
        ],
      },
    ],
    { initialEntries: [ruta] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}
