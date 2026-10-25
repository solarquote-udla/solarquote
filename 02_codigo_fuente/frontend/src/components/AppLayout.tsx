/**
 * Shell de la aplicación: barra lateral + encabezado + área de contenido.
 *
 * El menú (components/menu.ts) sigue la estructura del prototipo y se
 * filtra por los permisos del perfil: cada usuario ve solo las opciones
 * que su perfil permite (RF-11).
 */

import { Link, NavLink, Outlet } from "react-router-dom";

import { menuVisible } from "@/components/menu";
import { useAuth } from "@/hooks/useAuth";
import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { useTema } from "@/hooks/useTema";

export function AppLayout() {
  const { usuario, cerrarSesion, tienePermiso } = useAuth();
  const { tema, alternarTema } = useTema();
  const alternarTemaEtiqueta = tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

  const grupos = menuVisible(tienePermiso);

  const iniciales = usuario?.nombre
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen bg-acero-50 print:block print:h-auto">
      {/* ─── Barra lateral ─────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-acero-200 bg-superficie print:hidden">
        <div className="border-b border-acero-200 px-6 py-5">
          <span className="text-xl font-bold tracking-tight text-acero-900">
            Solar<span className="text-solar-500">Quote</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {grupos.map((grupo) => (
            <div key={grupo.titulo ?? "inicio"} className="mb-4">
              {grupo.titulo && (
                <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-acero-400">
                  {grupo.titulo}
                </p>
              )}
              {grupo.secciones.map((seccion, i) => (
                <div key={seccion.titulo ?? i} className="space-y-0.5">
                  {seccion.titulo && (
                    <p className="px-3 pt-1 text-xs font-medium text-acero-500">{seccion.titulo}</p>
                  )}
                  {seccion.opciones.map((opcion) => (
                    <NavLink
                      key={opcion.ruta}
                      to={opcion.ruta}
                      end={opcion.ruta === "/"}
                      className={({ isActive }) =>
                        [
                          "block rounded-lg py-1.5 text-sm transition",
                          seccion.titulo ? "pl-6 pr-3" : "px-3",
                          isActive
                            ? "bg-solar-50 font-semibold text-solar-700"
                            : "text-acero-600 hover:bg-acero-100",
                        ].join(" ")
                      }
                    >
                      {opcion.etiqueta}
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-acero-200 p-4">
          <p className="text-xs text-acero-400">HEXtructure S.A.S.</p>
        </div>
      </aside>

      {/* ─── Contenido ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex h-16 shrink-0 items-center justify-end gap-4 border-b border-acero-200 bg-superficie px-6 print:hidden">
          <div className="text-right">
            <p className="text-sm font-medium text-acero-800">{usuario?.nombre}</p>
            <p className="text-xs text-acero-500">{usuario?.perfil.nombre}</p>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-solar-100 text-sm font-semibold text-solar-700">
            {iniciales}
          </div>

          <button
            type="button"
            onClick={alternarTema}
            aria-label={alternarTemaEtiqueta}
            title={alternarTemaEtiqueta}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-acero-600 transition hover:bg-acero-100"
          >
            {tema === "oscuro" ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <Link
            to="/cambiar-password"
            className="rounded-lg px-3 py-1.5 text-sm text-acero-600 transition hover:bg-acero-100"
          >
            Cambiar contraseña
          </Link>

          <button
            type="button"
            onClick={() => {
              // Cerrar sesión desmonta la pantalla sin pasar por el router: se pregunta aquí
              if (hayCambiosPendientes() && !window.confirm("Hay cambios sin guardar. Si cierras sesión se pierden. ¿Salir de todas formas?")) return;
              cerrarSesion();
            }}
            className="rounded-lg border border-acero-300 px-3 py-1.5 text-sm text-acero-600 transition hover:bg-acero-100"
          >
            Salir
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
