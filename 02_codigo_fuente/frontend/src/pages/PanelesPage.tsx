/**
 * Catálogo de paneles de referencia (RF-02).
 *
 * Igual que el de inversores: estos datos solo agilizan la captura en el
 * Paso 2, que guarda su propia copia del panel elegido. Alta, edición y
 * baja lógica, con el error de cada dato junto a su campo.
 */

import { Fragment, useEffect, useState } from "react";

import { Campo } from "@/components/Campo";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import { actualizarPanel, crearPanel, listarPaneles, type DatosPanel } from "@/services/paneles";
import type { PanelCatalogo } from "@/types/api";
import { filtrarPaneles } from "@/utils/buscarPanel";
import { bordeCampo } from "@/utils/campo";

const CAMPO_BASE =
  "mt-1 w-full rounded-md border px-2 py-1.5 text-sm font-normal text-acero-900 placeholder:text-acero-300 focus:outline-none focus:ring-1";

type CampoPanel = "marca" | "modelo" | "potencia" | "largo" | "ancho" | "voc" | "vmp";
type FormularioPanel = Record<CampoPanel, string>;
type ErroresPanel = Partial<Record<CampoPanel, string>>;

const FORM_VACIO: FormularioPanel = { marca: "", modelo: "", potencia: "", largo: "", ancho: "", voc: "", vmp: "" };

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formularioDesdePanel(p: PanelCatalogo): FormularioPanel {
  return {
    marca: p.marca,
    modelo: p.modelo,
    potencia: String(p.potencia_wp),
    largo: String(p.largo_mm),
    ancho: String(p.ancho_mm),
    voc: String(p.voc_v),
    vmp: String(p.vmp_v),
  };
}

/** Mismas reglas que `PanelCatalogoCrear` en el backend. */
function erroresDe(f: FormularioPanel): ErroresPanel {
  const errores: ErroresPanel = {};
  if (f.marca.trim().replace(/\s+/g, " ").length < 2) errores.marca = "Debe tener al menos 2 caracteres.";
  if (f.modelo.trim() === "") errores.modelo = "Escribe el modelo.";

  const rangos: [CampoPanel, number, string][] = [
    ["potencia", 1500, "Wp"],
    ["largo", 5000, "mm"],
    ["ancho", 5000, "mm"],
    ["voc", 200, "V"],
    ["vmp", 200, "V"],
  ];
  for (const [campo, maximo, unidad] of rangos) {
    const n = aNumero(f[campo]);
    if (n === null) errores[campo] = "Obligatorio.";
    else if (Number.isNaN(n)) errores[campo] = `Debe ser un número en ${unidad}.`;
    else if (n <= 0 || n > maximo) errores[campo] = `Debe ser mayor que 0 y hasta ${maximo} ${unidad}.`;
  }

  const largo = aNumero(f.largo);
  const ancho = aNumero(f.ancho);
  if (!errores.largo && !errores.ancho && largo !== null && ancho !== null && largo < ancho) {
    errores.largo = "El largo es el lado mayor: no puede ser menor que el ancho.";
  }
  const voc = aNumero(f.voc);
  const vmp = aNumero(f.vmp);
  if (!errores.voc && !errores.vmp && voc !== null && vmp !== null && voc <= vmp) {
    errores.voc = "El Voc debe ser mayor que el Vmp.";
  }
  return errores;
}

function datosDesdeFormulario(f: FormularioPanel): DatosPanel {
  // Ya validado por erroresDe
  return {
    marca: f.marca.trim().replace(/\s+/g, " "),
    modelo: f.modelo.trim(),
    potencia_wp: aNumero(f.potencia) as number,
    largo_mm: aNumero(f.largo) as number,
    ancho_mm: aNumero(f.ancho) as number,
    voc_v: aNumero(f.voc) as number,
    vmp_v: aNumero(f.vmp) as number,
  };
}

