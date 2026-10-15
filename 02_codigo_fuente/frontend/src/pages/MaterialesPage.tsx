/**
 * Catálogo de materiales — RF-09.
 *
 * Alta, edición (nombre/unidad) y baja lógica de los materiales. El código
 * es fijo una vez creado: lo usan las fórmulas f(L,A,B) del cálculo en
 * calc-service (ver app/services/calculo_materiales.py). El precio de cada
 * material se administra aparte, en Precios unitarios.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { mensajeDeError } from "@/services/api";
import { actualizarMaterial, crearMaterial, listarMateriales } from "@/services/materiales";
import type { Material } from "@/types/api";

const CODIGO_VALIDO = /^[A-Z0-9_]{2,30}$/;

function codigoValido(valor: string): boolean {
  return CODIGO_VALIDO.test(valor.trim().toUpperCase());
}

function nombreValido(valor: string): boolean {
  return valor.trim().replace(/\s+/g, " ").length >= 2;
}

export function MaterialesPage() {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaUnidad, setNuevaUnidad] = useState("unidad");
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [unidadEditada, setUnidadEditada] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarMateriales(incluirInactivos)
      .then((lista) => {
        if (!cancelado) setMateriales(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los materiales"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [incluirInactivos]);

  async function crear() {
    if (!codigoValido(nuevoCodigo)) {
      setError("El código debe tener de 2 a 30 caracteres: solo letras, números y guion bajo.");
      return;
    }
    if (!nombreValido(nuevoNombre)) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    setError(null);
    setCreando(true);
    try {
      const creado = await crearMaterial({
        codigo: nuevoCodigo.trim().toUpperCase(),
        nombre: nuevoNombre.trim().replace(/\s+/g, " "),
        unidad: nuevaUnidad.trim() || "unidad",
      });
      setMateriales((lista) => [...lista, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setAviso(`${creado.nombre} agregado al catálogo.`);
      setMostrarForm(false);
      setNuevoCodigo("");
      setNuevoNombre("");
      setNuevaUnidad("unidad");
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo crear el material"));
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(material: Material) {
    setAviso(null);
    setEditandoId(material.id);
    setNombreEditado(material.nombre);
    setUnidadEditada(material.unidad);
  }

  async function guardarEdicion(material: Material) {
    if (!nombreValido(nombreEditado)) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarMaterial(material.id, {
        nombre: nombreEditado.trim().replace(/\s+/g, " "),
        unidad: unidadEditada.trim() || material.unidad,
      });
      setMateriales((lista) => lista.map((m) => (m.id === material.id ? actualizado : m)));
      setAviso(`${actualizado.nombre} actualizado.`);
      setEditandoId(null);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo actualizar el material"));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(material: Material) {
    setError(null);
    try {
      const actualizado = await actualizarMaterial(material.id, { activo: !material.activo });
      setMateriales((lista) =>
        incluirInactivos || actualizado.activo
          ? lista.map((m) => (m.id === material.id ? actualizado : m))
          : lista.filter((m) => m.id !== material.id),
      );
      setAviso(actualizado.activo ? `${actualizado.nombre} reactivado.` : `${actualizado.nombre} desactivado.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cambiar el estado del material"));
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <Link to="/configuracion/precios" className="hover:text-solar-700 hover:underline">
          Configuración
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Materiales</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Materiales</h1>
          <p className="mt-1 text-sm text-acero-500">
            Catálogo usado por el cálculo — RF-09. El código no se puede cambiar una vez creado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className="rounded-lg bg-solar-600 px-4 py-2 text-sm font-medium text-white hover:bg-solar-700"
        >
          {mostrarForm ? "Cancelar" : "+ Nuevo material"}
        </button>
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

      {mostrarForm && (
        <div className="mt-4 rounded-xl border border-acero-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-acero-600">Código</span>
              <input
                autoFocus
                value={nuevoCodigo}
                onChange={(e) => setNuevoCodigo(e.target.value.toUpperCase())}
                placeholder="VAR1650"
                className="w-full rounded-md border border-acero-300 px-2 py-1.5 font-mono text-sm uppercase focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-acero-600">Nombre</span>
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-acero-600">Unidad</span>
              <input
                value={nuevaUnidad}
                onChange={(e) => setNuevaUnidad(e.target.value)}
                className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={creando}
              onClick={crear}
              className="rounded-md bg-solar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-solar-700 disabled:opacity-50"
            >
              {creando ? "Creando…" : "Crear material"}
            </button>
          </div>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-acero-600">
        <input
          type="checkbox"
          checked={incluirInactivos}
          onChange={(e) => {
            setCargando(true);
            setIncluirInactivos(e.target.checked);
          }}
          className="rounded border-acero-300"
        />
        Mostrar materiales desactivados
      </label>

      <div className="mt-2 overflow-hidden rounded-xl border border-acero-200 bg-white">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando materiales…</p>
        ) : materiales.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Todavía no hay materiales en el catálogo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {materiales.map((material) => (
                <tr key={material.id} className={material.activo ? "hover:bg-acero-50" : "bg-acero-50/40"}>
                  <td className="px-4 py-3 font-mono text-xs text-acero-500">{material.codigo}</td>
                  <td className="px-4 py-3">
                    {editandoId === material.id ? (
                      <input
                        autoFocus
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        className="w-full rounded-md border border-acero-300 px-2 py-1 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
                      />
                    ) : (
                      <span className={material.activo ? "font-medium text-acero-800" : "text-acero-400"}>
                        {material.nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-acero-500">
                    {editandoId === material.id ? (
                      <input
                        value={unidadEditada}
                        onChange={(e) => setUnidadEditada(e.target.value)}
                        className="w-20 rounded-md border border-acero-300 px-2 py-1 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
                      />
                    ) : (
                      material.unidad
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {material.activo ? (
                      <span className="text-green-700">Activo</span>
                    ) : (
                      <span className="text-acero-400">Inactivo</span>
                    )}
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
                          onClick={() => guardarEdicion(material)}
                          className="font-medium text-solar-700 hover:underline disabled:opacity-50"
                        >
                          {guardando ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => alternarActivo(material)}
                          className="text-acero-500 hover:text-solar-700"
                        >
                          {material.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(material)}
                          className="font-medium text-solar-700 hover:underline"
                        >
                          Editar
                        </button>
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
