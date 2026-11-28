/**
 * Asistente, Paso 2 — Panel + Inversores (RF-02).
 *
 * Como en el prototipo: a la izquierda el panel (elegido del catálogo
 * con búsqueda, o ingreso manual) y a la derecha los inversores, cada uno
 * con su color (el mismo de sus bloques en el Paso 3). "Siguiente" guarda
 * si hay cambios y pasa al Paso 3.
 *
 * Revisión del 25 de noviembre (Lenin, Santi y Anita):
 * - el ángulo de montaje es el de la estructura (7,5°), no un campo libre;
 * - sin sol ni sombra ni el aviso del Voc;
 * - con la potencia objetivo se ve si los paneles caben en el terreno y
 *   la relación DC/AC con los inversores elegidos, con la cuenta de la
 *   sugerencia. Es una referencia: los inversores los decide la ingeniería
 *   del proyecto, así que nada de esto bloquea.
 *
 * Estas cifras se recalculan mientras se escribe con las mismas fórmulas
 * del backend (utils/inversores.ts); el backend las vuelve a calcular al
 * guardar y las usa en sus avisos y en el Paso 3.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { Campo } from "@/components/Campo";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { erroresDeCampo, mensajeDeError } from "@/services/api";
import { guardarEquipo, obtenerEquipo } from "@/services/equipo";
import { listarInversores } from "@/services/inversores";
import { listarPaneles } from "@/services/paneles";
import { obtenerProyecto } from "@/services/proyectos";
import { obtenerTerreno } from "@/services/terreno";
import {
  MAX_INVERSORES,
  type ConfiguracionEquipo,
  type ConfiguracionEquipoGuardar,
  type Inversor,
  type InversorCatalogo,
  type PanelCatalogo,
  type Proyecto,
} from "@/types/api";
import { filtrarPaneles } from "@/utils/buscarPanel";
import { bordeCampo } from "@/utils/campo";
import {
  RELACION_DC_AC_MAXIMA,
  analizarInversores,
  colorInversor,
  ocupacionTerreno,
  panelesParaPotencia,
} from "@/utils/inversores";

/** Ángulo de las aletas de los soportes A y V de HEXtructure (ficha Hex001). Igual que ANGULO_MONTAJE_HEXTRUCTURE. */
const ANGULO_MONTAJE = 7.5;

// Los campos numéricos se editan como texto: así el usuario puede borrar
// un valor o escribir "52,3" con coma sin que el input lo rechace a mitad.
const PANEL_VACIO = {
  panel_marca: "",
  panel_modelo: "",
  panel_potencia_wp: "",
  panel_largo_mm: "",
  panel_ancho_mm: "",
  panel_voc_v: "",
  panel_vmp_v: "",
};

type CampoPanel = keyof typeof PANEL_VACIO;

const INVERSOR_VACIO = {
  marca: "",
  modelo: "",
  potencia_kw: "",
  vmax_v: "",
  vmin_v: "",
  mppts: "",
  strings_por_mppt: "",
};

type FormInversor = typeof INVERSOR_VACIO;
type CampoInversor = keyof FormInversor;

type Formulario = typeof PANEL_VACIO & {
  potencia_objetivo_kwp: string;
  inversores: FormInversor[];
};

const FORMULARIO_VACIO: Formulario = { ...PANEL_VACIO, potencia_objetivo_kwp: "", inversores: [INVERSOR_VACIO] };

const CAMPO_BASE = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1";
const CAMPO = `${CAMPO_BASE} ${bordeCampo()}`;

const texto = (valor: number | null | undefined) => (valor == null ? "" : String(valor));

function inversorAFormulario(i: Inversor | InversorCatalogo): FormInversor {
  return {
    marca: i.marca,
    modelo: i.modelo,
    potencia_kw: texto(i.potencia_kw),
    vmax_v: texto(i.vmax_v),
    vmin_v: texto(i.vmin_v),
    mppts: texto(i.mppts),
    strings_por_mppt: texto(i.strings_por_mppt),
  };
}

