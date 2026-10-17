/**
 * Historial — CÁLCULO > Historial.
 *
 * Dos pestañas, mismo permiso y misma ruta (/historial):
 *   - "En curso": proyectos sin cotizar, para retomarlos en el paso en
 *     que quedaron (lo que antes era ProyectosPage.tsx, completo).
 *   - "Cotizaciones": historial de cotizaciones emitidas, con filtros,
 *     paginación y detalle — RF-10.
 *
 * La pestaña activa vive en la URL (?vista=cotizaciones) para que se
 * pueda compartir o recargar sin perderla.
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RUTA_PROYECTO_NUEVO, rutaPaso, type NumeroPaso } from "@/components/asistente";
import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { listarCotizaciones } from "@/services/cotizaciones";
import { listarProyectos } from "@/services/proyectos";
import {
  ETIQUETAS_ESTADO_COTIZACION,
  EstadoCotizacion,
  Permiso,
  type CotizacionResumen,
  type Proyecto,
} from "@/types/api";
import { fechaHora } from "@/utils/fechas";

type Vista = "en-curso" | "cotizaciones";

export function HistorialPage() {
  const [parametros, setParametros] = useSearchParams();
  const vista: Vista = parametros.get("vista") === "cotizaciones" ? "cotizaciones" : "en-curso";

  function irA(nueva: Vista) {
    setParametros(nueva === "en-curso" ? {} : { vista: nueva });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="text-sm text-acero-500">
        <span>Cálculo</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Historial</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold text-acero-900">Historial</h1>

      <div className="mt-4 flex gap-1 border-b border-acero-200">
        {(
          [
            ["en-curso", "En curso"],
            ["cotizaciones", "Cotizaciones"],
          ] as const
        ).map(([clave, etiqueta]) => (
          <button
            key={clave}
            type="button"
            onClick={() => irA(clave)}
            className={[
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition",
              vista === clave
                ? "border-solar-500 text-solar-700"
                : "border-transparent text-acero-500 hover:text-acero-700",
            ].join(" ")}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-6">{vista === "en-curso" ? <ProyectosEnCurso /> : <CotizacionesHistorial />}</div>
    </div>
  );
}

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

function ProyectosEnCurso() {
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-acero-500">Proyectos sin cotizar: retómalos en el paso en que quedaron</p>
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
        className="mt-4 w-full max-w-sm rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
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
              {proyectos.length === 0 ? "Todavía no hay proyectos sin cotizar" : "Ningún proyecto coincide con la búsqueda"}
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

const POR_PAGINA = 20;

function CotizacionesHistorial() {
  const [resultados, setResultados] = useState<CotizacionResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState<EstadoCotizacion | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let cancelado = false;
    const temporizador = setTimeout(() => {
      setCargando(true);
      listarCotizaciones({ buscar, estado, desde, hasta, pagina, porPagina: POR_PAGINA })
        .then((respuesta) => {
          if (cancelado) return;
          setResultados(respuesta.resultados);
          setTotal(respuesta.total);
          setTotalPaginas(respuesta.total_paginas);
          setError(null);
        })
        .catch((e) => {
          if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar las cotizaciones"));
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [buscar, estado, desde, hasta, pagina]);

  // Cualquier cambio de filtro vuelve a la primera página
  function cambiarBuscar(valor: string) {
    setPagina(1);
    setBuscar(valor);
  }
  function cambiarEstado(valor: EstadoCotizacion | "") {
    setPagina(1);
    setEstado(valor);
  }
  function cambiarDesde(valor: string) {
    setPagina(1);
    setDesde(valor);
  }
  function cambiarHasta(valor: string) {
    setPagina(1);
    setHasta(valor);
  }

  const hayFiltros = buscar.trim() !== "" || estado !== "" || desde !== "" || hasta !== "";

  return (
    <div>
      <p className="text-sm text-acero-500">Cotizaciones emitidas, de la más reciente a la más antigua</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-acero-600">Cliente</span>
          <input
            type="search"
            className="w-56 rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
            placeholder="Buscar por cliente"
            value={buscar}
            onChange={(e) => cambiarBuscar(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-acero-600">Estado</span>
          <select
            className="rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
            value={estado}
            onChange={(e) => cambiarEstado(e.target.value as EstadoCotizacion | "")}
          >
            <option value="">Todos</option>
            {Object.values(EstadoCotizacion).map((e) => (
              <option key={e} value={e}>
                {ETIQUETAS_ESTADO_COTIZACION[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-acero-600">Desde</span>
          <input
            type="date"
            className="rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => cambiarDesde(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-acero-600">Hasta</span>
          <input
            type="date"
            className="rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => cambiarHasta(e.target.value)}
          />
        </label>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setPagina(1);
              setBuscar("");
              setEstado("");
              setDesde("");
              setHasta("");
            }}
            className="text-sm text-acero-500 hover:text-acero-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
        {cargando && resultados.length === 0 ? (
          <p className="p-6 text-sm text-acero-500">Cargando cotizaciones…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : resultados.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-acero-700">
              {hayFiltros ? "Ninguna cotización coincide con los filtros" : "Todavía no hay cotizaciones emitidas"}
            </p>
          </div>
        ) : (
          <table className={["w-full text-sm", cargando ? "opacity-60" : ""].join(" ")}>
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Emitida</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-200">
              {resultados.map((c) => (
                <tr key={c.id} className="hover:bg-acero-100/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-acero-800">{c.cliente_nombre}</p>
                    {c.cliente_empresa && <p className="text-xs text-acero-500">{c.cliente_empresa}</p>}
                  </td>
                  <td className="px-4 py-3 text-acero-600">{c.proyecto_nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    <EstadoCotizacionBadge estado={c.estado} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-acero-800">
                    {c.total !== null ? `$${c.total}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-acero-500">{fechaHora(c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/cotizaciones/${c.id}`} className="text-sm font-medium text-solar-700 hover:underline">
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-acero-500">
          <span>
            {total} cotización{total === 1 ? "" : "es"}
          </span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
                className="rounded-md border border-acero-300 px-2.5 py-1 text-acero-700 hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                type="button"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
                className="rounded-md border border-acero-300 px-2.5 py-1 text-acero-700 hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
