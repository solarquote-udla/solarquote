/**
 * Catálogo de inversores de referencia — RF-08.
 *
 * Igual que los paneles: estos datos solo agilizan la captura en RF-02,
 * el formulario de equipo guarda su propia copia (snapshot), no una
 * referencia a este registro. Alta, edición y baja lógica.
 */

import { Fragment, useEffect, useState } from "react";

import { Campo } from "@/components/Campo";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { erroresDeCampo, mensajeDeError } from "@/services/api";
import { actualizarInversor, crearInversor, listarInversores, type DatosInversor } from "@/services/inversores";
import type { InversorCatalogo } from "@/types/api";
import { bordeCampo } from "@/utils/campo";

interface FormularioInversor {
  marca: string;
  modelo: string;
  potenciaKw: string;
  vmaxV: string;
  vminV: string;
  mppts: string;
  stringsPorMppt: string;
}

type CampoInversor = keyof FormularioInversor;
type ErroresInversor = Partial<Record<CampoInversor, string>>;

const FORM_VACIO: FormularioInversor = {
  marca: "",
  modelo: "",
  potenciaKw: "",
  vmaxV: "",
  vminV: "",
  mppts: "",
  stringsPorMppt: "",
};

/** Nombre del campo en la respuesta del backend (ver `loc`) → clave local. */
const CAMPO_API: Record<string, CampoInversor> = {
  marca: "marca",
  modelo: "modelo",
  potencia_kw: "potenciaKw",
  vmax_v: "vmaxV",
  vmin_v: "vminV",
  mppts: "mppts",
  strings_por_mppt: "stringsPorMppt",
};

/**
 * Errores de validación del backend (422) que sí vienen por campo, para
 * mostrarlos junto al campo igual que los del propio frontend. Los que no
 * traen campo (por ejemplo "ambos o ninguno", que queda en `loc: ["body"]`)
 * no caen aquí: se siguen mostrando como mensaje general con `mensajeDeError`.
 */
function erroresServidorPorCampo(error: unknown): ErroresInversor {
  const errores: ErroresInversor = {};
  for (const [campo, msg] of Object.entries(erroresDeCampo(error))) {
    const clave = CAMPO_API[campo];
    if (clave) errores[clave] = msg;
  }
  return errores;
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formularioDesdeInversor(inversor: InversorCatalogo): FormularioInversor {
  return {
    marca: inversor.marca,
    modelo: inversor.modelo,
    potenciaKw: String(inversor.potencia_kw),
    vmaxV: inversor.vmax_v == null ? "" : String(inversor.vmax_v),
    vminV: inversor.vmin_v == null ? "" : String(inversor.vmin_v),
    mppts: inversor.mppts == null ? "" : String(inversor.mppts),
    stringsPorMppt: inversor.strings_por_mppt == null ? "" : String(inversor.strings_por_mppt),
  };
}

/** Mismas reglas que `InversorCrear` en el backend. */
function erroresDe(form: FormularioInversor): ErroresInversor {
  const errores: ErroresInversor = {};
  if (form.marca.trim().replace(/\s+/g, " ").length < 2) errores.marca = "Debe tener al menos 2 caracteres.";
  if (form.modelo.trim().length < 1) errores.modelo = "El modelo es obligatorio.";

  const potencia = aNumero(form.potenciaKw);
  // NaN (texto no numérico) no es > 0 pero tampoco es <= 0: !(n > 0) sí lo atrapa.
  if (potencia === null || !(potencia > 0)) errores.potenciaKw = "Debe ser un número mayor a cero.";

  for (const campo of ["vmaxV", "vminV"] as const) {
    const valor = form[campo];
    if (valor.trim() === "") continue;
    const n = aNumero(valor);
    if (n === null || !(n > 0)) errores[campo] = "Debe ser un número mayor a cero, o dejarse en blanco.";
  }
  for (const campo of ["mppts", "stringsPorMppt"] as const) {
    const valor = form[campo];
    if (valor.trim() === "") continue;
    const n = aNumero(valor);
    if (n === null || !Number.isInteger(n) || n <= 0) {
      errores[campo] = "Debe ser un número entero mayor a cero, o dejarse en blanco.";
    }
  }

  // Igual que ConfiguracionEquipoGuardar: con uno solo no se pueden
  // calcular los límites de string.
  if (!errores.vmaxV && !errores.vminV) {
    const vmax = aNumero(form.vmaxV);
    const vmin = aNumero(form.vminV);
    if ((vmax === null) !== (vmin === null)) {
      errores.vmaxV = "Ingresa Vmax y Vmin juntos, o deja los dos en blanco.";
    } else if (vmax !== null && vmin !== null && vmax <= vmin) {
      errores.vmaxV = "Vmax debe ser mayor que Vmin.";
    }
  }

  return errores;
}

function datosDesdeFormulario(form: FormularioInversor): DatosInversor {
  return {
    marca: form.marca.trim().replace(/\s+/g, " "),
    modelo: form.modelo.trim(),
    potencia_kw: aNumero(form.potenciaKw) as number, // ya validado por erroresDe
    vmax_v: aNumero(form.vmaxV),
    vmin_v: aNumero(form.vminV),
    mppts: aNumero(form.mppts),
    strings_por_mppt: aNumero(form.stringsPorMppt),
  };
}

const CAMPO_BASE =
  "mt-1 w-full rounded-md border px-2 py-1.5 text-sm font-normal text-acero-900 placeholder:text-acero-300 focus:outline-none focus:ring-1";

const CAMPOS: { campo: CampoInversor; etiqueta: string; obligatorio?: boolean; modo?: "decimal" | "numeric" }[] = [
  { campo: "marca", etiqueta: "Marca", obligatorio: true },
  { campo: "modelo", etiqueta: "Modelo", obligatorio: true },
  { campo: "potenciaKw", etiqueta: "Potencia (kW)", obligatorio: true, modo: "decimal" },
  { campo: "vmaxV", etiqueta: "Vmax (V)", modo: "decimal" },
  { campo: "vminV", etiqueta: "Vmin (V)", modo: "decimal" },
  { campo: "mppts", etiqueta: "MPPTs", modo: "numeric" },
  { campo: "stringsPorMppt", etiqueta: "Strings por MPPT", modo: "numeric" },
];

function CamposInversor({
  form,
  errores,
  onChange,
}: {
  form: FormularioInversor;
  errores: ErroresInversor;
  onChange: (form: FormularioInversor) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CAMPOS.map(({ campo, etiqueta, obligatorio, modo }, i) => (
        <Campo key={campo} etiqueta={etiqueta} obligatorio={obligatorio} error={errores[campo]} className="text-sm">
          <input
            autoFocus={i === 0}
            inputMode={modo}
            placeholder={obligatorio ? undefined : "opcional"}
            value={form[campo]}
            onChange={(e) => onChange({ ...form, [campo]: e.target.value })}
            className={`${CAMPO_BASE} ${bordeCampo(errores[campo])}`}
          />
        </Campo>
      ))}
    </div>
  );
}

