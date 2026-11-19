/**
 * Dashboard (revisión del 16 de noviembre, Lenin): accesos grandes
 * según el perfil, los proyectos recientes por nombre para retomarlos y
 * los indicadores (RF-13). Se quitan "Estado del sistema" y "Próximos
 * módulos".
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { rutaPaso } from "@/components/asistente";
import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { TableroIndicadores } from "@/components/TableroIndicadores";
import { useAuth } from "@/hooks/useAuth";
import { listarProyectos } from "@/services/proyectos";
import { EstadoProyecto, Permiso, type Proyecto } from "@/types/api";
import { rutaConfirmacionBoceto } from "@/utils/bocetos";
import { fechaHora } from "@/utils/fechas";
import { etiquetaRetomar, pasoParaRetomar } from "@/utils/proyectos";

interface Acceso {
  ruta: string;
  titulo: string;
  descripcion: string;
  permisos: Permiso[];
}

const ACCESOS: Acceso[] = [
  {
    ruta: "/generar",
    titulo: "Nuevo proyecto",
    descripcion: "Terreno, panel, inversores y layout paso a paso",
    permisos: [Permiso.GENERAR_LAYOUT],
  },
  {
    ruta: "/bocetos",
    titulo: "Cargar boceto",
    descripcion: "Cotizar desde el plano del cliente",
    permisos: [Permiso.CARGAR_BOCETO],
  },
  {
    ruta: "/historial",
    titulo: "Historial",
    descripcion: "Proyectos en curso y cotizaciones emitidas",
    permisos: [Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT],
  },
  {
    ruta: "/clientes",
    titulo: "Clientes",
    descripcion: "Registrar y consultar clientes",
    permisos: [Permiso.CLIENTES],
  },
  {
    ruta: "/validacion/despacho",
    titulo: "Despacho en planta",
    descripcion: "Registrar lo que sale, con foto y conteo",
    permisos: [Permiso.DESPACHO],
  },
  {
    ruta: "/validacion/recepcion",
    titulo: "Recepción en terreno",
    descripcion: "Checklist de lo que llegó a obra",
    permisos: [Permiso.RECEPCION],
  },
];

const RECIENTES = 6;

function ProyectosRecientes() {
  const { tienePermiso } = useAuth();
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarProyectos()
      .then((lista) => {
        if (cancelado) return;
        const ordenados = [...lista].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        setProyectos(ordenados.slice(0, RECIENTES));
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const puedeEditar = tienePermiso(Permiso.GENERAR_LAYOUT);
  const puedeBoceto = tienePermiso(Permiso.CARGAR_BOCETO);
  const puedeCotizacion = tienePermiso(Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT);

  /** A dónde lleva el nombre del proyecto, o null si este usuario no puede abrirlo. */
  function destino(p: Proyecto): { ruta: string; accion: string } | null {
    if (p.estado === EstadoProyecto.COTIZADO && p.cotizacion_id !== null) {
      return puedeCotizacion ? { ruta: `/cotizaciones/${p.cotizacion_id}`, accion: "Ver cotización" } : null;
    }
    if (p.tiene_boceto) return puedeBoceto ? { ruta: rutaConfirmacionBoceto(p.id), accion: "Abrir boceto" } : null;
    const paso = pasoParaRetomar(p);
    return puedeEditar ? { ruta: rutaPaso(p.id, paso), accion: etiquetaRetomar(p, paso) } : null;
  }

  return (
    <section className="mt-8 rounded-xl border border-acero-200 bg-superficie p-5" aria-label="Proyectos recientes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-acero-700">Proyectos recientes</h2>
        <Link to="/historial" className="text-xs font-medium text-solar-700 hover:underline">
          Ver todos
        </Link>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-600">No se pudieron cargar los proyectos.</p>
      ) : proyectos === null ? (
        <p className="mt-3 text-sm text-acero-500">Cargando proyectos…</p>
      ) : proyectos.length === 0 ? (
        <p className="mt-3 text-sm text-acero-500">Todavía no hay proyectos. Empieza con Nuevo proyecto.</p>
      ) : (
        <ul className="mt-3 divide-y divide-acero-100">
          {proyectos.map((p) => {
            const ir = destino(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  {ir ? (
                    <Link to={ir.ruta} className="font-medium text-acero-900 hover:text-solar-700 hover:underline">
                      {p.nombre}
                    </Link>
                  ) : (
                    <span className="font-medium text-acero-900">{p.nombre}</span>
                  )}
                  <p className="text-xs text-acero-500">
                    {p.cliente.nombre} · {fechaHora(p.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <EstadoProyectoBadge estado={p.estado} />
                  {ir && (
                    <Link to={ir.ruta} className="text-xs font-medium text-solar-700 hover:underline">
                      {ir.accion}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function InicioPage() {
  const { usuario, tienePermiso } = useAuth();
  const accesos = ACCESOS.filter((a) => tienePermiso(...a.permisos));
  const veProyectos = tienePermiso(Permiso.GENERAR_LAYOUT, Permiso.CARGAR_BOCETO, Permiso.HISTORIAL);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-acero-900">Hola, {usuario?.nombre.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-acero-500">Sistema de gestión y cotización de estructuras fotovoltaicas</p>

      {accesos.length > 0 && (
        <nav aria-label="Accesos rápidos" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accesos.map((a) => (
            <Link
              key={a.ruta}
              to={a.ruta}
              className="group rounded-xl border border-acero-200 bg-superficie p-5 transition hover:border-solar-400 hover:shadow-md"
            >
              <p className="text-base font-semibold text-acero-900 group-hover:text-solar-700">{a.titulo}</p>
              <p className="mt-1 text-sm text-acero-500">{a.descripcion}</p>
            </Link>
          ))}
        </nav>
      )}

      {veProyectos && <ProyectosRecientes />}

      <TableroIndicadores />
    </div>
  );
}
