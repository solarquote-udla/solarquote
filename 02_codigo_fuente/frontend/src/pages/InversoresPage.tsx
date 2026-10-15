/**
 * Catálogo de inversores de referencia — RF-08.
 *
 * Igual que los paneles: estos datos solo agilizan la captura en RF-02,
 * el formulario de equipo guarda su propia copia (snapshot), no una
 * referencia a este registro. Alta, edición y baja lógica.
 */

import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { mensajeDeError } from "@/services/api";
import { actualizarInversor, crearInversor, listarInversores, type DatosInversor } from "@/services/inversores";
import type { InversorCatalogo } from "@/types/api";

interface FormularioInversor {
  marca: string;
  modelo: string;
  potenciaKw: string;
  vmaxV: string;
  vminV: string;
  mppts: string;
  stringsPorMppt: string;
}

const FORM_VACIO: FormularioInversor = {
  marca: "",
  modelo: "",
  potenciaKw: "",
  vmaxV: "",
  vminV: "",
  mppts: "",
  stringsPorMppt: "",
};

/** Número positivo opcional: "" o un valor en blanco se guarda como null. */
function numeroOpcional(valor: string): number | null {
  const limpio = valor.trim();
  return limpio === "" ? null : Number(limpio);
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

function erroresDe(form: FormularioInversor): string | null {
  if (form.marca.trim().replace(/\s+/g, " ").length < 2) return "La marca debe tener al menos 2 caracteres.";
  if (form.modelo.trim().length < 1) return "El modelo es obligatorio.";
  const potencia = Number(form.potenciaKw.trim());
  if (!Number.isFinite(potencia) || potencia <= 0) return "La potencia debe ser un número mayor a cero.";
  for (const [campo, etiqueta] of [
    [form.vmaxV, "Vmax"],
    [form.vminV, "Vmin"],
    [form.mppts, "MPPTs"],
    [form.stringsPorMppt, "Strings por MPPT"],
  ] as const) {
    if (campo.trim() === "") continue;
    const n = Number(campo.trim());
    if (!Number.isFinite(n) || n <= 0) return `${etiqueta} debe ser un número mayor a cero, o dejarse en blanco.`;
  }
  return null;
}

function datosDesdeFormulario(form: FormularioInversor): DatosInversor {
  return {
    marca: form.marca.trim().replace(/\s+/g, " "),
    modelo: form.modelo.trim(),
    potencia_kw: Number(form.potenciaKw.trim()),
    vmax_v: numeroOpcional(form.vmaxV),
    vmin_v: numeroOpcional(form.vminV),
    mppts: numeroOpcional(form.mppts),
    strings_por_mppt: numeroOpcional(form.stringsPorMppt),
  };
}

function CamposInversor({
  form,
  onChange,
}: {
  form: FormularioInversor;
  onChange: (form: FormularioInversor) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Marca</span>
        <input
          autoFocus
          value={form.marca}
          onChange={(e) => onChange({ ...form, marca: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Modelo</span>
        <input
          value={form.modelo}
          onChange={(e) => onChange({ ...form, modelo: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Potencia (kW)</span>
        <input
          inputMode="decimal"
          value={form.potenciaKw}
          onChange={(e) => onChange({ ...form, potenciaKw: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Vmax (V)</span>
        <input
          inputMode="decimal"
          placeholder="opcional"
          value={form.vmaxV}
          onChange={(e) => onChange({ ...form, vmaxV: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm placeholder:text-acero-300 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Vmin (V)</span>
        <input
          inputMode="decimal"
          placeholder="opcional"
          value={form.vminV}
          onChange={(e) => onChange({ ...form, vminV: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm placeholder:text-acero-300 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">MPPTs</span>
        <input
          inputMode="numeric"
          placeholder="opcional"
          value={form.mppts}
          onChange={(e) => onChange({ ...form, mppts: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm placeholder:text-acero-300 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-acero-600">Strings por MPPT</span>
        <input
          inputMode="numeric"
          placeholder="opcional"
          value={form.stringsPorMppt}
          onChange={(e) => onChange({ ...form, stringsPorMppt: e.target.value })}
          className="w-full rounded-md border border-acero-300 px-2 py-1.5 text-sm placeholder:text-acero-300 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500"
        />
      </label>
    </div>
  );
}

export function InversoresPage() {
  const [inversores, setInversores] = useState<InversorCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [formNuevo, setFormNuevo] = useState<FormularioInversor>(FORM_VACIO);
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormularioInversor>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

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
    const problema = erroresDe(formNuevo);
    if (problema) {
      setError(problema);
      return;
    }
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
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo crear el inversor"));
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(inversor: InversorCatalogo) {
    setAviso(null);
    setEditandoId(inversor.id);
    setFormEdicion(formularioDesdeInversor(inversor));
  }

  async function guardarEdicion(inversor: InversorCatalogo) {
    const problema = erroresDe(formEdicion);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarInversor(inversor.id, datosDesdeFormulario(formEdicion));
      setInversores((lista) => lista.map((i) => (i.id === inversor.id ? actualizado : i)));
      setAviso(`${actualizado.marca} ${actualizado.modelo} actualizado.`);
      setEditandoId(null);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo actualizar el inversor"));
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

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <Link to="/configuracion/materiales" className="hover:text-solar-700 hover:underline">
          Configuración
        </Link>
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
            setMostrarForm((v) => !v);
            setFormNuevo(FORM_VACIO);
          }}
          className="rounded-lg bg-solar-600 px-4 py-2 text-sm font-medium text-white hover:bg-solar-700"
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
        <div className="mt-4 rounded-xl border border-acero-200 bg-white p-5">
          <CamposInversor form={formNuevo} onChange={setFormNuevo} />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={creando}
              onClick={crear}
              className="rounded-md bg-solar-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-solar-700 disabled:opacity-50"
            >
              {creando ? "Creando…" : "Crear inversor"}
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
        Mostrar inversores desactivados
      </label>

      <div className="mt-2 overflow-hidden rounded-xl border border-acero-200 bg-white">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando inversores…</p>
        ) : inversores.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Todavía no hay inversores en el catálogo.</p>
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
              {inversores.map((inversor) => (
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
                        <span className="text-green-700">Activo</span>
                      ) : (
                        <span className="text-acero-400">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => alternarActivo(inversor)}
                          className="text-acero-500 hover:text-solar-700"
                        >
                          {inversor.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            editandoId === inversor.id ? setEditandoId(null) : iniciarEdicion(inversor)
                          }
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
                        <CamposInversor form={formEdicion} onChange={setFormEdicion} />
                        <div className="mt-3 flex justify-end gap-3 text-sm">
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
                            onClick={() => guardarEdicion(inversor)}
                            className="rounded-md bg-solar-600 px-4 py-1.5 font-medium text-white hover:bg-solar-700 disabled:opacity-50"
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