export function InversoresPage() {
  const [inversores, setInversores] = useState<InversorCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  // RF-08: búsqueda por marca o modelo (el catálogo es corto: se filtra en la pantalla)
  const [buscar, setBuscar] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [formNuevo, setFormNuevo] = useState<FormularioInversor>(FORM_VACIO);
  const [intentoCrear, setIntentoCrear] = useState(false);
  const [erroresServidorNuevo, setErroresServidorNuevo] = useState<ErroresInversor>({});
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formOriginalEdicion, setFormOriginalEdicion] = useState<FormularioInversor>(FORM_VACIO);
  const [formEdicion, setFormEdicion] = useState<FormularioInversor>(FORM_VACIO);
  const [intentoEditar, setIntentoEditar] = useState(false);
  const [erroresServidorEdicion, setErroresServidorEdicion] = useState<ErroresInversor>({});
  const [guardando, setGuardando] = useState(false);

  const unaVez = useAccionUnica();
  const nuevoSucio = mostrarForm && JSON.stringify(formNuevo) !== JSON.stringify(FORM_VACIO);
  const edicionSucia = editandoId !== null && JSON.stringify(formEdicion) !== JSON.stringify(formOriginalEdicion);
  useCambiosSinGuardar(nuevoSucio || edicionSucia);

  const erroresNuevo = { ...(intentoCrear ? erroresDe(formNuevo) : {}), ...erroresServidorNuevo };
  const erroresEdicion = { ...(intentoEditar ? erroresDe(formEdicion) : {}), ...erroresServidorEdicion };

  useEffect(() => {
    let cancelado = false;
    listarInversores(incluirInactivos)
      .then((lista) => {
        if (!cancelado) setInversores(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los inversores"));
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
    if (Object.keys(erroresDe(formNuevo)).length > 0) return;
    setError(null);
    setCreando(true);
    try {
      const creado = await crearInversor(datosDesdeFormulario(formNuevo));
      setInversores((lista) =>
        [...lista, creado].sort((a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo)),
      );
      setAviso(`${creado.marca} ${creado.modelo} agregado al catálogo.`);
      setMostrarForm(false);
      setFormNuevo(FORM_VACIO);
      setIntentoCrear(false);
    } catch (e) {
      const camposServidor = erroresServidorPorCampo(e);
      if (Object.keys(camposServidor).length > 0) {
        setErroresServidorNuevo(camposServidor);
      } else {
        setError(mensajeDeError(e, "No se pudo crear el inversor"));
      }
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(inversor: InversorCatalogo) {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos y editar otro inversor?")) {
      return;
    }
    setAviso(null);
    setEditandoId(inversor.id);
    setIntentoEditar(false);
    setErroresServidorEdicion({});
    const form = formularioDesdeInversor(inversor);
    setFormEdicion(form);
    setFormOriginalEdicion(form);
  }

  function cerrarEdicion() {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos?")) {
      return;
    }
    setEditandoId(null);
  }

  async function guardarEdicion(inversor: InversorCatalogo) {
    setIntentoEditar(true);
    if (Object.keys(erroresDe(formEdicion)).length > 0) return;
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarInversor(inversor.id, datosDesdeFormulario(formEdicion));
      setInversores((lista) => lista.map((i) => (i.id === inversor.id ? actualizado : i)));
      setAviso(`${actualizado.marca} ${actualizado.modelo} actualizado.`);
      setEditandoId(null);
    } catch (e) {
      const camposServidor = erroresServidorPorCampo(e);
      if (Object.keys(camposServidor).length > 0) {
        setErroresServidorEdicion(camposServidor);
      } else {
        setError(mensajeDeError(e, "No se pudo actualizar el inversor"));
      }
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(inversor: InversorCatalogo) {
    setError(null);
    try {
      const actualizado = await actualizarInversor(inversor.id, { activo: !inversor.activo });
      setInversores((lista) =>
        incluirInactivos || actualizado.activo
          ? lista.map((i) => (i.id === inversor.id ? actualizado : i))
          : lista.filter((i) => i.id !== inversor.id),
      );
      setAviso(actualizado.activo ? `${actualizado.marca} reactivado.` : `${actualizado.marca} desactivado.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cambiar el estado del inversor"));
    }
  }

  const texto = buscar.trim().toLowerCase();
  const visibles = texto
    ? inversores.filter((i) => `${i.marca} ${i.modelo}`.toLowerCase().includes(texto))
    : inversores;

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <span>Configuración</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Inversores</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Inversores</h1>
          <p className="mt-1 text-sm text-acero-500">
            Catálogo de referencia para configurar el equipo de un proyecto — RF-08
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (mostrarForm && nuevoSucio && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos?")) {
              return;
            }
            setMostrarForm((v) => !v);
            setFormNuevo(FORM_VACIO);
            setIntentoCrear(false);
            setErroresServidorNuevo({});
          }}
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600"
        >
          {mostrarForm ? "Cancelar" : "+ Nuevo inversor"}
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
          <CamposInversor
            form={formNuevo}
            errores={erroresNuevo}
            onChange={(f) => {
              setFormNuevo(f);
              setErroresServidorNuevo({});
            }}
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={creando}
              onClick={() => void unaVez("crear-inversor", crear)}
              className="rounded-md bg-solar-500 px-4 py-1.5 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
            >
              {creando ? "Creando…" : "Crear inversor"}
            </button>
          </div>
        </div>
      )}

      <input
        type="search"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por marca o modelo"
        aria-label="Buscar inversores"
        className="mt-4 w-full max-w-sm rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
      />

      <label className="mt-3 flex items-center gap-2 text-sm text-acero-600">
        <input
          type="checkbox"
          checked={incluirInactivos}
          onChange={(e) => {
            setCargando(true);
            setIncluirInactivos(e.target.checked);
          }}
          className="rounded border-acero-300"
        />
        Mostrar inversores desactivados
      </label>

      <div className="mt-2 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando inversores…</p>
        ) : inversores.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Todavía no hay inversores en el catálogo.</p>
        ) : visibles.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Ningún inversor coincide con la búsqueda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 font-medium">Modelo</th>
                <th className="px-4 py-3 text-right font-medium">Potencia</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {visibles.map((inversor) => (
                <Fragment key={inversor.id}>
                  <tr className={inversor.activo ? "hover:bg-acero-50" : "bg-acero-50/40"}>
                    <td className="px-4 py-3">
                      <span className={inversor.activo ? "font-medium text-acero-800" : "text-acero-400"}>
                        {inversor.marca}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-acero-600">{inversor.modelo}</td>
                    <td className="px-4 py-3 text-right text-acero-600">{inversor.potencia_kw} kW</td>
                    <td className="px-4 py-3">
                      {inversor.activo ? (
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
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => void unaVez(`activo-${inversor.id}`, () => alternarActivo(inversor))}
                          className="text-acero-500 hover:text-solar-700"
                        >
                          {inversor.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => (editandoId === inversor.id ? cerrarEdicion() : iniciarEdicion(inversor))}
                          className="font-medium text-solar-700 hover:underline"
                        >
                          {editandoId === inversor.id ? "Cerrar" : "Editar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editandoId === inversor.id && (
                    <tr>
                      <td colSpan={5} className="bg-acero-50/60 px-4 py-4">
                        <CamposInversor
                          form={formEdicion}
                          errores={erroresEdicion}
                          onChange={(f) => {
                            setFormEdicion(f);
                            setErroresServidorEdicion({});
                          }}
                        />
                        <div className="mt-3 flex justify-end gap-3 text-sm">
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
                            onClick={() => void unaVez(`editar-${inversor.id}`, () => guardarEdicion(inversor))}
                            className="rounded-md bg-solar-500 px-4 py-1.5 font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
                          >
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
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
