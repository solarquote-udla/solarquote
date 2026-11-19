/**
 * Catálogo de materiales — RF-09.
 *
 * Alta, edición (nombre/unidad) y baja lógica de los materiales. El código
 * es fijo una vez creado: lo usan las fórmulas f(L,A,B) del cálculo en
 * calc-service (ver app/services/calculo_materiales.py). El precio de cada
 * material se administra aparte, en Precios unitarios.
 */

import { useEffect, useState } from "react";

import { Campo } from "@/components/Campo";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { erroresDeCampo, mensajeDeError } from "@/services/api";
import { actualizarMaterial, crearMaterial, listarMateriales } from "@/services/materiales";
import type { Material } from "@/types/api";
import { bordeCampo } from "@/utils/campo";

const CODIGO_VALIDO = /^[A-Z0-9_]{2,30}$/;

function codigoValido(valor: string): boolean {
  return CODIGO_VALIDO.test(valor.trim().toUpperCase());
}

function nombreValido(valor: string): boolean {
  return valor.trim().replace(/\s+/g, " ").length >= 2;
}

type CampoMaterial = "codigo" | "nombre" | "unidad";
type ErroresMaterial = Partial<Record<CampoMaterial, string>>;
const CAMPOS_MATERIAL = new Set<CampoMaterial>(["codigo", "nombre", "unidad"]);

/** Igual que MaterialCrear en el backend (el código es obligatorio solo al crear). */
function erroresCrear(codigo: string, nombre: string): ErroresMaterial {
  const errores: ErroresMaterial = {};
  if (!codigoValido(codigo)) errores.codigo = "Debe tener de 2 a 30 caracteres: solo letras, números y guion bajo.";
  if (!nombreValido(nombre)) errores.nombre = "Debe tener al menos 2 caracteres.";
  return errores;
}

/** Igual que MaterialActualizar: el código no se puede cambiar, así que no se valida aquí. */
function erroresEditar(nombre: string, unidad: string): ErroresMaterial {
  const errores: ErroresMaterial = {};
  if (!nombreValido(nombre)) errores.nombre = "Debe tener al menos 2 caracteres.";
  if (unidad.trim() === "") errores.unidad = "No puede quedar en blanco.";
  return errores;
}

