/**
 * Panel del Módulo 4 — Administración.
 *
 * Reúne los catálogos que el Gerente General mantiene. Cada sección se
 * habilita cuando su backend existe; las demás muestran en qué sprint
 * están planificadas, igual que EnConstruccionPage.
 */

import { Link } from "react-router-dom";

interface Seccion {
  titulo: string;
  descripcion: string;
  rf: string;
  /** Ruta si ya está disponible; si no, el sprint planificado */
  ruta?: string;
  sprint?: string;
}

const SECCIONES: Seccion[] = [
  {
    titulo: "Clientes",
    descripcion: "Instaladores a los que se cotiza. Se eligen al crear un proyecto.",
    rf: "RF-12",
    ruta: "/administracion/clientes",
  },
  {
    titulo: "Inversores",
    descripcion: "Lista de referencia para configurar el equipo de cada proyecto.",
    rf: "RF-08",
    sprint: "Sprint 3",
  },
  {
    titulo: "Precios",
    descripcion: "Precio vigente de cada material, con historial de cambios.",
    rf: "RF-09",
    ruta: "/administracion/precios",
  },
  {
    titulo: "Usuarios y perfiles",
    descripcion: "Cuentas del Gerente General y del Personal de Producción.",
    rf: "RF-11",
    sprint: "por planificar",
  },
];

export function AdministracionPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-acero-900">Administración</h1>
      <p className="mt-1 text-sm text-acero-500">Módulo 4 — catálogos del sistema</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SECCIONES.map((s) =>
          s.ruta ? (
            <Link
              key={s.titulo}
              to={s.ruta}
              className="group rounded-xl border border-acero-200 bg-white p-5 transition hover:border-solar-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-acero-800 group-hover:text-solar-700">{s.titulo}</h2>
                <span className="text-xs text-acero-400">{s.rf}</span>
              </div>
              <p className="mt-2 text-sm text-acero-500">{s.descripcion}</p>
              <p className="mt-3 text-sm font-medium text-solar-700">Abrir →</p>
            </Link>
          ) : (
            <div key={s.titulo} className="rounded-xl border border-dashed border-acero-300 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-acero-500">{s.titulo}</h2>
                <span className="text-xs text-acero-400">{s.rf}</span>
              </div>
              <p className="mt-2 text-sm text-acero-400">{s.descripcion}</p>
              <p className="mt-3 text-xs text-acero-400">En desarrollo · {s.sprint}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
