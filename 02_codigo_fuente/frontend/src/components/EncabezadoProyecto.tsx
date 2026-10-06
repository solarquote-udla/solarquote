/**
 * Encabezado común de las pestañas de un proyecto (terreno, equipo, layout).
 *
 * Además de la miga de pan, el título y las pestañas, permite corregir los
 * datos del proyecto sin salir de la pantalla. La latitud es el caso que
 * lo motivó: sin ella no se calcula la sombra entre filas (RF-02) ni entre
 * bloques (RF-03), y antes no había forma de cargarla después del alta.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { PestanasProyecto } from "@/components/PestanasProyecto";
import { mensajeDeError } from "@/services/api";
import { actualizarProyecto } from "@/services/proyectos";
import type { Proyecto, ProyectoActualizar } from "@/types/api";

const CAMPO =
  "mt-1 w-full rounded-lg border border-acero-300 px-3 py-2 text-sm font-normal focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

interface Props {
  proyecto: Proyecto;
  titulo: string;
  /** Recibe el proyecto actualizado, para que la página recargue lo que dependa de él */
  onActualizado: (proyecto: Proyecto) => void | Promise<void>;
}

const texto = (v: string | number | null) => (v == null ? "" : String(v));

function desdeProyecto(p: Proyecto) {
  return {
    nombre: p.nombre,
    ubicacion: texto(p.ubicacion),
    latitud: texto(p.latitud),
    longitud: texto(p.longitud),
    notas: texto(p.notas),
  };
}

type Formulario = ReturnType<typeof desdeProyecto>;

/** Número desde texto con coma o punto. Vacío → null; inválido → NaN. */
function numeroOpcional(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Solo los campos que cambiaron: así el PATCH no reescribe lo que el
 * usuario no tocó.
 */
function cambios(original: Formulario, f: Formulario): ProyectoActualizar | { error: string } {
  const latitud = numeroOpcional(f.latitud);
  const longitud = numeroOpcional(f.longitud);
  if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
    return { error: "Latitud y longitud deben ser números en grados decimales (ej. 0.3517)." };
  }
  if (f.nombre.trim().length < 3) {
    return { error: "El nombre debe tener al menos 3 caracteres." };
  }

  const datos: ProyectoActualizar = {};
  if (f.nombre !== original.nombre) datos.nombre = f.nombre.trim();
  if (f.ubicacion !== original.ubicacion) datos.ubicacion = f.ubicacion.trim() || null;
  if (f.latitud !== original.latitud) datos.latitud = latitud;
  if (f.longitud !== original.longitud) datos.longitud = longitud;
  if (f.notas !== original.notas) datos.notas = f.notas.trim() || null;
  return datos;
}

function Etiqueta({ texto: t, children, ancho }: { texto: string; children: ReactNode; ancho?: boolean }) {
  return (
    <label className={["text-xs font-medium text-acero-600", ancho ? "sm:col-span-2" : ""].join(" ")}>
      {t}
      {children}
    </label>
  );
}

export function EncabezadoProyecto({ proyecto, titulo, onActualizado }: Props) {
  const [editando, setEditando] = useState(false);
  const [formulario, setFormulario] = useState<Formulario>(() => desdeProyecto(proyecto));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setFormulario(desdeProyecto(proyecto));
    setError(null);
    setEditando(true);
  }

  function actualizar(campo: keyof Formulario, valor: string) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);

    const datos = cambios(desdeProyecto(proyecto), formulario);
    if ("error" in datos) {
      setError(datos.error as string);
      return;
    }
    if (Object.keys(datos).length === 0) {
      setEditando(false);
      return;
    }

    setGuardando(true);
    let actualizado: Proyecto;
    try {
      actualizado = await actualizarProyecto(proyecto.id, datos);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudieron guardar los datos del proyecto"));
      setGuardando(false);
      return;
    }

    setEditando(false);
    try {
      // La página recarga lo que dependa del proyecto (cálculos, layout)
      await onActualizado(actualizado);
    } catch (e) {
      setError(mensajeDeError(e, "Los datos se guardaron, pero no se pudo refrescar la pantalla. Recárgala."));
      setEditando(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <nav className="text-sm text-acero-500">
        <Link to="/proyectos" className="hover:text-solar-700 hover:underline">
          Proyectos
        </Link>
        <span className="mx-2">/</span>
        <span className="text-acero-700">{proyecto.nombre}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-acero-900">{titulo}</h1>
        <EstadoProyectoBadge estado={proyecto.estado} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-acero-500">
        <span>
          {proyecto.cliente.nombre}
          {proyecto.ubicacion ? ` · ${proyecto.ubicacion}` : ""}
        </span>
        <span className={proyecto.latitud == null ? "text-amber-700" : ""}>
          {proyecto.latitud == null ? "Sin latitud" : `Lat. ${proyecto.latitud}`}
          {proyecto.longitud != null && ` · Long. ${proyecto.longitud}`}
        </span>
        {!editando && (
          <button type="button" onClick={abrir} className="font-medium text-solar-700 hover:underline">
            Editar datos
          </button>
        )}
      </div>

      {editando && (
        <form onSubmit={guardar} className="mt-4 rounded-xl border border-acero-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-acero-700">Datos del proyecto</h2>
          <p className="mt-1 text-xs text-acero-400">
            El cliente no se cambia aquí: un proyecto con cotizaciones debe conservar su cliente.
            Cambiar la latitud deja el layout desactualizado hasta volver a generarlo.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Etiqueta texto="Nombre" ancho>
              <input className={CAMPO} value={formulario.nombre} onChange={(e) => actualizar("nombre", e.target.value)} maxLength={150} />
            </Etiqueta>
            <Etiqueta texto="Ubicación" ancho>
              <input className={CAMPO} placeholder="Provincia, cantón, referencia" value={formulario.ubicacion} onChange={(e) => actualizar("ubicacion", e.target.value)} maxLength={255} />
            </Etiqueta>
            <Etiqueta texto="Latitud (grados decimales)">
              <input className={CAMPO} inputMode="decimal" placeholder="0.3517" value={formulario.latitud} onChange={(e) => actualizar("latitud", e.target.value)} />
            </Etiqueta>
            <Etiqueta texto="Longitud (grados decimales)">
              <input className={CAMPO} inputMode="decimal" placeholder="-78.1223" value={formulario.longitud} onChange={(e) => actualizar("longitud", e.target.value)} />
            </Etiqueta>
            <Etiqueta texto="Notas" ancho>
              <textarea className={CAMPO} rows={2} maxLength={500} value={formulario.notas} onChange={(e) => actualizar("notas", e.target.value)} />
            </Etiqueta>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      <PestanasProyecto proyectoId={proyecto.id} />
    </>
  );
}
