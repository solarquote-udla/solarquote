/**
 * Proyectos en curso — se muestra en CÁLCULO > Historial.
 *
 * Desde que el alta de proyectos se hace en el Paso 1 del asistente
 * ("Generar layout solar"), esta pantalla solo lista los proyectos para
 * retomarlos en el paso en que quedaron. Es provisional: el Historial
 * completo, con cotizaciones y filtros, es RF-10 y lo reemplaza.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { RUTA_PROYECTO_NUEVO, rutaPaso, type NumeroPaso } from "@/components/asistente";
import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { listarProyectos } from "@/services/proyectos";
import { Permiso, type Proyecto } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

/**
 * Paso en el que conviene retomar el proyecto: el primero que falta.
 * No se usa el estado: "en diseño" no distingue si falta el equipo o el
 * layout (lo marca el backend en cuanto hay terreno o equipo).
 */
function pasoParaRetomar(p: Proyecto): NumeroPaso {
  if (!p.tiene_terreno) return 1;
  if (!p.tiene_equipo) return 2;
  return 3;
}

function etiquetaRetomar(p: Proyecto, paso: NumeroPaso): string {
  if (paso === 1) return "Continuar en Terreno";
  if (paso === 2) return "Continuar en Panel + Inversor";
  return p.tiene_layout ? "Abrir Caminos + Layout" : "Continuar en Caminos + Layout";
}

export function ProyectosPage() {
  const { tienePermiso } = useAuth();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    let cancelado = false;
    listarProyectos()
      .then((lista) => {
        if (!cancelado) setProyectos(lista);
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudieron cargar los proyectos"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const texto = buscar.trim().toLowerCase();
  const visibles = proyectos.filter(
    (p) => !texto || p.nombre.toLowerCase().includes(texto) || p.cliente.nombre.toLowerCase().includes(texto),
  );
  const puedeEditar = tienePermiso(Permiso.GENERAR_LAYOUT);

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <span>Cálculo</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Historial</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Historial</h1>
          <p className="mt-1 text-sm text-acero-500">Proyectos en curso: retómalos en el paso en que quedaron</p>
        </div>
        {puedeEditar && (
          <Link
            to={RUTA_PROYECTO_NUEVO}
            className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600"
          >
            + Nuevo proyecto
          </Link>
        )}
      </div>

      <input
        type="search"
        className="mt-6 w-full max-w-sm rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        placeholder="Buscar por proyecto o cliente"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        aria-label="Buscar proyectos"
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando proyectos…</p>
        ) : errorCarga ? (
          <p className="p-6 text-sm text-red-600">{errorCarga}</p>
        ) : visibles.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-acero-700">
              {proyectos.length === 0 ? "Todavía no hay proyectos" : "Ningún proyecto coincide con la búsqueda"}
            </p>
            {proyectos.length === 0 && (
              <p className="mt-1 text-sm text-acero-500">Créalo desde Generar layout solar.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Última modificación</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-200">
              {visibles.map((p) => {
                const paso = pasoParaRetomar(p);
                return (
                  <tr key={p.id} className="hover:bg-acero-100/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-acero-800">{p.nombre}</p>
                      {p.ubicacion && <p className="text-xs text-acero-500">{p.ubicacion}</p>}
                    </td>
                    <td className="px-4 py-3 text-acero-600">{p.cliente.nombre}</td>
                    <td className="px-4 py-3">
                      <EstadoProyectoBadge estado={p.estado} />
                    </td>
                    <td className="px-4 py-3 text-xs text-acero-500">{fechaHora(p.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {puedeEditar && (
                        <Link to={rutaPaso(p.id, paso)} className="text-sm font-medium text-solar-700 hover:underline">
                          {etiquetaRetomar(p, paso)}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
