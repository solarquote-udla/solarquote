/**
 * Administración de precios de materiales — RF-09.
 *
 * Listado con el precio vigente de cada material; "Cambiar precio" cierra
 * el anterior y registra uno nuevo (nunca se sobrescribe, ver
 * app/services/material.py en el backend). "Ver historial" expande la
 * fila con los precios anteriores de ese material.
 */

import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { mensajeDeError } from "@/services/api";
import { actualizarPrecio, listarMateriales, obtenerHistorialPrecios } from "@/services/materiales";
import type { Material, PrecioMaterial } from "@/types/api";

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "numeric" });
}

/** Número válido y mayor que cero, con hasta dos decimales (lo que exige el backend). */
function precioValido(valor: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(valor.trim()) && Number(valor) > 0;
}

export function PreciosPage() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [historialAbiertoId, setHistorialAbiertoId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<PrecioMaterial[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    listarMateriales()
      .then(setMateriales)
      .catch((e) => setError(mensajeDeError(e, "No se pudieron cargar los materiales")))
      .finally(() => setCargando(false));
  }, []);

  function iniciarEdicion(material: Material) {
    setAviso(null);
    setEditandoId(material.id);
    setNuevoPrecio(material.precio_vigente ?? "");
  }

  async function guardarPrecio(material: Material) {
    if (!precioValido(nuevoPrecio)) {
      setError("El precio debe ser un número mayor a cero, con hasta dos decimales.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarPrecio(material.id, nuevoPrecio.trim());
      setMateriales((lista) => lista.map((m) => (m.id === material.id ? actualizado : m)));
      setAviso(`Precio de ${material.nombre} actualizado a $${actualizado.precio_vigente}.`);
      setEditandoId(null);
      if (historialAbiertoId === material.id) {
        setHistorial(await obtenerHistorialPrecios(material.id));
      }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo actualizar el precio"));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarHistorial(material: Material) {
    if (historialAbiertoId === material.id) {
      setHistorialAbiertoId(null);
      return;
    }
    setHistorialAbiertoId(material.id);
    setCargandoHistorial(true);
    try {
      setHistorial(await obtenerHistorialPrecios(material.id));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cargar el historial"));
      setHistorialAbiertoId(null);
    } finally {
      setCargandoHistorial(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <Link to="/administracion" className="hover:text-solar-700 hover:underline">
          Administración
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Precios</span>
      </nav>

      <div className="mt-2">
        <h1 className="text-2xl font-bold text-acero-900">Precios de materiales</h1>
        <p className="mt-1 text-sm text-acero-500">
          Cambiar un precio no afecta las cotizaciones ya emitidas — RF-09
        </p>
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

      <div className="mt-4 overflow-hidden rounded-xl border border-acero-200 bg-white">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando materiales…</p>
        ) : materiales.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Todavía no hay materiales en el catálogo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Material</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 text-right font-medium">Precio vigente</th>
                <th className="px-4 py-3 font-medium">Desde</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {materiales.map((material) => (
                <Fragment key={material.id}>
                  <tr className="hover:bg-acero-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-acero-800">{material.nombre}</p>
                      <p className="font-mono text-xs text-acero-400">{material.codigo}</p>
                    </td>
                    <td className="px-4 py-3 text-acero-500">{material.unidad}</td>
                    <td className="px-4 py-3 text-right">
                      {editandoId === material.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-acero-400">$</span>
                          <input
                            autoFocus
                            inputMode="decimal"
                            className="w-24 rounded-md border border-acero-300 px-2 py-1 text-right text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
                            value={nuevoPrecio}
                            onChange={(e) => setNuevoPrecio(e.target.value)}
                          />
                        </div>
                      ) : material.precio_vigente == null ? (
                        <span className="text-amber-700">Sin precio</span>
                      ) : (
                        <span className="font-medium text-acero-800">${material.precio_vigente}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-acero-500">
                      {material.vigente_desde ? formatearFecha(material.vigente_desde) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editandoId === material.id ? (
                        <div className="flex justify-end gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="text-acero-500 hover:text-acero-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={guardando}
                            onClick={() => guardarPrecio(material)}
                            className="font-medium text-solar-700 hover:underline disabled:opacity-50"
                          >
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => alternarHistorial(material)}
                            className="text-acero-500 hover:text-solar-700"
                          >
                            {historialAbiertoId === material.id ? "Ocultar historial" : "Ver historial"}
                          </button>
                          <button
                            type="button"
                            onClick={() => iniciarEdicion(material)}
                            className="font-medium text-solar-700 hover:underline"
                          >
                            Cambiar precio
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {historialAbiertoId === material.id && (
                    <tr>
                      <td colSpan={5} className="bg-acero-50/60 px-4 py-3">
                        {cargandoHistorial ? (
                          <p className="text-xs text-acero-500">Cargando historial…</p>
                        ) : historial.length === 0 ? (
                          <p className="text-xs text-acero-500">Sin precios registrados todavía.</p>
                        ) : (
                          <ul className="space-y-1 text-xs text-acero-600">
                            {historial.map((p) => (
                              <li key={p.id} className="flex gap-2">
                                <span className="font-medium">${p.precio}</span>
                                <span className="text-acero-400">
                                  {formatearFecha(p.vigente_desde)} —{" "}
                                  {p.vigente_hasta ? formatearFecha(p.vigente_hasta) : "vigente"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