function desdeConfiguracion(c: ConfiguracionEquipo | null): Formulario {
  if (!c) return FORMULARIO_VACIO;
  return {
    panel_marca: c.panel.marca,
    panel_modelo: c.panel.modelo,
    panel_potencia_wp: texto(c.panel.potencia_wp),
    panel_largo_mm: texto(c.panel.largo_mm),
    panel_ancho_mm: texto(c.panel.ancho_mm),
    panel_voc_v: texto(c.panel.voc_v),
    panel_vmp_v: texto(c.panel.vmp_v),
    potencia_objetivo_kwp: texto(c.potencia_objetivo_kwp),
    inversores: c.inversores.map(inversorAFormulario),
  };
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Errores por campo. Claves: los campos del panel, "potencia_objetivo_kwp" e "inversores.N.campo". */
type Errores = Record<string, string>;

/** Número obligatorio dentro de un rango, o el error del campo. */
function errorNumero(valor: string, minimoExclusivo: number, maximo: number, unidad: string): string | undefined {
  const n = aNumero(valor);
  if (n === null) return "Obligatorio.";
  if (Number.isNaN(n)) return `Debe ser un número en ${unidad}.`;
  if (!(n > minimoExclusivo) || n > maximo) return `Debe ser mayor que ${minimoExclusivo} y hasta ${maximo} ${unidad}.`;
  return undefined;
}

/** Número opcional mayor que cero (y entero si se pide), o el error del campo. */
function errorOpcional(valor: string, entero: boolean, maximo: number): string | undefined {
  const n = aNumero(valor);
  if (n === null) return undefined;
  if (Number.isNaN(n) || !(n > 0) || n > maximo) return `Debe ser un número mayor que 0 y hasta ${maximo}.`;
  if (entero && !Number.isInteger(n)) return "Debe ser un número entero.";
  return undefined;
}

/**
 * Valida el formulario con las mismas reglas que el backend
 * (schemas/equipo.py) y devuelve el error de cada campo, para mostrarlo
 * junto a él (revisión con la tutora del 16 de noviembre).
 */
function erroresDeFormulario(f: Formulario): Errores {
  const e: Errores = {};
  if (!f.panel_marca.trim()) e.panel_marca = "Escribe la marca.";
  if (!f.panel_modelo.trim()) e.panel_modelo = "Escribe el modelo.";
  const reglas: [CampoPanel, number, number, string][] = [
    ["panel_potencia_wp", 0, 1500, "Wp"],
    ["panel_largo_mm", 0, 5000, "mm"],
    ["panel_ancho_mm", 0, 5000, "mm"],
    ["panel_voc_v", 0, 200, "V"],
    ["panel_vmp_v", 0, 200, "V"],
  ];
  for (const [campo, minimo, maximo, unidad] of reglas) {
    const error = errorNumero(f[campo], minimo, maximo, unidad);
    if (error) e[campo] = error;
  }
  const largo = aNumero(f.panel_largo_mm);
  const ancho = aNumero(f.panel_ancho_mm);
  if (!e.panel_largo_mm && !e.panel_ancho_mm && largo !== null && ancho !== null && largo < ancho) {
    e.panel_ancho_mm = "El ancho no puede ser mayor que el largo: el largo es el lado mayor del panel.";
  }
  const voc = aNumero(f.panel_voc_v);
  const vmp = aNumero(f.panel_vmp_v);
  if (!e.panel_voc_v && !e.panel_vmp_v && voc !== null && vmp !== null && voc <= vmp) {
    e.panel_vmp_v = "El Vmp debe ser menor que el Voc. Revisa que no estén intercambiados.";
  }

  const objetivo = aNumero(f.potencia_objetivo_kwp);
  if (objetivo !== null && (Number.isNaN(objetivo) || !(objetivo > 0))) {
    e.potencia_objetivo_kwp = "Debe ser un número mayor que 0, o dejarse vacío.";
  }

  f.inversores.forEach((inv, i) => {
    const clave = (campo: CampoInversor) => `inversores.${i}.${campo}`;
    if (!inv.marca.trim()) e[clave("marca")] = "Escribe la marca.";
    if (!inv.modelo.trim()) e[clave("modelo")] = "Escribe el modelo.";
    const potencia = errorNumero(inv.potencia_kw, 0, 10000, "kW");
    if (potencia) e[clave("potencia_kw")] = potencia;
    for (const campo of ["vmax_v", "vmin_v"] as const) {
      const error = errorOpcional(inv[campo], false, 2000);
      if (error) e[clave(campo)] = error;
    }
    for (const campo of ["mppts", "strings_por_mppt"] as const) {
      const error = errorOpcional(inv[campo], true, 50);
      if (error) e[clave(campo)] = error;
    }
    const vmax = aNumero(inv.vmax_v);
    const vmin = aNumero(inv.vmin_v);
    if (!e[clave("vmax_v")] && !e[clave("vmin_v")]) {
      if ((vmax === null) !== (vmin === null)) {
        e[clave(vmax === null ? "vmax_v" : "vmin_v")] = "Ingresa los dos voltajes o ninguno.";
      } else if (vmax !== null && vmin !== null && vmax <= vmin) {
        e[clave("vmin_v")] = "Debe ser menor que el voltaje máximo.";
      }
    }
  });
  return e;
}

/** Del `loc` del backend (`panel.voc_v`) a la clave del formulario (`panel_voc_v`). */
function claveDelServidor(loc: string): string {
  return loc.startsWith("panel.") ? `panel_${loc.slice("panel.".length)}` : loc;
}

/** Cuerpo de la petición. Solo se llama con un formulario sin errores. */
function aPeticion(f: Formulario): ConfiguracionEquipoGuardar {
  const n = (valor: string) => aNumero(valor) as number;
  return {
    panel: {
      marca: f.panel_marca.trim(),
      modelo: f.panel_modelo.trim(),
      potencia_wp: n(f.panel_potencia_wp),
      largo_mm: n(f.panel_largo_mm),
      ancho_mm: n(f.panel_ancho_mm),
      voc_v: n(f.panel_voc_v),
      vmp_v: n(f.panel_vmp_v),
    },
    angulo_montaje: ANGULO_MONTAJE,
    inversores: f.inversores.map(
      (inv): Inversor => ({
        marca: inv.marca.trim(),
        modelo: inv.modelo.trim(),
        potencia_kw: n(inv.potencia_kw),
        vmax_v: aNumero(inv.vmax_v),
        vmin_v: aNumero(inv.vmin_v),
        mppts: aNumero(inv.mppts),
        strings_por_mppt: aNumero(inv.strings_por_mppt),
      }),
    ),
    potencia_objetivo_kwp: aNumero(f.potencia_objetivo_kwp),
  };
}

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

function Entrada({
  etiqueta,
  unidad,
  error,
  obligatorio,
  children,
}: {
  etiqueta: string;
  unidad?: string;
  error?: string;
  obligatorio?: boolean;
  children: ReactNode;
}) {
  return (
    <Campo
      etiqueta={
        <>
          {etiqueta}
          {unidad && <span className="ml-1 font-normal text-acero-400">({unidad})</span>}
        </>
      }
      obligatorio={obligatorio}
      error={error}
    >
      {children}
    </Campo>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-acero-500">{nombre}</dt>
      <dd className="text-right font-medium text-acero-800">{valor}</dd>
    </div>
  );
}

/** "2 inversores Huawei 160 kW" si son iguales; si no, solo la cantidad. */
function resumenInversores(inversores: FormInversor[]): string {
  const [primero] = inversores;
  if (!primero?.marca) return "";
  const descripcion = `${primero.marca} ${primero.potencia_kw || "?"} kW`;
  if (inversores.length === 1) return descripcion;
  const iguales = inversores.every((i) => i.marca === primero.marca && i.potencia_kw === primero.potencia_kw);
  return iguales ? `${inversores.length} inversores ${descripcion}` : `${inversores.length} inversores`;
}

const esVacio = (i: FormInversor) => JSON.stringify(i) === JSON.stringify(INVERSOR_VACIO);

export function EquipoPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const navegar = useNavigate();
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [guardado, setGuardado] = useState<ConfiguracionEquipo | null>(null);
  const [paneles, setPaneles] = useState<PanelCatalogo[]>([]);
  const [catalogoPanelesFallo, setCatalogoPanelesFallo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [catalogo, setCatalogo] = useState<InversorCatalogo[]>([]);
  // Área útil del terreno (Paso 1), para ver si la potencia objetivo cabe
  const [areaTerreno, setAreaTerreno] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO);
  const [presetAplicado, setPresetAplicado] = useState<PanelCatalogo | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errores por campo: los de la pantalla se muestran al dejar el campo o
  // al intentar guardar; los del servidor, hasta que se corrige el campo.
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<Errores>({});
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarEnFormulario = useCallback((c: ConfiguracionEquipo | null) => {
    setGuardado(c);
    setFormulario(desdeConfiguracion(c));
    setPresetAplicado(null);
  }, []);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    Promise.all([obtenerProyecto(proyectoId), obtenerEquipo(proyectoId)])
      .then(([p, c]) => {
        if (cancelado) return;
        setProyecto(p);
        cargarEnFormulario(c);
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar el proyecto"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    // Los catálogos solo ayudan a llenar: si no cargan, se escribe a mano
    listarPaneles()
      .then((lista) => {
        if (!cancelado) setPaneles(lista);
      })
      .catch(() => {
        if (!cancelado) setCatalogoPanelesFallo(true);
      });
    listarInversores()
      .then((lista) => {
        if (!cancelado) setCatalogo(lista);
      })
      .catch(() => undefined);
    obtenerTerreno(proyectoId)
      .then((t) => {
        if (!cancelado && t) setAreaTerreno(t.areas.area_util);
      })
      .catch(() => undefined);

    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId, cargarEnFormulario]);

  const hayCambios = useMemo(
    () => JSON.stringify(formulario) !== JSON.stringify(desdeConfiguracion(guardado)),
    [formulario, guardado],
  );

  // "Editar datos" del encabezado tiene su propio formulario
  const [encabezadoSucio, setEncabezadoSucio] = useState(false);
  // También la primera vez: sin configuración guardada, cualquier dato escrito se perdería
  const permitirSalida = useCambiosSinGuardar(hayCambios || encabezadoSucio);

  const unaVez = useAccionUnica();

  const errores = useMemo(() => erroresDeFormulario(formulario), [formulario]);
  /** Error a mostrar junto al campo: el de la pantalla si ya se tocó o se intentó guardar; si no, el del servidor. */
  const visible = (clave: string) =>
    (intentoGuardar || tocados.has(clave) ? errores[clave] : undefined) ?? erroresServidor[clave];
  const clase = (clave: string) => `mt-1 ${CAMPO_BASE} ${bordeCampo(visible(clave))}`;
  const tocar = (clave: string) => () => setTocados((t) => (t.has(clave) ? t : new Set(t).add(clave)));
  const limpiarServidor = (clave: string) =>
    setErroresServidor((e) => {
      if (!(clave in e)) return e;
      const resto = { ...e };
      delete resto[clave];
      return resto;
    });

  function actualizar(campo: CampoPanel | "potencia_objetivo_kwp", valor: string) {
    limpiarServidor(campo);
    setFormulario((f) => ({ ...f, [campo]: valor }));
    // Editar a mano un dato del panel deja de coincidir con la ficha citada
    if (campo.startsWith("panel_")) setPresetAplicado(null);
  }

  function actualizarInversor(indice: number, campo: CampoInversor, valor: string) {
    limpiarServidor(`inversores.${indice}.${campo}`);
    setFormulario((f) => ({
      ...f,
      inversores: f.inversores.map((inv, i) => (i === indice ? { ...inv, [campo]: valor } : inv)),
    }));
  }

  function elegirDelCatalogo(indice: number, id: string) {
    const elegido = catalogo.find((c) => String(c.id) === id);
    if (!elegido) return;
    setFormulario((f) => ({
      ...f,
      inversores: f.inversores.map((inv, i) => (i === indice ? inversorAFormulario(elegido) : inv)),
    }));
  }

  /** Agrega inversores copiando el último: lo común es repetir el mismo modelo. */
  function agregarInversores(cantidad = 1) {
    setFormulario((f) => {
      const ultimo = f.inversores[f.inversores.length - 1] ?? INVERSOR_VACIO;
      const nuevos = Array.from({ length: Math.min(cantidad, MAX_INVERSORES - f.inversores.length) }, () => ({ ...ultimo }));
      return { ...f, inversores: [...f.inversores, ...nuevos] };
    });
  }

  function quitarInversor(indice: number) {
    const inversor = formulario.inversores[indice];
    if (formulario.inversores.length <= 1) return;
    if (!esVacio(inversor) && !window.confirm(`¿Quitar el Inversor ${indice + 1}?`)) return;
    setFormulario((f) => ({ ...f, inversores: f.inversores.filter((_, i) => i !== indice) }));
  }

  function aplicarPreset(id: number) {
    const preset = paneles.find((p) => p.id === id);
    if (!preset) return;
    setFormulario((f) => ({
      ...f,
      panel_marca: preset.marca,
      panel_modelo: preset.modelo,
      panel_potencia_wp: texto(preset.potencia_wp),
      panel_largo_mm: texto(preset.largo_mm),
      panel_ancho_mm: texto(preset.ancho_mm),
      panel_voc_v: texto(preset.voc_v),
      panel_vmp_v: texto(preset.vmp_v),
    }));
    setPresetAplicado(preset);
  }

  /** Valida y guarda. Devuelve si quedó guardado. Lo usan el formulario y "Siguiente". */
  async function persistir(): Promise<boolean> {
    setError(null);
    setAviso(null);

    setIntentoGuardar(true);
    if (Object.keys(errores).length > 0) {
      setError("Revisa los campos marcados en rojo.");
      return false;
    }

    setGuardando(true);
    try {
      cargarEnFormulario(await guardarEquipo(proyectoId, aPeticion(formulario)));
      setErroresServidor({});
      setIntentoGuardar(false);
    } catch (e) {
      const porCampo = Object.fromEntries(
        Object.entries(erroresDeCampo(e)).map(([loc, mensaje]) => [claveDelServidor(loc), mensaje]),
      );
      setErroresServidor(porCampo);
      setError(
        Object.keys(porCampo).length > 0
          ? "Revisa los campos marcados en rojo."
          : mensajeDeError(e, "No se pudo guardar la configuración"),
      );
      return false;
    } finally {
      setGuardando(false);
    }
    // Ya está guardado: si refrescar el encabezado falla, no es un error de guardado
    try {
      // El estado del proyecto pudo avanzar (borrador → en diseño)
      setProyecto(await obtenerProyecto(proyectoId));
    } catch {
      // El encabezado queda con el estado anterior hasta recargar
    }
    return true;
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (await persistir()) setAviso("Configuración guardada.");
  }

  // ─── Render ──────────────────────────────────────────

  if (!idValido) {
    return <p className="text-sm text-red-600">El identificador del proyecto no es válido.</p>;
  }
  if (cargando) {
    return <p className="text-sm text-acero-500">Cargando proyecto…</p>;
  }
  if (errorCarga || !proyecto) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorCarga ?? "No se encontró el proyecto."}
        </p>
        <Link to="/historial" className="mt-4 inline-block text-sm text-solar-700 hover:underline">
          Volver al historial
        </Link>
      </div>
    );
  }

  const calculos = guardado?.calculos;
  const presetElegido = paneles.find(
    (p) =>
      p.marca === formulario.panel_marca.trim() &&
      p.modelo === formulario.panel_modelo.trim() &&
      String(p.potencia_wp) === formulario.panel_potencia_wp.trim(),
  );
  const encontrados = filtrarPaneles(paneles, busqueda);
  const largoMm = aNumero(formulario.panel_largo_mm);
  const anchoMm = aNumero(formulario.panel_ancho_mm);
  const inversores = formulario.inversores;

  // Potencia objetivo → paneles; con ellos, el terreno y los inversores
  const objetivoKwp = aNumero(formulario.potencia_objetivo_kwp);
  const potenciaPanel = aNumero(formulario.panel_potencia_wp);
  const panelesObjetivo =
    objetivoKwp && objetivoKwp > 0 && potenciaPanel && potenciaPanel > 0 ? panelesParaPotencia(objetivoKwp, potenciaPanel) : null;
  const ocupacion =
    panelesObjetivo && largoMm && anchoMm && areaTerreno ? ocupacionTerreno(panelesObjetivo, largoMm, anchoMm, areaTerreno) : null;
  const potencias = inversores.map((i) => aNumero(i.potencia_kw));
  const analisis =
    panelesObjetivo && potenciaPanel && potencias.every((p) => p !== null && p > 0)
      ? analizarInversores(
          panelesObjetivo,
          potenciaPanel,
          inversores.map((inv, k) => ({
            potenciaKw: potencias[k] as number,
            vmaxV: aNumero(inv.vmax_v),
            vminV: aNumero(inv.vmin_v),
            mppts: aNumero(inv.mppts),
            stringsPorMppt: aNumero(inv.strings_por_mppt),
          })),
          aNumero(formulario.panel_voc_v),
          aNumero(formulario.panel_vmp_v),
        )
      : null;
  // Paneles que le tocarían a cada inversor, en proporción a su potencia
  const sumaPotencias = analisis ? analisis.potenciaAcKw : null;
  const reparto = (indice: number) =>
    panelesObjetivo && sumaPotencias ? Math.round((panelesObjetivo * (potencias[indice] ?? 0)) / sumaPotencias) : null;

  const resumen =
    formulario.panel_marca && inversores[0]?.marca
      ? `${formulario.panel_marca} ${formulario.panel_potencia_wp || "?"} Wp · ${resumenInversores(inversores)}`
      : "Configura el panel y los inversores";

  /** "Siguiente": guarda solo si hay algo nuevo y devuelve si se puede continuar. */
  async function guardarSiHaceFalta(): Promise<boolean> {
    if (guardado && !hayCambios) return true;
    return persistir();
  }

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto
        paso={2}
        proyecto={proyecto}
        onCambiosSinGuardar={setEncabezadoSucio}
        onActualizado={async (p) => {
          setProyecto(p);
          // Los datos del proyecto pueden cambiar el terreno: se recalcula en el backend
          const actual = await obtenerEquipo(proyectoId);
          if (actual) setGuardado(actual);
        }}
      />

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unaVez("guardar", () => guardar(e));
        }}
        className="mt-6 grid gap-6 lg:grid-cols-2"
      >
        {/* ─── Potencia objetivo ─────────────────────────── */}
        {/* Separada de los inversores (Lenin, 16 nov): es la potencia de los
            paneles en kWp, no la de los inversores en kW. */}
        <section className="rounded-xl border border-acero-200 bg-superficie p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end gap-6">
            <div className="w-full max-w-xs">
              <Entrada etiqueta="Potencia objetivo del sistema" unidad="kWp de paneles, opcional" error={visible("potencia_objetivo_kwp")}>
                <input
                  className={clase("potencia_objetivo_kwp")}
                  inputMode="decimal"
                  placeholder="Ej. 316"
                  value={formulario.potencia_objetivo_kwp}
                  onChange={(e) => actualizar("potencia_objetivo_kwp", e.target.value)}
                  onBlur={tocar("potencia_objetivo_kwp")}
                />
              </Entrada>
            </div>
            <p className="max-w-xl text-xs text-acero-500">
              Es la potencia de los paneles (DC, en kWp) que pide el cliente. El Paso 3 la usa como capacidad deseada.
              Los inversores se miden aparte, en kW (AC).
            </p>
          </div>
        </section>

        {/* ─── Panel solar ──────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-sm font-semibold text-acero-900">Panel solar</h2>
            <p className="mt-3 text-xs font-semibold tracking-wider text-acero-400">CATÁLOGO DE PANELES</p>
            <input
              type="search"
              className={`mt-2 ${CAMPO}`}
              placeholder="Buscar por marca, modelo o potencia (ej. jinko 580)"
              aria-label="Buscar panel"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {catalogoPanelesFallo && (
              <p className="mt-2 text-xs text-amber-700">No se pudo cargar el catálogo de paneles. Ingresa los datos manualmente.</p>
            )}
            {!catalogoPanelesFallo && busqueda.trim() !== "" && encontrados.length === 0 && (
              <p className="mt-2 text-xs text-acero-500">
                Ningún panel coincide. Ingrésalo manualmente o agrégalo en Configuración, Paneles.
              </p>
            )}
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto" aria-label="Paneles del catálogo">
              {encontrados.map((p) => {
                const elegido = presetElegido?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => aplicarPreset(p.id)}
                      className={[
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition",
                        elegido ? "border-solar-500 bg-solar-50" : "border-acero-200 hover:border-acero-300",
                      ].join(" ")}
                      aria-pressed={elegido}
                    >
                      <span>
                        <span className={`block text-sm font-medium ${elegido ? "text-solar-700" : "text-acero-800"}`}>
                          {p.marca} {p.modelo}
                        </span>
                        <span className="block text-xs text-acero-500">
                          {p.potencia_wp} Wp · {p.largo_mm}×{p.ancho_mm} mm
                        </span>
                      </span>
                      <span
                        className={[
                          "h-5 w-5 shrink-0 rounded-full border-2",
                          elegido ? "border-solar-500 bg-solar-500" : "border-acero-300",
                        ].join(" ")}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPresetAplicado(null);
                    setFormulario((f) => ({ ...f, panel_marca: "", panel_modelo: "", panel_potencia_wp: "", panel_largo_mm: "", panel_ancho_mm: "", panel_voc_v: "", panel_vmp_v: "" }));
                  }}
                  className={[
                    "w-full rounded-lg border border-dashed px-4 py-2.5 text-left text-sm transition",
                    !presetElegido ? "border-solar-500 text-solar-700" : "border-acero-300 text-acero-500 hover:border-acero-400",
                  ].join(" ")}
                >
                  + Ingresar manualmente
                </button>
              </li>
            </ul>

            {presetAplicado && (
              <p className="mt-2 text-xs text-acero-500">
                Datos del catálogo de paneles. Si tu lote es de otra potencia, ajusta potencia, Voc y Vmp.
              </p>
            )}

            <p className="mt-5 text-xs font-semibold tracking-wider text-acero-400">ESPECIFICACIONES</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Entrada etiqueta="Marca" error={visible("panel_marca")} obligatorio>
                <input className={clase("panel_marca")} value={formulario.panel_marca} onChange={(e) => actualizar("panel_marca", e.target.value)} onBlur={tocar("panel_marca")} maxLength={80} />
              </Entrada>
              <Entrada etiqueta="Modelo" error={visible("panel_modelo")} obligatorio>
                <input className={clase("panel_modelo")} value={formulario.panel_modelo} onChange={(e) => actualizar("panel_modelo", e.target.value)} onBlur={tocar("panel_modelo")} maxLength={100} />
              </Entrada>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Entrada etiqueta="Potencia" unidad="Wp" error={visible("panel_potencia_wp")} obligatorio>
                <input className={clase("panel_potencia_wp")} inputMode="decimal" value={formulario.panel_potencia_wp} onChange={(e) => actualizar("panel_potencia_wp", e.target.value)} onBlur={tocar("panel_potencia_wp")} />
              </Entrada>
              <Entrada etiqueta="Largo" unidad="mm, dir. L" error={visible("panel_largo_mm")} obligatorio>
                <input className={clase("panel_largo_mm")} inputMode="decimal" value={formulario.panel_largo_mm} onChange={(e) => actualizar("panel_largo_mm", e.target.value)} onBlur={tocar("panel_largo_mm")} />
              </Entrada>
              <Entrada etiqueta="Ancho" unidad="mm, dir. A" error={visible("panel_ancho_mm")} obligatorio>
                <input className={clase("panel_ancho_mm")} inputMode="decimal" value={formulario.panel_ancho_mm} onChange={(e) => actualizar("panel_ancho_mm", e.target.value)} onBlur={tocar("panel_ancho_mm")} />
              </Entrada>
              <Entrada etiqueta="Voc" unidad="V" error={visible("panel_voc_v")} obligatorio>
                <input className={clase("panel_voc_v")} inputMode="decimal" value={formulario.panel_voc_v} onChange={(e) => actualizar("panel_voc_v", e.target.value)} onBlur={tocar("panel_voc_v")} />
              </Entrada>
              <Entrada etiqueta="Vmp" unidad="V" error={visible("panel_vmp_v")} obligatorio>
                <input className={clase("panel_vmp_v")} inputMode="decimal" value={formulario.panel_vmp_v} onChange={(e) => actualizar("panel_vmp_v", e.target.value)} onBlur={tocar("panel_vmp_v")} />
              </Entrada>
              <div>
                <p className="text-xs font-medium text-acero-600">Ángulo de montaje</p>
                <p className="mt-1 rounded-lg border border-acero-200 bg-acero-50 px-3 py-2 text-sm text-acero-800" aria-label="Ángulo de montaje">
                  {numero(ANGULO_MONTAJE, 1)}°
                </p>
                <p className="mt-1 text-xs text-acero-400">Aletas de los soportes A y V (ficha Hex001)</p>
              </div>
            </div>

            {largoMm && anchoMm && largoMm > 0 && anchoMm > 0 ? (
              <div className="mt-5 flex items-center gap-4 rounded-lg border border-acero-200 bg-acero-50 p-4">
                <svg viewBox={`0 0 ${anchoMm} ${largoMm}`} className="h-16 w-auto" aria-hidden>
                  <rect width={anchoMm} height={largoMm} className="fill-sky-700 stroke-sky-500" strokeWidth={anchoMm * 0.03} />
                  {[1, 2].map((i) => (
                    <line key={i} x1={0} x2={anchoMm} y1={(largoMm * i) / 3} y2={(largoMm * i) / 3} className="stroke-sky-500" strokeWidth={anchoMm * 0.015} />
                  ))}
                </svg>
                <div className="text-xs">
                  <p className="font-medium text-sky-800">
                    {largoMm} × {anchoMm} mm
                  </p>
                  <p className="text-acero-500">{formulario.panel_potencia_wp || "?"} Wp · escala referencial</p>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-acero-200 bg-superficie p-5" aria-label="Paneles en el terreno">
            <h2 className="text-sm font-semibold text-acero-700">¿Caben en el terreno?</h2>
            {!panelesObjetivo ? (
              <p className="mt-2 text-sm text-acero-500">Escribe la potencia objetivo para ver si los paneles caben en el terreno.</p>
            ) : !ocupacion ? (
              <p className="mt-2 text-sm text-acero-500">
                {numero(panelesObjetivo, 0)} paneles. Dibuja el terreno en el Paso 1 para compararlos con su área.
              </p>
            ) : (
              <>
                <dl className="mt-3 space-y-2">
                  <Fila nombre="Paneles necesarios" valor={`${numero(ocupacion.paneles, 0)} (kWp × 1000 ÷ Wp)`} />
                  <Fila nombre="Superficie de los paneles" valor={`${numero(ocupacion.areaPanelesM2, 0)} m²`} />
                  <Fila nombre="Área útil del terreno" valor={`${numero(ocupacion.areaTerrenoM2, 0)} m²`} />
                </dl>
                {ocupacion.cabe ? (
                  <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                    Los paneles ocupan el {numero(ocupacion.porcentaje, 0)} % del terreno útil. El número final lo da el Paso 3:
                    los pasillos y la forma del terreno reducen lo que entra.
                  </p>
                ) : (
                  <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    No caben: {numero(ocupacion.paneles, 0)} paneles ocupan {numero(ocupacion.areaPanelesM2, 0)} m² y el terreno útil
                    tiene {numero(ocupacion.areaTerrenoM2, 0)} m². Aun sin pasillos, entran como máximo{" "}
                    {numero(ocupacion.maximoPaneles, 0)} paneles ({numero((ocupacion.maximoPaneles * (potenciaPanel ?? 0)) / 1000, 1)} kWp).
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {/* ─── Inversores ────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-sm font-semibold text-acero-900">Inversores</h2>

            {analisis ? (
              <div
                aria-label="Relación DC/AC"
                className={[
                  "mt-4 rounded-lg border px-4 py-3 text-sm",
                  analisis.estado === "recorte"
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : analisis.estado === "reserva"
                      ? "border-sky-200 bg-sky-50 text-sky-900"
                      : "border-green-200 bg-green-50 text-green-800",
                ].join(" ")}
              >
                <p className="font-semibold">
                  Relación DC/AC: {numero(analisis.relacion, 2)} ({numero(analisis.potenciaDcKwp, 1)} kWp ÷{" "}
                  {numero(analisis.potenciaAcKw, 1)} kW)
                </p>
                <p className="mt-1 text-xs">
                  {analisis.estado === "reserva"
                    ? "Los inversores suman más que los paneles: queda reserva para ampliaciones."
                    : analisis.estado === "recorte"
                      ? `Los paneles superan a los inversores en más de un ${numero((RELACION_DC_AC_MAXIMA - 1) * 100, 0)} %: en las horas de más sol recortarían la producción.`
                      : `Dentro de lo habitual (de 1 a ${numero(RELACION_DC_AC_MAXIMA, 1)}).`}
                </p>
                {analisis.admitidos !== null && analisis.paneles > analisis.admitidos && (
                  <p className="mt-1 text-xs">
                    Las entradas admiten {numero(analisis.admitidos, 0)} paneles (MPPT × strings × paneles por string) y hay{" "}
                    {numero(analisis.paneles, 0)}: faltan entradas.
                  </p>
                )}
                <p className="mt-2 text-xs">
                  Con el modelo del inversor 1 se sugieren <strong>{analisis.sugeridos}</strong>:{" "}
                  {numero(analisis.potenciaDcKwp, 1)} kWp ÷ ({numero(potencias[0] ?? 0, 0)} kW × {numero(RELACION_DC_AC_MAXIMA, 1)}) ={" "}
                  {numero(analisis.porPotencia, 2)}
                  {analisis.porEntradas !== null &&
                    `; ${numero(analisis.paneles, 0)} paneles ÷ ${numero(analisis.admiteModelo ?? 0, 0)} que admite cada uno = ${numero(analisis.porEntradas, 2)}`}
                  . Se toma el mayor, hacia arriba. Es una referencia: los inversores los define la ingeniería del proyecto.
                </p>
                {analisis.sugeridos > inversores.length && analisis.sugeridos <= MAX_INVERSORES && (
                  <button
                    type="button"
                    onClick={() => agregarInversores(analisis.sugeridos - inversores.length)}
                    className="mt-2 rounded-md border border-current px-2.5 py-1 text-xs font-medium hover:bg-white/50"
                  >
                    Usar {analisis.sugeridos} inversores
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-acero-400">
                Con la potencia objetivo y la potencia de cada inversor se calcula la relación DC/AC (kWp de paneles ÷ kW de
                inversores) y cuántos inversores conviene usar.
              </p>
            )}

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wider text-acero-400">INVERSORES CONFIGURADOS</p>
              <button
                type="button"
                onClick={() => agregarInversores()}
                disabled={inversores.length >= MAX_INVERSORES}
                className="rounded-md border border-solar-500 px-2.5 py-1 text-xs font-semibold text-solar-700 hover:bg-solar-50 disabled:opacity-50"
              >
                + Agregar
              </button>
            </div>

            <ul className="mt-3 space-y-3">
              {inversores.map((inv, i) => {
                const color = colorInversor(i);
                const enCatalogo = catalogo.find((c) => c.marca === inv.marca.trim() && c.modelo === inv.modelo.trim());
                const limites = !hayCambios ? calculos?.strings[i] : undefined;
                const paneles = reparto(i);
                return (
                  <li key={i} className={`rounded-xl border bg-acero-50 p-4 ${color.tarjeta}`} aria-label={`Inversor ${i + 1}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${color.muestra}`} aria-hidden />
                        <span className={`text-sm font-semibold ${color.texto}`}>Inversor {i + 1}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        {paneles != null && <span className="text-xs text-acero-500">~{numero(paneles, 0)} paneles</span>}
                        <button
                          type="button"
                          onClick={() => quitarInversor(i)}
                          disabled={inversores.length <= 1}
                          className="text-xs text-acero-500 hover:text-red-600 disabled:opacity-40"
                          aria-label={`Quitar inversor ${i + 1}`}
                        >
                          Quitar
                        </button>
                      </span>
                    </div>

                    {catalogo.length > 0 && (
                      <label className="mt-3 block text-xs font-medium text-acero-600">
                        Del catálogo
                        <select
                          className={`${CAMPO} mt-1`}
                          value={enCatalogo ? String(enCatalogo.id) : ""}
                          onChange={(e) => elegirDelCatalogo(i, e.target.value)}
                        >
                          <option value="">Escrito a mano</option>
                          {catalogo.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.marca} {c.modelo} · {c.potencia_kw} kW
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Entrada etiqueta="Marca" error={visible(`inversores.${i}.marca`)} obligatorio>
                        <input className={clase(`inversores.${i}.marca`)} value={inv.marca} onChange={(e) => actualizarInversor(i, "marca", e.target.value)} onBlur={tocar(`inversores.${i}.marca`)} maxLength={80} />
                      </Entrada>
                      <Entrada etiqueta="Modelo" error={visible(`inversores.${i}.modelo`)} obligatorio>
                        <input className={clase(`inversores.${i}.modelo`)} value={inv.modelo} onChange={(e) => actualizarInversor(i, "modelo", e.target.value)} onBlur={tocar(`inversores.${i}.modelo`)} maxLength={100} />
                      </Entrada>
                      <Entrada etiqueta="Potencia" unidad="kW" error={visible(`inversores.${i}.potencia_kw`)} obligatorio>
                        <input className={clase(`inversores.${i}.potencia_kw`)} inputMode="decimal" value={inv.potencia_kw} onChange={(e) => actualizarInversor(i, "potencia_kw", e.target.value)} onBlur={tocar(`inversores.${i}.potencia_kw`)} />
                      </Entrada>
                    </div>

                    <p className="mt-3 text-xs font-medium text-acero-500">
                      Datos eléctricos <span className="font-normal text-acero-400">(opcionales: sin Vmax y Vmin no se validan los strings)</span>
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-4">
                      <Entrada etiqueta="Voltaje máx." unidad="V" error={visible(`inversores.${i}.vmax_v`)}>
                        <input className={clase(`inversores.${i}.vmax_v`)} inputMode="decimal" value={inv.vmax_v} onChange={(e) => actualizarInversor(i, "vmax_v", e.target.value)} onBlur={tocar(`inversores.${i}.vmax_v`)} />
                      </Entrada>
                      <Entrada etiqueta="Voltaje mín." unidad="V" error={visible(`inversores.${i}.vmin_v`)}>
                        <input className={clase(`inversores.${i}.vmin_v`)} inputMode="decimal" value={inv.vmin_v} onChange={(e) => actualizarInversor(i, "vmin_v", e.target.value)} onBlur={tocar(`inversores.${i}.vmin_v`)} />
                      </Entrada>
                      <Entrada etiqueta="MPPTs" error={visible(`inversores.${i}.mppts`)}>
                        <input className={clase(`inversores.${i}.mppts`)} inputMode="numeric" value={inv.mppts} onChange={(e) => actualizarInversor(i, "mppts", e.target.value)} onBlur={tocar(`inversores.${i}.mppts`)} />
                      </Entrada>
                      <Entrada etiqueta="Strings por MPPT" error={visible(`inversores.${i}.strings_por_mppt`)}>
                        <input className={clase(`inversores.${i}.strings_por_mppt`)} inputMode="numeric" value={inv.strings_por_mppt} onChange={(e) => actualizarInversor(i, "strings_por_mppt", e.target.value)} onBlur={tocar(`inversores.${i}.strings_por_mppt`)} />
                      </Entrada>
                    </div>

                    {limites && (
                      <p className={`mt-3 text-xs ${limites.compatible ? "text-acero-600" : "text-red-700"}`}>
                        {limites.compatible
                          ? `Strings de ${limites.paneles_min} a ${limites.paneles_max} paneles: compatible con el panel.`
                          : `Incompatible con el panel: ${limites.motivo}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex items-center justify-end gap-3">
              {guardado && hayCambios && <span className="text-xs text-solar-700">Hay cambios sin guardar</span>}
              <button
                type="submit"
                disabled={guardando || (!hayCambios && guardado !== null)}
                className="rounded-lg border border-solar-500 px-4 py-2 text-sm font-semibold text-solar-700 transition hover:bg-solar-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar y calcular"}
              </button>
            </div>
          </section>

          {!calculos ? (
            <div className="rounded-xl border border-dashed border-acero-300 bg-superficie p-5 text-sm text-acero-500">
              Guarda la configuración para ver los límites de string de cada inversor y los avisos del sistema.
            </div>
          ) : (
            calculos.advertencias.length > 0 && (
              <ul className="space-y-2">
                {calculos.advertencias.map((a) => (
                  <li key={a} className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900">
                    {a}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </form>

      <BarraPaso
        atras={{
          etiqueta: "← Anterior",
          // Con cambios sin guardar, useCambiosSinGuardar pregunta antes de salir
          onClick: () => void navegar(rutaPaso(proyectoId, 1)),
        }}
        resumen={resumen}
        adelante={{
          etiqueta: guardando ? "Guardando…" : "Siguiente →",
          deshabilitado: guardando,
          onClick: () => {
            if (encabezadoSucio) {
              setError("Guarda o cancela los cambios en los datos del proyecto antes de continuar.");
              return;
            }
            void unaVez("siguiente", guardarSiHaceFalta).then((ok) => {
              if (!ok) return;
              // Recién guardado: esta navegación no debe pedir confirmación
              permitirSalida();
              void navegar(rutaPaso(proyectoId, 3));
            });
          },
        }}
      />
    </div>
  );
}