const CAMPOS: { campo: CampoPanel; etiqueta: string; decimal?: boolean }[] = [
  { campo: "marca", etiqueta: "Marca" },
  { campo: "modelo", etiqueta: "Modelo" },
  { campo: "potencia", etiqueta: "Potencia (Wp)", decimal: true },
  { campo: "largo", etiqueta: "Largo (mm)", decimal: true },
  { campo: "ancho", etiqueta: "Ancho (mm)", decimal: true },
  { campo: "voc", etiqueta: "Voc (V)", decimal: true },
  { campo: "vmp", etiqueta: "Vmp (V)", decimal: true },
];

function CamposPanel({
  form,
  errores,
  onChange,
}: {
  form: FormularioPanel;
  errores: ErroresPanel;
  onChange: (form: FormularioPanel) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {CAMPOS.map(({ campo, etiqueta, decimal }, i) => (
        <Campo key={campo} etiqueta={etiqueta} obligatorio error={errores[campo]} className="text-sm">
          <input
            autoFocus={i === 0}
            inputMode={decimal ? "decimal" : undefined}
            value={form[campo]}
            onChange={(e) => onChange({ ...form, [campo]: e.target.value })}
            className={`${CAMPO_BASE} ${bordeCampo(errores[campo])}`}
          />
        </Campo>
      ))}
    </div>
  );
}

