/**
 * Formulario de alta y edición de clientes (RF-12).
 *
 * Valida mientras se escribe con las mismas reglas que el backend
 * (utils/identificacion.ts), pero el backend sigue decidiendo: si
 * responde con error —por ejemplo, identificación duplicada (409)— se
 * muestra tal cual.
 *
 * En edición solo envía los campos que cambiaron (PATCH parcial).
 */

import { useState, type FormEvent, type ReactNode } from "react";

import { mensajeDeError } from "@/services/api";
import { actualizarCliente, crearCliente } from "@/services/clientes";
import {
  ETIQUETAS_TIPO_IDENTIFICACION,
  TipoIdentificacion,
  type Cliente,
  type ClienteActualizar,
  type ClienteCrear,
} from "@/types/api";
import { AYUDA_IDENTIFICACION, errorIdentificacion, esTelefonoValido } from "@/utils/identificacion";

const CAMPO =
  "mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal focus:outline-none focus:ring-1";
const CAMPO_OK = "border-acero-300 focus:border-solar-500 focus:ring-solar-500";
const CAMPO_ERROR = "border-red-400 focus:border-red-500 focus:ring-red-500";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  /** null = alta; un cliente = edición */
  cliente: Cliente | null;
  onGuardado: (cliente: Cliente) => void;
  onCancelar: () => void;
}

function desdeCliente(c: Cliente | null) {
  return {
    nombre: c?.nombre ?? "",
    tipo_identificacion: c?.tipo_identificacion ?? TipoIdentificacion.RUC,
    identificacion: c?.identificacion ?? "",
    empresa: c?.empresa ?? "",
    email: c?.email ?? "",
    telefono: c?.telefono ?? "",
    direccion: c?.direccion ?? "",
  };
}

type Formulario = ReturnType<typeof desdeCliente>;
type Errores = Partial<Record<keyof Formulario, string>>;

function validar(f: Formulario): Errores {
  const errores: Errores = {};
  if (f.nombre.trim().length < 3) errores.nombre = "El nombre debe tener al menos 3 caracteres.";

  const errorId = errorIdentificacion(f.tipo_identificacion, f.identificacion);
  if (errorId) errores.identificacion = errorId;

  if (f.email.trim() && !EMAIL.test(f.email.trim())) errores.email = "El correo no tiene un formato válido.";
  if (f.telefono.trim() && !esTelefonoValido(f.telefono.trim())) {
    errores.telefono = "Usa solo números, espacios, guiones o paréntesis (7 a 15 dígitos).";
  }
  return errores;
}

const opcional = (v: string) => v.trim() || null;

function aCrear(f: Formulario): ClienteCrear {
  return {
    nombre: f.nombre.trim(),
    tipo_identificacion: f.tipo_identificacion,
    identificacion: f.identificacion.trim(),
    empresa: opcional(f.empresa),
    email: opcional(f.email),
    telefono: opcional(f.telefono),
    direccion: opcional(f.direccion),
  };
}

/** Solo lo que cambió. Tipo e identificación viajan juntos para validarse entre sí. */
function aActualizar(original: Formulario, f: Formulario): ClienteActualizar {
  const completo = aCrear(f);
  const cambios: ClienteActualizar = {};
  if (f.nombre !== original.nombre) cambios.nombre = completo.nombre;
  if (f.tipo_identificacion !== original.tipo_identificacion || f.identificacion !== original.identificacion) {
    cambios.tipo_identificacion = completo.tipo_identificacion;
    cambios.identificacion = completo.identificacion;
  }
  if (f.empresa !== original.empresa) cambios.empresa = completo.empresa;
  if (f.email !== original.email) cambios.email = completo.email;
  if (f.telefono !== original.telefono) cambios.telefono = completo.telefono;
  if (f.direccion !== original.direccion) cambios.direccion = completo.direccion;
  return cambios;
}

function Campo({
  etiqueta,
  error,
  ayuda,
  ancho,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  ancho?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={["text-xs font-medium text-acero-600", ancho ? "sm:col-span-2" : ""].join(" ")}>
      {etiqueta}
      {children}
      {error ? (
        <span className="mt-1 block font-normal text-red-600">{error}</span>
      ) : (
        ayuda && <span className="mt-1 block font-normal text-acero-400">{ayuda}</span>
      )}
    </label>
  );
}

