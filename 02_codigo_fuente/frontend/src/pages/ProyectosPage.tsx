/**
 * Listado y alta de proyectos.
 *
 * Punto de entrada al Módulo 1: desde aquí se abre el terreno de cada
 * proyecto. El alta necesita un cliente existente, que se elige del
 * listado de RF-12 (Administración → Clientes).
 */

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { mensajeDeError } from "@/services/api";
import { listarClientes } from "@/services/clientes";
import { crearProyecto, listarProyectos } from "@/services/proyectos";
import type { ClienteListado, Proyecto } from "@/types/api";

const CAMPO =
  "mt-1 w-full rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

const FORMULARIO_VACIO = {
  nombre: "",
  clienteId: "",
  ubicacion: "",
  latitud: "",
  longitud: "",
  notas: "",
};

/** Convierte un campo de texto opcional en número o null. */
function numeroOpcional(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  return limpio === "" ? null : Number(limpio);
}

export function ProyectosPage() {
  const navegar = useNavigate();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [clientes, setClientes] = useState<ClienteListado[] | null>(null);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

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

  function abrirFormulario() {
    setFormularioAbierto(true);
    setErrorFormulario(null);

    // Los clientes se piden al abrir, no al cargar la página: quien
    // solo viene a revisar proyectos no necesita la lista.
    if (clientes === null) {
      listarClientes()
        .then(setClientes)
        .catch((e) => {
          setClientes([]);
          setErrorClientes(mensajeDeError(e, "No se pudo obtener el listado de clientes"));
        });
    }
  }

  function actualizar(campo: keyof typeof FORMULARIO_VACIO, valor: string) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErrorFormulario(null);

    const latitud = numeroOpcional(formulario.latitud);
    const longitud = numeroOpcional(formulario.longitud);
    if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
      setErrorFormulario("Latitud y longitud deben ser números en grados decimales.");
      return;
    }

    setEnviando(true);
    try {
      const proyecto = await crearProyecto({
        nombre: formulario.nombre.trim(),
        cliente_id: Number(formulario.clienteId),
        ubicacion: formulario.ubicacion.trim() || null,
        latitud,
        longitud,
        notas: formulario.notas.trim() || null,
      });
      // El siguiente paso natural de un proyecto nuevo es su terreno
      navegar(`/proyectos/${proyecto.id}/terreno`);
    } catch (e) {
      setErrorFormulario(mensajeDeError(e, "No se pudo crear el proyecto"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Proyectos</h1>
          <p className="mt-1 text-sm text-acero-500">Módulo 1 — Layout solar</p>
        </div>
        {!formularioAbierto && (
          <button
            type="button"
            onClick={abrirFormulario}
            className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600"
          >
            Nuevo proyecto
          </button>
        )}
      </div>

      {/* ─── Alta ───────────────────────────────────────── */}
      {formularioAbierto && (
        <form
          onSubmit={enviar}
          className="mt-6 rounded-xl border border-acero-200 bg-white p-6"
        >
          <h2 className="text-sm font-semibold text-acero-700">Nuevo proyecto</h2>

          {errorClientes && (
            <div className="mt-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-800">
              {errorClientes}
              {import.meta.env.DEV && (
                <span className="mt-1 block text-xs">
                  Para probar en local:{" "}
                  <code className="rounded bg-white px-1">python -m scripts.datos_demo</code>
                </span>
              )}
            </div>
          )}

          {errorFormulario && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorFormulario}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-acero-700 sm:col-span-2">
              Nombre del proyecto
              <input
                className={CAMPO}
                value={formulario.nombre}
                onChange={(e) => actualizar("nombre", e.target.value)}
                minLength={3}
                maxLength={150}
                required
              />
            </label>

            <label className="text-sm font-medium text-acero-700 sm:col-span-2">
              Cliente
              <select
                className={CAMPO}
                value={formulario.clienteId}
                onChange={(e) => actualizar("clienteId", e.target.value)}
                required
                disabled={!clientes || clientes.length === 0}
              >
                <option value="">
                  {clientes === null
                    ? "Cargando clientes…"
                    : clientes.length === 0
                      ? "No hay clientes disponibles"
                      : "Selecciona un cliente"}
                </option>
                {clientes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {c.identificacion}
                  </option>
                ))}
              </select>
              {clientes?.length === 0 && !errorClientes && (
                <span className="mt-1 block text-xs font-normal text-acero-500">
                  <Link to="/administracion/clientes" className="font-medium text-solar-700 hover:underline">
                    Registra un cliente
                  </Link>{" "}
                  para poder crearle proyectos.
                </span>
              )}
            </label>

            <label className="text-sm font-medium text-acero-700 sm:col-span-2">
              Ubicación
              <input
                className={CAMPO}
                placeholder="Provincia, cantón, referencia"
                value={formulario.ubicacion}
                onChange={(e) => actualizar("ubicacion", e.target.value)}
                maxLength={255}
              />
            </label>

            <label className="text-sm font-medium text-acero-700">
              Latitud
              <input
                className={CAMPO}
                inputMode="decimal"
                placeholder="0.3517"
                value={formulario.latitud}
                onChange={(e) => actualizar("latitud", e.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-acero-700">
              Longitud
              <input
                className={CAMPO}
                inputMode="decimal"
                placeholder="-78.1223"
                value={formulario.longitud}
                onChange={(e) => actualizar("longitud", e.target.value)}
              />
            </label>

            <label className="text-sm font-medium text-acero-700 sm:col-span-2">
              Notas
              <textarea
                className={CAMPO}
                rows={2}
                maxLength={500}
                value={formulario.notas}
                onChange={(e) => actualizar("notas", e.target.value)}
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormularioAbierto(false);
                setFormulario(FORMULARIO_VACIO);
              }}
              className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando || !formulario.clienteId}
              className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Creando…" : "Crear y definir terreno"}
            </button>
          </div>
        </form>
      )}

      {/* ─── Listado ────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-xl border border-acero-200 bg-white">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando proyectos…</p>
        ) : errorCarga ? (
          <p className="p-6 text-sm text-red-600">{errorCarga}</p>
        ) : proyectos.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-acero-700">Todavía no hay proyectos</p>
            <p className="mt-1 text-sm text-acero-500">
              Crea el primero para definir su terreno y generar el layout.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Proyecto</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {proyectos.map((p) => (
                <tr key={p.id} className="hover:bg-acero-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-acero-800">{p.nombre}</p>
                    {p.ubicacion && <p className="text-xs text-acero-500">{p.ubicacion}</p>}
                  </td>
                  <td className="px-4 py-3 text-acero-600">{p.cliente.nombre}</td>
                  <td className="px-4 py-3">
                    <EstadoProyectoBadge estado={p.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/proyectos/${p.id}/terreno`}
                      className="text-sm font-medium text-solar-700 hover:underline"
                    >
                      {p.tiene_terreno ? "Ver terreno" : "Definir terreno"} →
                    </Link>
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