/** Errores del backend (422, por `loc`) que caen en un campo de este formulario. */
function erroresServidorPorCampo(error: unknown): ErroresMaterial {
  const errores: ErroresMaterial = {};
  for (const [campo, msg] of Object.entries(erroresDeCampo(error))) {
    if (CAMPOS_MATERIAL.has(campo as CampoMaterial)) errores[campo as CampoMaterial] = msg;
  }
  return errores;
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
  const [intentoCrear, setIntentoCrear] = useState(false);
  const [erroresServidorNuevo, setErroresServidorNuevo] = useState<ErroresMaterial>({});
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreOriginal, setNombreOriginal] = useState("");
  const [unidadOriginal, setUnidadOriginal] = useState("");
  const [nombreEditado, setNombreEditado] = useState("");
  const [unidadEditada, setUnidadEditada] = useState("");
  const [intentoEditar, setIntentoEditar] = useState(false);
  const [erroresServidorEdicion, setErroresServidorEdicion] = useState<ErroresMaterial>({});
  const [guardando, setGuardando] = useState(false);

  const unaVez = useAccionUnica();
  const nuevoSucio = mostrarForm && (nuevoCodigo.trim() !== "" || nuevoNombre.trim() !== "");
  const edicionSucia =
    editandoId !== null && (nombreEditado !== nombreOriginal || unidadEditada !== unidadOriginal);
  useCambiosSinGuardar(nuevoSucio || edicionSucia);

  const erroresNuevo = { ...(intentoCrear ? erroresCrear(nuevoCodigo, nuevoNombre) : {}), ...erroresServidorNuevo };
  const erroresEdicion = {
    ...(intentoEditar ? erroresEditar(nombreEditado, unidadEditada) : {}),
    ...erroresServidorEdicion,
  };

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
    setIntentoCrear(true);
    if (Object.keys(erroresCrear(nuevoCodigo, nuevoNombre)).length > 0) return;
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
      setIntentoCrear(false);
    } catch (e) {
      const campos = erroresServidorPorCampo(e);
      if (Object.keys(campos).length > 0) {
        setErroresServidorNuevo(campos);
      } else {
        setError(mensajeDeError(e, "No se pudo crear el material"));
      }
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(material: Material) {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos y editar otro material?")) {
      return;
    }
    setAviso(null);
    setEditandoId(material.id);
    setIntentoEditar(false);
    setErroresServidorEdicion({});
    setNombreEditado(material.nombre);
    setUnidadEditada(material.unidad);
    setNombreOriginal(material.nombre);
    setUnidadOriginal(material.unidad);
  }

  function cerrarEdicion() {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos?")) {
      return;
    }
    setEditandoId(null);
  }

  async function guardarEdicion(material: Material) {
    setIntentoEditar(true);
    if (Object.keys(erroresEditar(nombreEditado, unidadEditada)).length > 0) return;
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarMaterial(material.id, {
        nombre: nombreEditado.trim().replace(/\s+/g, " "),
        unidad: unidadEditada.trim(),
      });
      setMateriales((lista) => lista.map((m) => (m.id === material.id ? actualizado : m)));
      setAviso(`${actualizado.nombre} actualizado.`);
      setEditandoId(null);
    } catch (e) {
      const campos = erroresServidorPorCampo(e);
      if (Object.keys(campos).length > 0) {
        setErroresServidorEdicion(campos);
      } else {
        setError(mensajeDeError(e, "No se pudo actualizar el material"));
      }
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(material: Material) {
    if (
      material.activo &&
      !window.confirm(`¿Desactivar ${material.nombre}? Deja de estar disponible para cotizaciones nuevas.`)
    ) {
      return;
    }
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
        <span>Configuración</span>
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
          onClick={() => {
            if (mostrarForm && nuevoSucio && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos?")) {
              return;
            }
            setMostrarForm((v) => !v);
            setNuevoCodigo("");
            setNuevoNombre("");
            setNuevaUnidad("unidad");
            setIntentoCrear(false);
            setErroresServidorNuevo({});
          }}
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600"
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
        <div className="mt-4 rounded-xl border border-acero-200 bg-superficie p-5">
          <p className="text-xs text-acero-500">
            Un código nuevo no entra al cálculo hasta que alguien lo agregue a las fórmulas f(L,A,B) en
            calc-service.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Código" obligatorio error={erroresNuevo.codigo} className="text-sm">
              <input
                autoFocus
                value={nuevoCodigo}
                onChange={(e) => {
                  setNuevoCodigo(e.target.value.toUpperCase());
                  setErroresServidorNuevo({});
                }}
                placeholder="VAR1650"
                className={`mt-1 w-full rounded-md border px-2 py-1.5 font-mono text-sm uppercase placeholder:text-acero-300 focus:outline-none focus:ring-1 ${bordeCampo(erroresNuevo.codigo)}`}
              />
            </Campo>
            <Campo etiqueta="Nombre" obligatorio error={erroresNuevo.nombre} className="text-sm">
              <input
                value={nuevoNombre}
                onChange={(e) => {
                  setNuevoNombre(e.target.value);
                  setErroresServidorNuevo({});
                }}
                className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${bordeCampo(erroresNuevo.nombre)}`}
              />
            </Campo>
            <Campo etiqueta="Unidad" error={erroresNuevo.unidad} className="text-sm">
              <input
                value={nuevaUnidad}
                onChange={(e) => {
                  setNuevaUnidad(e.target.value);
                  setErroresServidorNuevo({});
                }}
                className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 ${bordeCampo(erroresNuevo.unidad)}`}
              />
            </Campo>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={creando}
              onClick={() => void unaVez("crear-material", crear)}
              className="rounded-md bg-solar-500 px-4 py-1.5 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
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

      <div className="mt-2 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
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
                      <Campo etiqueta="Nombre" error={erroresEdicion.nombre} className="text-sm">
                        <input
                          autoFocus
                          value={nombreEditado}
                          onChange={(e) => {
                            setNombreEditado(e.target.value);
                            setErroresServidorEdicion({});
                          }}
                          className={`mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${bordeCampo(erroresEdicion.nombre)}`}
                        />
                      </Campo>
                    ) : (
                      <span className={material.activo ? "font-medium text-acero-800" : "text-acero-400"}>
                        {material.nombre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-acero-500">
                    {editandoId === material.id ? (
                      <Campo etiqueta="Unidad" error={erroresEdicion.unidad} className="text-sm">
                        <input
                          value={unidadEditada}
                          onChange={(e) => {
                            setUnidadEditada(e.target.value);
                            setErroresServidorEdicion({});
                          }}
                          className={`mt-1 w-20 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${bordeCampo(erroresEdicion.unidad)}`}
                        />
                      </Campo>
                    ) : (
                      material.unidad
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {material.activo ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded-full bg-acero-200 px-2 py-0.5 text-xs font-medium text-acero-600">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoId === material.id ? (
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={cerrarEdicion}
                          className="text-acero-500 hover:text-acero-700"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void unaVez(`editar-${material.id}`, () => guardarEdicion(material))}
                          className="font-medium text-solar-700 hover:underline disabled:opacity-50"
                        >
                          {guardando ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => void unaVez(`activo-${material.id}`, () => alternarActivo(material))}
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