export function PanelesPage() {
  const [paneles, setPaneles] = useState<PanelCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [buscar, setBuscar] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [formNuevo, setFormNuevo] = useState<FormularioPanel>(FORM_VACIO);
  const [intentoCrear, setIntentoCrear] = useState(false);
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formOriginalEdicion, setFormOriginalEdicion] = useState<FormularioPanel>(FORM_VACIO);
  const [formEdicion, setFormEdicion] = useState<FormularioPanel>(FORM_VACIO);
  const [intentoEditar, setIntentoEditar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const unaVez = useAccionUnica();
  const nuevoSucio = mostrarForm && JSON.stringify(formNuevo) !== JSON.stringify(FORM_VACIO);
  const edicionSucia = editandoId !== null && JSON.stringify(formEdicion) !== JSON.stringify(formOriginalEdicion);
  useCambiosSinGuardar(nuevoSucio || edicionSucia);

  const erroresNuevo = intentoCrear ? erroresDe(formNuevo) : {};
  const erroresEdicion = intentoEditar ? erroresDe(formEdicion) : {};

  useEffect(() => {
    let cancelado = false;
    listarPaneles(incluirInactivos)
      .then((lista) => {
        if (!cancelado) setPaneles(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudieron cargar los paneles"));
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
      const creado = await crearPanel(datosDesdeFormulario(formNuevo));
      setPaneles((lista) =>
        [...lista, creado].sort((a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo)),
      );
      setAviso(`${creado.marca} ${creado.modelo} agregado al catálogo.`);
      setMostrarForm(false);
      setFormNuevo(FORM_VACIO);
      setIntentoCrear(false);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo crear el panel"));
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(panel: PanelCatalogo) {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos y editar otro panel?")) {
      return;
    }
    setAviso(null);
    setEditandoId(panel.id);
    setIntentoEditar(false);
    const form = formularioDesdePanel(panel);
    setFormEdicion(form);
    setFormOriginalEdicion(form);
  }

  function cerrarEdicion() {
    if (edicionSucia && !window.confirm("El formulario tiene datos sin guardar. ¿Descartarlos?")) return;
    setEditandoId(null);
  }

  async function guardarEdicion(panel: PanelCatalogo) {
    setIntentoEditar(true);
    if (Object.keys(erroresDe(formEdicion)).length > 0) return;
    setError(null);
    setGuardando(true);
    try {
      const actualizado = await actualizarPanel(panel.id, datosDesdeFormulario(formEdicion));
      setPaneles((lista) => lista.map((p) => (p.id === panel.id ? actualizado : p)));
      setAviso(`${actualizado.marca} ${actualizado.modelo} actualizado.`);
      setEditandoId(null);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo actualizar el panel"));
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(panel: PanelCatalogo) {
    setError(null);
    try {
      const actualizado = await actualizarPanel(panel.id, { activo: !panel.activo });
      setPaneles((lista) =>
        incluirInactivos || actualizado.activo
          ? lista.map((p) => (p.id === panel.id ? actualizado : p))
          : lista.filter((p) => p.id !== panel.id),
      );
      setAviso(actualizado.activo ? `${actualizado.modelo} reactivado.` : `${actualizado.modelo} desactivado.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cambiar el estado del panel"));
    }
  }

  const visibles = filtrarPaneles(paneles, buscar);

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="text-sm text-acero-500">
        <span>Configuración</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Paneles</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-acero-900">Paneles</h1>
          <p className="mt-1 text-sm text-acero-500">Catálogo de referencia para el Paso 2 de cada proyecto (RF-02)</p>
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
          }}
          className="rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600"
        >
          {mostrarForm ? "Cancelar" : "+ Nuevo panel"}
        </button>
      </div>

      {(error || aviso) && (
        <div
          role={error ? "alert" : "status"}
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
          <CamposPanel form={formNuevo} errores={erroresNuevo} onChange={setFormNuevo} />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={creando}
              onClick={() => void unaVez("crear-panel", crear)}
              className="rounded-md bg-solar-500 px-4 py-1.5 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
            >
              {creando ? "Creando…" : "Crear panel"}
            </button>
          </div>
        </div>
      )}

      <input
        type="search"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por marca, modelo o potencia"
        aria-label="Buscar paneles"
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
        Mostrar paneles desactivados
      </label>

      <div className="mt-2 overflow-hidden rounded-xl border border-acero-200 bg-superficie">
        {cargando ? (
          <p className="p-6 text-sm text-acero-500">Cargando paneles…</p>
        ) : paneles.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Todavía no hay paneles en el catálogo.</p>
        ) : visibles.length === 0 ? (
          <p className="p-10 text-center text-sm text-acero-500">Ningún panel coincide con la búsqueda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-acero-50 text-left text-xs uppercase tracking-wide text-acero-500">
              <tr>
                <th className="px-4 py-3 font-medium">Marca</th>
                <th className="px-4 py-3 font-medium">Modelo</th>
                <th className="px-4 py-3 text-right font-medium">Potencia</th>
                <th className="px-4 py-3 text-right font-medium">Medidas</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-acero-100">
              {visibles.map((panel) => (
                <Fragment key={panel.id}>
                  <tr className={panel.activo ? "hover:bg-acero-50" : "bg-acero-50/40"}>
                    <td className="px-4 py-3">
                      <span className={panel.activo ? "font-medium text-acero-800" : "text-acero-400"}>{panel.marca}</span>
                    </td>
                    <td className="px-4 py-3 text-acero-600">{panel.modelo}</td>
                    <td className="px-4 py-3 text-right text-acero-600">{panel.potencia_wp} Wp</td>
                    <td className="px-4 py-3 text-right text-acero-600">
                      {panel.largo_mm} × {panel.ancho_mm} mm
                    </td>
                    <td className="px-4 py-3">
                      {panel.activo ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Activo</span>
                      ) : (
                        <span className="rounded-full bg-acero-200 px-2 py-0.5 text-xs font-medium text-acero-600">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => void unaVez(`activo-${panel.id}`, () => alternarActivo(panel))}
                          className="text-acero-500 hover:text-solar-700"
                        >
                          {panel.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => (editandoId === panel.id ? cerrarEdicion() : iniciarEdicion(panel))}
                          className="font-medium text-solar-700 hover:underline"
                        >
                          {editandoId === panel.id ? "Cerrar" : "Editar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editandoId === panel.id && (
                    <tr>
                      <td colSpan={6} className="bg-acero-50/60 px-4 py-4">
                        <CamposPanel form={formEdicion} errores={erroresEdicion} onChange={setFormEdicion} />
                        <div className="mt-3 flex justify-end gap-3 text-sm">
                          <button type="button" onClick={cerrarEdicion} className="text-acero-500 hover:text-acero-700">
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={guardando}
                            onClick={() => void unaVez(`editar-${panel.id}`, () => guardarEdicion(panel))}
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
