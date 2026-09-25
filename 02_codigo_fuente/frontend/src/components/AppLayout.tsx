/**
 * Shell de la aplicación: barra lateral + encabezado + área de contenido.
 *
 * El menú se filtra por rol: el Personal de Producción solo ve el módulo
 * de Validación, según el documento capstone.
 */

import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { ETIQUETAS_ROL, RolUsuario } from "@/types/api";

interface ItemMenu {
  ruta: string;
  etiqueta: string;
  modulo: string;
  roles: RolUsuario[];
}

const MENU: ItemMenu[] = [
  {
    ruta: "/",
    etiqueta: "Inicio",
    modulo: "",
    roles: [RolUsuario.GERENTE_GENERAL, RolUsuario.PERSONAL_PRODUCCION],
  },
  {
    ruta: "/proyectos",
    etiqueta: "Proyectos",
    modulo: "Módulo 1",
    roles: [RolUsuario.GERENTE_GENERAL],
  },
  {
    ruta: "/bocetos",
    etiqueta: "Bocetos",
    modulo: "Módulo 2",
    roles: [RolUsuario.GERENTE_GENERAL],
  },
  {
    ruta: "/cotizaciones",
    etiqueta: "Cotizaciones",
    modulo: "Módulo 3",
    roles: [RolUsuario.GERENTE_GENERAL],
  },
  {
    ruta: "/administracion",
    etiqueta: "Administración",
    modulo: "Módulo 4",
    roles: [RolUsuario.GERENTE_GENERAL],
  },
  {
    ruta: "/validacion",
    etiqueta: "Validación",
    modulo: "Módulo 5",
    roles: [RolUsuario.GERENTE_GENERAL, RolUsuario.PERSONAL_PRODUCCION],
  },
];

export function AppLayout() {
  const { usuario, cerrarSesion } = useAuth();

  const menuVisible = MENU.filter((item) => usuario && item.roles.includes(usuario.rol));

  const iniciales = usuario?.nombre
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-acero-50">
      {/* ─── Barra lateral ─────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-acero-200 bg-white">
        <div className="border-b border-acero-200 px-6 py-5">
          <span className="text-xl font-bold tracking-tight text-acero-900">
            Solar<span className="text-solar-500">Quote</span>
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {menuVisible.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              end={item.ruta === "/"}
              className={({ isActive }) =>
                [
                  "block rounded-lg px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-solar-50 font-semibold text-solar-700"
                    : "text-acero-600 hover:bg-acero-100",
                ].join(" ")
              }
            >
              <span className="block">{item.etiqueta}</span>
              {item.modulo && (
                <span className="block text-xs font-normal text-acero-400">{item.modulo}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-acero-200 p-4">
          <p className="text-xs text-acero-400">HEXtructure S.A.S.</p>
        </div>
      </aside>

      {/* ─── Contenido ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-acero-200 bg-white px-6">
          <div className="text-right">
            <p className="text-sm font-medium text-acero-800">{usuario?.nombre}</p>
            <p className="text-xs text-acero-500">
              {usuario ? ETIQUETAS_ROL[usuario.rol] : ""}
            </p>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-solar-100 text-sm font-semibold text-solar-700">
            {iniciales}
          </div>

          <button
            type="button"
            onClick={cerrarSesion}
            className="rounded-lg border border-acero-300 px-3 py-1.5 text-sm text-acero-600 transition hover:bg-acero-100"
          >
            Salir
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
