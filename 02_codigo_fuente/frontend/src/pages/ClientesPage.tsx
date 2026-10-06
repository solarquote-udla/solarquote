/**
 * Administración de clientes instaladores — RF-12.
 *
 * Listado con búsqueda, alta, edición, baja lógica y reactivación. La
 * búsqueda la resuelve el backend (`?buscar=`), para que coincida con lo
 * que verían otros módulos que consulten la misma API.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { FormularioCliente } from "@/components/FormularioCliente";
import { mensajeDeError } from "@/services/api";
import { buscarClientes, darDeBajaCliente, reactivarCliente } from "@/services/clientes";
import { ETIQUETAS_TIPO_IDENTIFICACION, type Cliente } from "@/types/api";

/** Espera a que el usuario deje de escribir antes de consultar. */
const ESPERA_BUSQUEDA_MS = 300;

/** null = cerrado; "nuevo" = alta; un cliente = edición */
type Edicion = null | "nuevo" | Cliente;

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [buscar, setBuscar] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [edicion, setEdicion] = useState<Edicion>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState<number | null>(null);
  const [procesando, setProcesando] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    const temporizador = setTimeout(() => {
      setCargando(true);
      buscarClientes({ buscar, incluirInactivos })
        .then((lista) => {
          if (!cancelado) {
            setClientes(lista);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los clientes"));
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });
    }, ESPERA_BUSQUEDA_MS);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [buscar, incluirInactivos, recarga]);

  function alGuardar(cliente: Cliente) {
    const eraNuevo = edicion === "nuevo";
    setEdicion(null);
    setAviso(eraNuevo ? `Cliente ${cliente.nombre} registrado.` : `Cambios guardados en ${cliente.nombre}.`);
    setRecarga((n) => n + 1);
  }

  async function darDeBaja(cliente: Cliente) {
    setProcesando(cliente.id);
    setError(null);
    try {
      await darDeBajaCliente(cliente.id);
      setConfirmandoBaja(null);
      setAviso(`${cliente.nombre} fue dado de baja. Sus proyectos y cotizaciones se conservan.`);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo dar de baja al cliente"));
    } finally {
      setProcesando(null);
    }
  }

  async function reactivar(cliente: Cliente) {
    setProcesando(cliente.id);
    setError(null);
    try {
      await reactivarCliente(cliente.id);
      setAviso(`${cliente.nombre} está activo otra vez.`);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo reactivar al cliente"));
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="text-sm text-acero-500">
        <Link to="/administracion" className="hover:text-solar-700 hover:underline">
          Administración
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Clientes</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Clientes</h1>
          <p className="mt-1 text-sm text-acero-500">Instaladores a los que HEXtructure cotiza — RF-12</p>
        </div>
        {edicion === null && (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setEdicion("nuevo");
            }}
            className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600"
          >
            Nuevo cliente
          </button>
        )}
      </div>

      {(error || aviso) && (
        <div
          className={[
            "mt-4 rounded-lg border px-4 py-3 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800",
          ].join(" ")}
        >
          {error ?? aviso}
        </div>
      )}

      {edicion !== null && (
        <div className="mt-6">
          <FormularioCliente
            // La clave reinicia el formulario al cambiar de cliente
            key={edicion === "nuevo" ? "nuevo" : edicion.id}
            cliente={edicion === "nuevo" ? null : edicion}
            onGuardado={alGuardar}
            onCancelar={() => setEdicion(null)}
          />
        </div>
      )}

      {/* ─── Filtros ──────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <input
          type="search"
          className="w-full max-w-sm rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
          placeholder="Buscar por nombre, empresa o identificación"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          aria-label="Buscar clientes"
        />
        <label className="flex items-center gap-2 text-sm text-acero-600">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
            className="h-4 w-4 accent-solar-500"
          />
          Mostrar dados de baja
        </label>
      </div>

      {/* ─── Listado ──────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-acero-200 bg-white">
        {cargando && clientes.length === 0 ? (
          <p className="p-6 text-sm text-acero-500">Cargando clientes…</p>
        ) : clientes.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-acero-700">
              {buscar.trim() ? "Ningún cliente coincide con la búsqueda" : "Todavía no hay clientes"}
            </p>
            {!buscar.trim() && (
              <p className="mt-1 text-sm text-acero-500">Registra el primero para poder crearle proyectos.</p>
            )}
          </div>
        ) : (
          <table className={["w-full text-sm", cargando ? "opacity-60" : ""].join(" ")}>
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Identificación</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 text-right font-medium">Proyectos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {clientes.map((c) => (
                <tr key={c.id} className={c.activo ? "hover:bg-acero-50" : "bg-acero-50/60 text-acero-400"}>
                  <td className="px-4 py-3">
                    <p className={["font-medium", c.activo ? "text-acero-800" : ""].join(" ")}>
                      {c.nombre}
                      {!c.activo && (
                        <span className="ml-2 rounded-full bg-acero-200 px-2 py-0.5 text-xs font-medium text-acero-600">
                          De baja
                        </span>
                      )}
                    </p>
                    {c.empresa && <p className="text-xs text-acero-500">{c.empresa}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-acero-400">{ETIQUETAS_TIPO_IDENTIFICACION[c.tipo_identificacion]}</span>
                    <p className="font-mono text-xs">{c.identificacion}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.email && <p>{c.email}</p>}
                    {c.telefono && <p>{c.telefono}</p>}
                    {!c.email && !c.telefono && <span className="text-acero-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{c.total_proyectos}</td>
                  <td className="px-4 py-3 text-right">
                    {confirmandoBaja === c.id ? (
                      <div className="ml-auto max-w-xs text-left">
                        <p className="text-xs text-acero-700">
                          {c.total_proyectos > 0
                            ? `Tiene ${c.total_proyectos} proyecto(s): se conservan, pero no podrás crearle nuevos.`
                            : "No podrás crearle proyectos nuevos hasta reactivarlo."}
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" onClick={() => setConfirmandoBaja(null)} className="rounded-md border border-acero-300 px-2.5 py-1 text-xs text-acero-700 hover:bg-acero-100">
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={procesando === c.id}
                            onClick={() => darDeBaja(c)}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Dar de baja
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3 text-sm">
                        {c.activo ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setAviso(null);
                                setEdicion(c);
                              }}
                              className="font-medium text-solar-700 hover:underline"
                            >
                              Editar
                            </button>
                            <button type="button" onClick={() => setConfirmandoBaja(c.id)} className="text-acero-500 hover:text-red-600">
                              Dar de baja
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={procesando === c.id}
                            onClick={() => reactivar(c)}
                            className="font-medium text-solar-700 hover:underline disabled:opacity-50"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