export function FormularioCliente({ cliente, onGuardado, onCancelar }: Props) {
  const original = desdeCliente(cliente);
  const [formulario, setFormulario] = useState<Formulario>(original);
  // Los errores de un campo se muestran recién cuando el usuario lo dejó o
  // intentó guardar: marcar en rojo mientras escribe la primera letra molesta.
  const [tocados, setTocados] = useState<Partial<Record<keyof Formulario, boolean>>>({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const errores = validar(formulario);
  const visible = (campo: keyof Formulario) => (tocados[campo] || intentoGuardar ? errores[campo] : undefined);
  const clase = (campo: keyof Formulario) => `${CAMPO} ${visible(campo) ? CAMPO_ERROR : CAMPO_OK}`;

  function actualizar(campo: keyof Formulario, valor: string) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  }

  const tocar = (campo: keyof Formulario) => () => setTocados((t) => ({ ...t, [campo]: true }));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setIntentoGuardar(true);
    setErrorServidor(null);
    if (Object.keys(errores).length > 0) return;

    setGuardando(true);
    try {
      if (cliente) {
        const cambios = aActualizar(original, formulario);
        onGuardado(Object.keys(cambios).length ? await actualizarCliente(cliente.id, cambios) : cliente);
      } else {
        onGuardado(await crearCliente(aCrear(formulario)));
      }
    } catch (e) {
      setErrorServidor(mensajeDeError(e, "No se pudo guardar el cliente"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} noValidate className="rounded-xl border border-acero-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-acero-700">
        {cliente ? `Editar cliente — ${cliente.nombre}` : "Nuevo cliente"}
      </h2>

      {errorServidor && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorServidor}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre o razón social" error={visible("nombre")} ancho>
          <input className={clase("nombre")} value={formulario.nombre} onChange={(e) => actualizar("nombre", e.target.value)} onBlur={tocar("nombre")} maxLength={150} />
        </Campo>

        <Campo etiqueta="Tipo de identificación">
          <select
            className={`${CAMPO} ${CAMPO_OK}`}
            value={formulario.tipo_identificacion}
            onChange={(e) => actualizar("tipo_identificacion", e.target.value)}
          >
            {Object.values(TipoIdentificacion).map((t) => (
              <option key={t} value={t}>
                {ETIQUETAS_TIPO_IDENTIFICACION[t]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Identificación" error={visible("identificacion")} ayuda={AYUDA_IDENTIFICACION[formulario.tipo_identificacion]}>
          <input className={clase("identificacion")} inputMode={formulario.tipo_identificacion === TipoIdentificacion.PASAPORTE ? "text" : "numeric"} value={formulario.identificacion} onChange={(e) => actualizar("identificacion", e.target.value)} onBlur={tocar("identificacion")} maxLength={20} />
        </Campo>

        <Campo etiqueta="Empresa" ayuda="Opcional">
          <input className={clase("empresa")} value={formulario.empresa} onChange={(e) => actualizar("empresa", e.target.value)} maxLength={150} />
        </Campo>

        <Campo etiqueta="Correo" error={visible("email")} ayuda="Opcional">
          <input className={clase("email")} type="email" value={formulario.email} onChange={(e) => actualizar("email", e.target.value)} onBlur={tocar("email")} maxLength={255} />
        </Campo>

        <Campo etiqueta="Teléfono" error={visible("telefono")} ayuda="Opcional. Ej. 099 123 4567">
          <input className={clase("telefono")} inputMode="tel" value={formulario.telefono} onChange={(e) => actualizar("telefono", e.target.value)} onBlur={tocar("telefono")} maxLength={30} />
        </Campo>

        <Campo etiqueta="Dirección" ayuda="Opcional">
          <input className={clase("direccion")} value={formulario.direccion} onChange={(e) => actualizar("direccion", e.target.value)} maxLength={255} />
        </Campo>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando ? "Guardando…" : cliente ? "Guardar cambios" : "Registrar cliente"}
        </button>
      </div>
    </form>
  );
}
