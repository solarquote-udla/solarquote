/**
 * Navegación entre las pantallas de configuración de un proyecto.
 *
 * Terreno (RF-01) y equipo (RF-02) son los dos insumos que RF-03 necesita
 * para generar el layout; por eso van en ese orden.
 */

import { NavLink } from "react-router-dom";

const PESTANAS = [
  { ruta: "terreno", etiqueta: "Terreno y caminos", rf: "RF-01" },
  { ruta: "equipo", etiqueta: "Panel e inversor", rf: "RF-02" },
  { ruta: "layout", etiqueta: "Layout", rf: "RF-03" },
];

export function PestanasProyecto({ proyectoId }: { proyectoId: number }) {
  return (
    <nav className="mt-4 flex gap-1 border-b border-acero-200">
      {PESTANAS.map((p) => (
        <NavLink
          key={p.ruta}
          to={`/proyectos/${proyectoId}/${p.ruta}`}
          className={({ isActive }) =>
            [
              "-mb-px border-b-2 px-4 py-2 text-sm transition",
              isActive
                ? "border-solar-500 font-semibold text-solar-700"
                : "border-transparent text-acero-500 hover:text-acero-800",
            ].join(" ")
          }
        >
          {p.etiqueta}
          <span className="ml-1.5 text-xs font-normal text-acero-400">{p.rf}</span>
        </NavLink>
      ))}
    </nav>
  );
}
