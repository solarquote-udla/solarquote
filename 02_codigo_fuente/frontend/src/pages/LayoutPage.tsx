/**
 * Asistente, Paso 3 — Caminos + Layout (RF-01 caminos, RF-03 layout).
 *
 * Como en el prototipo: el plano con los bloques a la izquierda y, a la
 * derecha, el resumen, los caminos de acceso y las advertencias de la
 * proporción antisísmica. Agregar o quitar un camino deja el layout
 * desactualizado hasta volver a generarlo.
 *
 * El usuario elige L, el pasillo, la tolerancia de proporción y,
 * opcionalmente, una capacidad en kWp. El backend distribuye los bloques
 * y devuelve todo calculado; esta pantalla solo lo muestra. Igual que en
 * terreno y equipo, ninguna cifra se recalcula en el navegador.
 *
 * Edición manual (SQ-64): los bloques se pueden mover, acortar, alargar y
 * eliminar sobre el plano. Se trabaja sobre un borrador local que se
 * valida en vivo con las mismas reglas del backend; al guardar, el
 * backend recalcula tipos, potencia y eléctrica.
 *
 * Inversores: cada bloque se pinta con el color del inversor al que va
 * conectado. El backend los reparte al generar; "Reagrupar" los vuelve a
 * repartir y, en modo edición, un bloque se puede pasar a otro inversor.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { VistaLayout, type BloqueDibujo } from "@/components/VistaLayout";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { mensajeDeError } from "@/services/api";
import { obtenerEquipo } from "@/services/equipo";
import { generarLayout, guardarBloques, obtenerLayout, reagruparLayout } from "@/services/layout";
import { obtenerProyecto } from "@/services/proyectos";
import { agregarCamino, eliminarCamino, obtenerTerreno } from "@/services/terreno";
import {
  ETIQUETAS_TIPO_CAMINO,
  TipoCamino,
  type ConfiguracionEquipo,
  type Layout,
  type LayoutGenerar,
  type Proyecto,
  type Punto,
  type Terreno,
} from "@/types/api";
import {
  redondearMm,
  validarBloques,
  verticesBloque,
  type BloqueEdicion,
  type GeometriaLayout,
} from "@/utils/edicionLayout";
import { formatearArea, limitesDe } from "@/utils/geometria";
import { colorInversor } from "@/utils/inversores";

/** Un bloque del borrador: geometría editable más el inversor al que va. */
type BloqueBorrador = BloqueEdicion & { inversor: number };

/** El arrastre se ajusta al centímetro: más fino no se puede replantear en obra. */
const AJUSTE_ARRASTRE_M = 0.01;

/** Movimiento mínimo para que un arrastre cuente: por debajo es un clic. */
const ZONA_MUERTA_M = 0.05;

/** Desplazamiento con las flechas del teclado; con Shift, 1 m. */
const PASO_TECLADO_M = 0.1;

const ajustar = (v: number) => Math.round(v / AJUSTE_ARRASTRE_M) * AJUSTE_ARRASTRE_M;

/** Misma identidad que usa el backend para contar ediciones. */
const claveIdentidad = (origen: Punto, a: number) =>
  `${origen[0].toFixed(2)}|${origen[1].toFixed(2)}|${a}`;

function contarCambios(original: BloqueEdicion[], borrador: BloqueEdicion[]): number {
  const previos = new Set(original.map((b) => claveIdentidad(b.origen, b.paneles_ancho)));
  const nuevos = new Set(borrador.map((b) => claveIdentidad(b.origen, b.paneles_ancho)));
  const agregados = [...nuevos].filter((k) => !previos.has(k)).length;
  const quitados = [...previos].filter((k) => !nuevos.has(k)).length;
  return Math.max(agregados, quitados);
}

/** Bloques que cambiaron de inversor (los movidos se comparan por su clave local). */
function contarCambiosDeInversor(original: BloqueBorrador[], borrador: BloqueBorrador[]): number {
  const antes = new Map(original.map((b) => [b.clave, b.inversor]));
  return borrador.filter((b) => antes.has(b.clave) && antes.get(b.clave) !== b.inversor).length;
}

/**
 * Letra de tipo para el borrador, con la misma regla que el backend:
 * el A más repetido es "A", luego el siguiente…
 */
function letrasPorA(bloques: BloqueEdicion[]): Map<number, string> {
  const conteo = new Map<number, number>();
  for (const b of bloques) conteo.set(b.paneles_ancho, (conteo.get(b.paneles_ancho) ?? 0) + 1);
  const orden = [...conteo.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  return new Map(orden.map(([a], i) => [a, i < 26 ? String.fromCharCode(65 + i) : `T${i + 1}`]));
}

const CAMPO =
  "w-full rounded-lg border border-acero-300 px-3 py-2 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

// Mismos valores por defecto que el backend (schemas/layout.py)
const PARAMETROS_DEFECTO = { L: "4", pasillo: "2", tolerancia: "20", kwp: "" };
type Parametros = typeof PARAMETROS_DEFECTO;

const OPCIONES_L = [2, 4, 6, 8, 10, 12];

type Direccion = "horizontal" | "vertical";

interface FormularioCamino {
  direccion: Direccion;
  /** Eje del camino desde el borde inferior (horizontal) o izquierdo (vertical), en m */
  posicion: string;
  ancho: string;
  tipo: TipoCamino;
}

/**
 * Camino recto de borde a borde del terreno, como en el prototipo
 * ("Camino H1 · Horizontal · 4 m de ancho"). El backend lo recorta contra
 * el terreno al calcular el área útil, así que en un terreno irregular
 * puede sobresalir sin problema.
 */
function rectanguloCamino(terreno: Punto[], f: { direccion: Direccion; posicion: number; ancho: number }): Punto[] {
  const caja = limitesDe(terreno);
  // Sin terreno no hay camino que trazar (guardarCamino ya lo impide antes)
  if (!caja) return [];
  const { minX, maxX, minY, maxY } = caja;
  const medio = f.ancho / 2;
  if (f.direccion === "horizontal") {
    const y = minY + f.posicion;
    return [[minX, y - medio], [maxX, y - medio], [maxX, y + medio], [minX, y + medio]];
  }
  const x = minX + f.posicion;
  return [[x - medio, minY], [x + medio, minY], [x + medio, maxY], [x - medio, maxY]];
}

/** Siguiente nombre libre: "Camino H1", "Camino H2"… */
function nombreCamino(existentes: (string | null)[], direccion: Direccion): string {
  const letra = direccion === "horizontal" ? "H" : "V";
  const usados = existentes.flatMap((n) => {
    const m = n?.match(new RegExp(`^Camino ${letra}(\\d+)$`));
    return m ? [Number(m[1])] : [];
  });
  return `Camino ${letra}${Math.max(0, ...usados) + 1}`;
}

/**
 * Sentido y ancho de un camino, para la lista del panel.
 *
 * El sentido sale del nombre que le da esta pantalla ("Camino H1" o
 * "Camino V1"): adivinarlo por la forma falla en terrenos angostos, donde
 * un camino horizontal puede ser más alto que ancho. Solo para caminos
 * con otro nombre (creados antes del asistente) se infiere por la forma.
 */
function describirCamino(nombre: string | null, vertices: Punto[]): string {
  const caja = limitesDe(vertices);
  if (!caja) return "Sin geometría";
  const dx = caja.maxX - caja.minX;
  const dy = caja.maxY - caja.minY;
  const letra = nombre?.match(/^Camino ([HV])\d+$/)?.[1];
  const horizontal = letra ? letra === "H" : dx >= dy;
  return `${horizontal ? "Horizontal" : "Vertical"} · ${numero(horizontal ? dy : dx)} m de ancho`;
}

/** Cuánto mide el terreno en la dirección en que se mide la posición del eje. */
function extensionEje(terreno: Punto[], direccion: Direccion): number {
  const caja = limitesDe(terreno);
  if (!caja) return 0;
  return direccion === "horizontal" ? caja.maxY - caja.minY : caja.maxX - caja.minX;
}

/** Eje centrado del terreno en la dirección del camino, en metros desde el borde. */
function posicionCentrada(terreno: Punto[], direccion: Direccion): string {
  return String(Math.round(extensionEje(terreno, direccion) / 2));
}

/**
 * Parámetros del formulario. Sin layout, la capacidad deseada parte de la
 * potencia objetivo del Paso 2 (prototipo: se define una sola vez).
 */
function desdeLayout(l: Layout | null, objetivoKwp: number | null = null): Parametros {
  if (!l) return { ...PARAMETROS_DEFECTO, kwp: objetivoKwp == null ? "" : String(objetivoKwp) };
  return {
    L: String(l.parametros.paneles_largo),
    pasillo: String(l.parametros.pasillo_m),
    tolerancia: String(Math.round(l.parametros.tolerancia_proporcion * 100)),
    kwp: l.parametros.capacidad_deseada_kwp == null ? "" : String(l.parametros.capacidad_deseada_kwp),
  };
}

/** Número desde texto, aceptando coma decimal. Vacío → null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

function aPeticion(p: Parametros): { datos: LayoutGenerar } | { error: string } {
  const pasillo = aNumero(p.pasillo);
  const tolerancia = aNumero(p.tolerancia);
  const kwp = aNumero(p.kwp);

  if (pasillo === null || Number.isNaN(pasillo)) return { error: "Revisa el pasillo: debe ser un número en metros." };
  if (tolerancia === null || Number.isNaN(tolerancia)) return { error: "Revisa la tolerancia: debe ser un porcentaje." };
  if (kwp !== null && Number.isNaN(kwp)) return { error: "Revisa la capacidad deseada: debe ser un número en kWp." };

  return {
    datos: {
      paneles_largo: Number(p.L),
      pasillo_m: pasillo,
      tolerancia_proporcion: tolerancia / 100,
      capacidad_deseada_kwp: kwp,
    },
  };
}

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-acero-200 bg-superficie p-5">
      <h2 className="text-sm font-semibold text-acero-700">{titulo}</h2>
      {children}
    </div>
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

function Entrada({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-acero-600">
      {etiqueta}
      <div className="mt-1">{children}</div>
      {ayuda && <span className="mt-1 block font-normal text-acero-400">{ayuda}</span>}
    </label>
  );
}

export function LayoutPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [terreno, setTerreno] = useState<Terreno | null>(null);
  const [equipo, setEquipo] = useState<ConfiguracionEquipo | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [parametros, setParametros] = useState<Parametros>(PARAMETROS_DEFECTO);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);

  // ─── Edición manual (SQ-64) ──────────────────────────
  // null = no se está editando
  const [borrador, setBorrador] = useState<BloqueBorrador[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reagrupando, setReagrupando] = useState(false);
  const origenAlArrastrar = useRef<Punto | null>(null);
  const navegar = useNavigate();

  const [formCamino, setFormCamino] = useState<FormularioCamino | null>(null);
  // Valores con que se abrió el formulario de camino: tocarlo cuenta como cambio
  const [formCaminoInicial, setFormCaminoInicial] = useState<FormularioCamino | null>(null);
  // "Editar datos" del encabezado tiene su propio formulario
  const [encabezadoSucio, setEncabezadoSucio] = useState(false);
  const [procesandoCamino, setProcesandoCamino] = useState(false);
  const unaVez = useAccionUnica();

  const original = useMemo<BloqueBorrador[]>(
    () =>
      (layout?.bloques ?? []).map((b, i) => ({
        clave: i,
        origen: b.vertices[3],
        paneles_ancho: b.paneles_ancho,
        inversor: b.inversor,
      })),
    [layout],
  );

  const geometria = useMemo<GeometriaLayout | null>(
    () =>
      layout
        ? { largo_m: layout.largo_bloque_m, lado_menor_m: layout.lado_menor_m, angulo_norte: layout.angulo_norte }
        : null,
    [layout],
  );

  const problemas = useMemo(
    () =>
      borrador && geometria && terreno
        ? validarBloques(borrador, geometria, terreno.vertices, terreno.caminos.map((c) => c.vertices))
        : new Map<number, string>(),
    [borrador, geometria, terreno],
  );

  const cambios = useMemo(
    () => (borrador ? contarCambios(original, borrador) + contarCambiosDeInversor(original, borrador) : 0),
    [borrador, original],
  );

  /** Inversores del equipo: los del layout se calculan con el equipo actual, son los mismos. */
  const cantidadInversores = layout?.inversores.length || equipo?.inversores.length || 1;

  /** Bloques a dibujar: los guardados, o el borrador si se está editando. */
  const dibujo = useMemo<BloqueDibujo[]>(() => {
    if (!layout) return [];
    if (!borrador || !geometria) {
      return layout.bloques.map((b, i) => ({ ...b, clave: i }));
    }
    // La proporción es lineal en A: se toma la constante de cualquier tipo guardado.
    const ref = layout.tipos[0];
    const porPanel = ref ? ref.proporcion / ref.paneles_ancho : 0;
    const tolerancia = layout.parametros.tolerancia_proporcion;
    const letras = letrasPorA(borrador);
    return borrador.map((b) => ({
      clave: b.clave,
      vertices: verticesBloque(b, geometria),
      tipo: letras.get(b.paneles_ancho) ?? "?",
      paneles_largo: layout.parametros.paneles_largo,
      paneles_ancho: b.paneles_ancho,
      en_proporcion: Math.abs((porPanel * b.paneles_ancho) / 3 - 1) <= tolerancia + 1e-6,
      inversor: b.inversor,
      problema: problemas.get(b.clave),
    }));
  }, [layout, borrador, geometria, problemas]);

  const bloqueSeleccionado = borrador?.find((b) => b.clave === seleccionado) ?? null;

  const moverSeleccionado = useCallback(
    (dx: number, dy: number) => {
      if (seleccionado === null) return;
      setBorrador((bs) =>
        bs?.map((b) =>
          b.clave === seleccionado ? { ...b, origen: [ajustar(b.origen[0] + dx), ajustar(b.origen[1] + dy)] } : b,
        ) ?? null,
      );
    },
    [seleccionado],
  );

  const eliminarSeleccionado = useCallback(() => {
    if (seleccionado === null) return;
    setBorrador((bs) => bs?.filter((b) => b.clave !== seleccionado) ?? null);
    setSeleccionado(null);
  }, [seleccionado]);

  function cambiarInversor(inversor: number) {
    setBorrador((bs) => bs?.map((b) => (b.clave === seleccionado ? { ...b, inversor } : b)) ?? null);
  }

  function cambiarA(delta: number) {
    setBorrador((bs) =>
      bs?.map((b) =>
        b.clave === seleccionado ? { ...b, paneles_ancho: Math.max(1, b.paneles_ancho + delta) } : b,
      ) ?? null,
    );
  }

  // Teclado: Supr elimina, flechas mueven. No interfiere al escribir en un campo.
  useEffect(() => {
    if (!borrador) return;
    function alTeclear(e: KeyboardEvent) {
      const destino = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName)) return;
      const paso = e.shiftKey ? 1 : PASO_TECLADO_M;
      const acciones: Record<string, () => void> = {
        Delete: eliminarSeleccionado,
        Backspace: eliminarSeleccionado,
        ArrowUp: () => moverSeleccionado(0, paso),
        ArrowDown: () => moverSeleccionado(0, -paso),
        ArrowLeft: () => moverSeleccionado(-paso, 0),
        ArrowRight: () => moverSeleccionado(paso, 0),
        Escape: () => setSeleccionado(null),
      };
      const accion = acciones[e.key];
      if (accion && seleccionado !== null) {
        e.preventDefault();
        accion();
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [borrador, seleccionado, eliminarSeleccionado, moverSeleccionado]);

  function empezarEdicion() {
    setError(null);
    setAviso(null);
    setConfirmarRegenerar(false);
    setBorrador(original);
    setSeleccionado(null);
  }

  function descartarEdicion() {
    setBorrador(null);
    setSeleccionado(null);
  }

  async function guardarEdicion() {
    if (!borrador) return;
    setError(null);
    setGuardando(true);
    try {
      const nuevo = await guardarBloques(
        proyectoId,
        borrador.map((b) => ({ origen: redondearMm(b.origen), paneles_ancho: b.paneles_ancho, inversor: b.inversor })),
      );
      setLayout(nuevo);
      setBorrador(null);
      setSeleccionado(null);
      setAviso(`Edición guardada: ${cambios} cambio(s). Tipos, potencia y eléctrica recalculados.`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar la edición"));
    } finally {
      setGuardando(false);
    }
  }

  /** "Reagrupar" del prototipo: reparte de nuevo los bloques entre los inversores. */
  async function reagrupar() {
    if (!layout) return;
    const aMano = layout.ediciones_manuales;
    setError(null);
    setAviso(null);
    setReagrupando(true);
    try {
      const nuevo = await reagruparLayout(proyectoId);
      setLayout(nuevo);
      setAviso(
        `Bloques repartidos entre ${nuevo.inversores.length} inversores.` +
          (aMano > 0 ? " Las ediciones de posición y tamaño se conservan." : ""),
      );
    } catch (e) {
      setError(mensajeDeError(e, "No se pudieron reagrupar los bloques"));
    } finally {
      setReagrupando(false);
    }
  }

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    Promise.all([
      obtenerProyecto(proyectoId),
      obtenerTerreno(proyectoId),
      obtenerEquipo(proyectoId),
      obtenerLayout(proyectoId),
    ])
      .then(([p, t, e, l]) => {
        if (cancelado) return;
        setProyecto(p);
        setTerreno(t);
        setEquipo(e);
        setLayout(l);
        setParametros(desdeLayout(l, e?.potencia_objetivo_kwp ?? null));
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar el proyecto"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId]);

  // ─── Caminos de acceso ───────────────────────────────

  function abrirFormCamino() {
    if (!terreno) return;
    setError(null);
    setAviso(null);
    const inicial: FormularioCamino = {
      direccion: "horizontal",
      posicion: posicionCentrada(terreno.vertices, "horizontal"),
      ancho: "4",
      tipo: TipoCamino.ACCESO,
    };
    setFormCamino(inicial);
    setFormCaminoInicial(inicial);
  }

  /** Tras cambiar un camino: terreno y layout nuevos (el layout queda desactualizado). */
  async function recargarTrasCamino() {
    const [t, l] = await Promise.all([obtenerTerreno(proyectoId), obtenerLayout(proyectoId)]);
    setTerreno(t);
    setLayout(l);
  }

  async function guardarCamino() {
    if (!terreno || !formCamino) return;
    if (terreno.vertices.length < 3) {
      setError("Define primero el contorno del terreno en el Paso 1.");
      return;
    }
    const posicion = aNumero(formCamino.posicion);
    const ancho = aNumero(formCamino.ancho);
    const extension = extensionEje(terreno.vertices, formCamino.direccion);
    if (posicion === null || Number.isNaN(posicion) || posicion < 0 || posicion > extension) {
      setError(`La posición del eje debe estar dentro del terreno: entre 0 y ${numero(extension)} m.`);
      return;
    }
    if (ancho === null || Number.isNaN(ancho) || ancho <= 0) {
      setError("El ancho del camino debe ser mayor que cero.");
      return;
    }
    setProcesandoCamino(true);
    setError(null);
    try {
      const nombre = nombreCamino(terreno.caminos.map((c) => c.nombre), formCamino.direccion);
      await agregarCamino(proyectoId, {
        nombre,
        tipo: formCamino.tipo,
        vertices: rectanguloCamino(terreno.vertices, { direccion: formCamino.direccion, posicion, ancho }),
      });
      await recargarTrasCamino();
      setFormCamino(null);
      setAviso(`${nombre} agregado.${layout ? " Vuelve a generar el layout para que lo respete." : ""}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo agregar el camino"));
    } finally {
      setProcesandoCamino(false);
    }
  }

  async function quitarCamino(caminoId: number, nombre: string | null) {
    if (!window.confirm(`¿Quitar ${nombre ?? "el camino"}?`)) return;
    setProcesandoCamino(true);
    setError(null);
    try {
      await eliminarCamino(proyectoId, caminoId);
      await recargarTrasCamino();
      setAviso(`${nombre ?? "Camino"} quitado.${layout ? " Vuelve a generar el layout." : ""}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo quitar el camino"));
    } finally {
      setProcesandoCamino(false);
    }
  }

  /** "Ajustar B8" del prototipo: abre la edición con el primer bloque de ese tipo elegido. */
  function ajustarTipo(tipo: string) {
    if (!layout) return;
    const indice = layout.bloques.findIndex((b) => b.tipo === tipo);
    empezarEdicion();
    if (indice >= 0) setSeleccionado(indice);
  }

  function actualizar(campo: keyof Parametros, valor: string) {
    setParametros((p) => ({ ...p, [campo]: valor }));
  }

  async function generar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const resultado = aPeticion(parametros);
    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }

    // Regenerar pisa las ediciones manuales: se pide confirmación una vez.
    if (layout && layout.ediciones_manuales > 0 && !confirmarRegenerar) {
      setConfirmarRegenerar(true);
      return;
    }

    setGenerando(true);
    setConfirmarRegenerar(false);
    try {
      const nuevo = await generarLayout(proyectoId, resultado.datos);
      setLayout(nuevo);
      setParametros(desdeLayout(nuevo, equipo?.potencia_objetivo_kwp ?? null));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo generar el layout"));
    } finally {
      setGenerando(false);
    }
  }

  // ─── Render ──────────────────────────────────────────

  /**
   * Todo lo de este paso que se perdería al salir: ediciones de bloques sin
   * guardar, un camino a medio cargar, parámetros cambiados sin volver a
   * generar y los datos del proyecto en edición.
   */
  const parametrosCambiados =
    JSON.stringify(aPeticion(parametros)) !==
    JSON.stringify(aPeticion(desdeLayout(layout, equipo?.potencia_objetivo_kwp ?? null)));
  const caminoACargar = formCamino !== null && JSON.stringify(formCamino) !== JSON.stringify(formCaminoInicial);
  const sinGuardar = borrador !== null || caminoACargar || parametrosCambiados || encabezadoSucio;
  useCambiosSinGuardar(sinGuardar);

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

  const faltaTerreno = terreno === null;
  const faltaEquipo = equipo === null;
  const puedeGenerar = !faltaTerreno && !faltaEquipo;
  const fueraDeProporcion = layout?.tipos.filter((t) => !t.en_proporcion) ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto
        paso={3}
        proyecto={proyecto}
        onCambiosSinGuardar={setEncabezadoSucio}
        onActualizado={async (p) => {
          setProyecto(p);
          // La latitud entra en la huella del layout: puede quedar desactualizado
          setLayout(await obtenerLayout(proyectoId));
        }}
      />

      {!puedeGenerar && (
        <div className="mt-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-900">
          Para generar el layout falta definir
          {faltaTerreno && (
            <>
              {" "}
              <Link to={rutaPaso(proyecto.id, 1)} className="font-semibold underline">
                el terreno
              </Link>
            </>
          )}
          {faltaTerreno && faltaEquipo && " y"}
          {faltaEquipo && (
            <>
              {" "}
              <Link to={rutaPaso(proyecto.id, 2)} className="font-semibold underline">
                el panel y el inversor
              </Link>
            </>
          )}
          .
        </div>
      )}

      {layout?.desactualizado && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El terreno, los caminos, el equipo o la latitud cambiaron después de generar este layout.
          Vuelve a generarlo para que refleje los datos actuales.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {aviso && !error && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ─── Parámetros y plano ───────────────────────── */}
        <div className="space-y-5 lg:col-span-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unaVez("generar", () => generar(e));
            }}
            className="rounded-xl border border-acero-200 bg-superficie p-5"
          >
            <div className="grid gap-4 sm:grid-cols-4">
              <Entrada etiqueta="Paneles en el largo (L)" ayuda="Par: soportes en A y V">
                <select className={CAMPO} value={parametros.L} onChange={(e) => actualizar("L", e.target.value)}>
                  {OPCIONES_L.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Entrada>
              <Entrada etiqueta="Pasillo (m)" ayuda="Entre bloques">
                <input className={CAMPO} inputMode="decimal" value={parametros.pasillo} onChange={(e) => actualizar("pasillo", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Tolerancia (%)" ayuda="Sobre ancho = 3 × largo">
                <input className={CAMPO} inputMode="decimal" value={parametros.tolerancia} onChange={(e) => actualizar("tolerancia", e.target.value)} />
              </Entrada>
              <Entrada etiqueta="Capacidad deseada (kWp)" ayuda="Opcional. Vacío = máximo">
                <input className={CAMPO} inputMode="decimal" placeholder="Máxima" value={parametros.kwp} onChange={(e) => actualizar("kwp", e.target.value)} />
              </Entrada>
            </div>
            {confirmarRegenerar ? (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p>
                  Este layout tiene <strong>{layout?.ediciones_manuales} edición(es) manual(es)</strong>. Volver a
                  generarlo las reemplaza por completo.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirmarRegenerar(false)} className="rounded-lg border border-amber-400 px-4 py-1.5 text-sm hover:bg-amber-100">
                    Cancelar
                  </button>
                  <button type="submit" disabled={generando} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-acero-50 hover:bg-amber-400 disabled:opacity-50">
                    {generando ? "Generando…" : "Sí, volver a generar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-end gap-3">
                {borrador && <span className="text-xs text-acero-500">Termina o descarta la edición para regenerar.</span>}
                <button
                  type="submit"
                  disabled={!puedeGenerar || generando || borrador !== null}
                  className="rounded-lg bg-solar-500 px-5 py-2 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generando ? "Generando…" : layout ? "Volver a generar" : "Generar layout"}
                </button>
              </div>
            )}
          </form>

          {/* ─── Barra de edición (SQ-64) ─────────────────── */}
          {layout && !borrador && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-acero-200 bg-superficie px-5 py-3">
              <p className="text-sm text-acero-600">
                {layout.ediciones_manuales > 0
                  ? `${layout.ediciones_manuales} edición(es) manual(es) desde la última generación.`
                  : "Puedes ajustar a mano los bloques que generó el sistema."}
              </p>
              <button
                type="button"
                onClick={empezarEdicion}
                disabled={layout.desactualizado}
                title={layout.desactualizado ? "Vuelve a generar el layout antes de editarlo" : undefined}
                className="rounded-lg border border-solar-500 px-4 py-1.5 text-sm font-semibold text-solar-700 transition hover:bg-solar-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Editar bloques
              </button>
            </div>
          )}

          {borrador && (
            <div className="rounded-xl border border-solar-300 bg-solar-50 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-solar-900">
                  <p className="font-semibold">Modo edición</p>
                  <p className="text-xs">
                    Arrastra un bloque para moverlo. Flechas: 10 cm (con Shift, 1 m). Supr: eliminar.
                    {cantidadInversores > 1 && " Para pasar un bloque a otro inversor, selecciónalo y elige el inversor."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-acero-600">
                    {cambios} cambio(s)
                    {problemas.size > 0 && <span className="ml-2 font-semibold text-red-700">· {problemas.size} bloque(s) con problemas</span>}
                  </span>
                  <button type="button" onClick={descartarEdicion} className="rounded-lg border border-acero-300 bg-superficie px-3 py-1.5 text-sm text-acero-700 hover:bg-acero-100">
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => void unaVez("bloques", guardarEdicion)}
                    disabled={guardando || cambios === 0 || problemas.size > 0 || borrador.length === 0}
                    title={problemas.size > 0 ? "Corrige los bloques en rojo antes de guardar" : undefined}
                    className="rounded-lg bg-solar-500 px-4 py-1.5 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guardando ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </div>

              {bloqueSeleccionado && (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-solar-200 pt-3 text-sm">
                  <span className="font-medium text-acero-800">
                    Bloque {dibujo.find((d) => d.clave === bloqueSeleccionado.clave)?.tipo} ·{" "}
                    {layout?.parametros.paneles_largo} × {bloqueSeleccionado.paneles_ancho}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-acero-500">A:</span>
                    <button type="button" onClick={() => cambiarA(-1)} disabled={bloqueSeleccionado.paneles_ancho <= 1} className="h-7 w-7 rounded border border-acero-300 bg-superficie text-acero-700 hover:bg-acero-100 disabled:opacity-40" aria-label="Quitar un panel en A">
                      −
                    </button>
                    <span className="w-8 text-center font-mono">{bloqueSeleccionado.paneles_ancho}</span>
                    <button type="button" onClick={() => cambiarA(1)} className="h-7 w-7 rounded border border-acero-300 bg-superficie text-acero-700 hover:bg-acero-100" aria-label="Agregar un panel en A">
                      +
                    </button>
                  </span>
                  {cantidadInversores > 1 && (
                    <label className="flex items-center gap-1.5 text-xs text-acero-500">
                      Inversor:
                      <select
                        className="rounded border border-acero-300 bg-superficie px-2 py-1 text-sm text-acero-800"
                        value={bloqueSeleccionado.inversor}
                        onChange={(e) => cambiarInversor(Number(e.target.value))}
                      >
                        {Array.from({ length: cantidadInversores }, (_, i) => (
                          <option key={i} value={i}>
                            Inversor {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" onClick={eliminarSeleccionado} className="text-sm text-red-700 hover:underline">
                    Eliminar bloque
                  </button>
                  {problemas.get(bloqueSeleccionado.clave) && (
                    <span className="text-xs font-semibold text-red-700">{problemas.get(bloqueSeleccionado.clave)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {terreno && (
            <VistaLayout
              terreno={terreno.vertices}
              caminos={terreno.caminos.map((c) => c.vertices)}
              bloques={dibujo}
              orientacionNorte={terreno.orientacion_norte}
              desactualizado={layout?.desactualizado}
              inversores={cantidadInversores}
              editable={borrador !== null}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
              onIniciarArrastre={(clave) => {
                origenAlArrastrar.current = borrador?.find((b) => b.clave === clave)?.origen ?? null;
              }}
              onArrastrar={(clave, [dx, dy]) => {
                const base = origenAlArrastrar.current;
                // Zona muerta: un clic para seleccionar no debe mover el bloque
                if (!base || Math.hypot(dx, dy) < ZONA_MUERTA_M) return;
                setBorrador((bs) =>
                  bs?.map((b) => (b.clave === clave ? { ...b, origen: [ajustar(base[0] + dx), ajustar(base[1] + dy)] } : b)) ?? null,
                );
              }}
            />
          )}
        </div>

        {/* ─── Resultados ───────────────────────────────── */}
        <aside className="space-y-5">
          {/* ─── Resumen (prototipo) ─────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { etiqueta: "paneles", valor: layout ? numero(layout.total_paneles, 0) : "–", clase: "text-sky-800" },
              { etiqueta: "kWp", valor: layout ? numero(layout.potencia_kwp, 1) : "–", clase: "text-green-800" },
              { etiqueta: "bloques", valor: layout ? numero(layout.bloques.length, 0) : "–", clase: "text-acero-900" },
              {
                etiqueta: fueraDeProporcion.length === 1 ? "advertencia" : "advertencias",
                valor: layout ? String(fueraDeProporcion.length) : "–",
                clase: fueraDeProporcion.length ? "text-amber-700" : "text-acero-900",
              },
            ].map((d) => (
              <div key={d.etiqueta} className="rounded-xl border border-acero-200 bg-superficie px-4 py-3">
                <p className={`text-xl font-bold ${d.clase}`}>{d.valor}</p>
                <p className="text-xs text-acero-500">{d.etiqueta}</p>
              </div>
            ))}
          </div>

          {/* ─── Bloques por inversor (prototipo: "BLOQUES · REAGRUPAR") ─── */}
          {layout && (
            <div className="rounded-xl border border-acero-200 bg-superficie p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-wider text-acero-400">BLOQUES POR INVERSOR</h2>
                <button
                  type="button"
                  onClick={() => void unaVez("reagrupar", reagrupar)}
                  disabled={reagrupando || borrador !== null || layout.desactualizado || layout.inversores.length < 2}
                  title={
                    layout.inversores.length < 2
                      ? "Con un solo inversor todos los bloques van a él"
                      : "Reparte de nuevo los bloques en proporción a la potencia de cada inversor"
                  }
                  className="text-xs font-semibold text-solar-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reagrupando ? "Reagrupando…" : "Reagrupar"}
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {layout.inversores.map((inv, i) => (
                  <li key={inv.numero} className="flex items-center justify-between gap-3 rounded-lg border border-acero-200 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-sm ${colorInversor(i).muestra}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-acero-800">
                          Inversor {inv.numero} · {inv.marca} {inv.modelo}
                        </span>
                        <span className="block text-xs text-acero-500">
                          {inv.bloques} bloque{inv.bloques === 1 ? "" : "s"} · {numero(inv.paneles, 0)} paneles ·{" "}
                          {numero(inv.potencia_kwp, 1)} kWp
                        </span>
                      </span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${colorInversor(i).texto}`}>
                      {numero(inv.potencia_kw, 1)} kW
                    </span>
                  </li>
                ))}
              </ul>
              {layout.inversores.length > 0 && layout.inversores.length !== layout.inversores_sugeridos && (
                <p className="mt-3 text-xs text-amber-800">
                  Con {numero(layout.total_paneles, 0)} paneles se sugieren {layout.inversores_sugeridos} inversor
                  {layout.inversores_sugeridos === 1 ? "" : "es"} (~400 paneles c/u) y hay {layout.inversores.length}.{" "}
                  <Link to={rutaPaso(proyecto.id, 2)} className="font-semibold underline">
                    Ajustar en el Paso 2
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* ─── Caminos de acceso ───────────────────────── */}
          {terreno && (
            <div className="rounded-xl border border-acero-200 bg-superficie p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-wider text-acero-400">CAMINOS DE ACCESO</h2>
                {!formCamino && (
                  <button
                    type="button"
                    onClick={abrirFormCamino}
                    disabled={procesandoCamino || borrador !== null}
                    className="rounded-md border border-solar-500 px-2.5 py-1 text-xs font-semibold text-solar-700 hover:bg-solar-50 disabled:opacity-50"
                  >
                    + Agregar
                  </button>
                )}
              </div>

              {terreno.caminos.length === 0 && !formCamino && (
                <p className="mt-3 text-sm text-acero-500">Sin caminos: los bloques ocupan todo el terreno útil.</p>
              )}
              <ul className="mt-3 space-y-2">
                {terreno.caminos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <span>
                      <span className="block text-sm font-medium text-amber-900">{c.nombre ?? "Camino"}</span>
                      <span className="block text-xs text-amber-800">
                        {describirCamino(c.nombre, c.vertices)} · {ETIQUETAS_TIPO_CAMINO[c.tipo]}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void unaVez(`quitar-camino-${c.id}`, () => quitarCamino(c.id, c.nombre))}
                      disabled={procesandoCamino || borrador !== null}
                      className="text-xs text-acero-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>

              {formCamino && (
                <div className="mt-3 space-y-3 rounded-lg border border-acero-200 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(["horizontal", "vertical"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setFormCamino((f) => {
                            if (!f || !terreno || f.direccion === d) return f;
                            // Si la posición sigue en el centro del otro eje, se centra en el nuevo
                            const centrada = f.posicion === posicionCentrada(terreno.vertices, f.direccion);
                            return { ...f, direccion: d, posicion: centrada ? posicionCentrada(terreno.vertices, d) : f.posicion };
                          })
                        }
                        className={[
                          "rounded-lg border px-3 py-1.5 text-sm transition",
                          formCamino.direccion === d ? "border-solar-500 bg-solar-50 text-solar-700" : "border-acero-300 text-acero-700 hover:bg-acero-100",
                        ].join(" ")}
                      >
                        {d === "horizontal" ? "Horizontal" : "Vertical"}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Entrada etiqueta={formCamino.direccion === "horizontal" ? "Eje desde abajo (m)" : "Eje desde la izquierda (m)"}>
                      <input className={CAMPO} inputMode="decimal" value={formCamino.posicion} onChange={(e) => setFormCamino((f) => (f ? { ...f, posicion: e.target.value } : f))} />
                    </Entrada>
                    <Entrada etiqueta="Ancho (m)">
                      <input className={CAMPO} inputMode="decimal" value={formCamino.ancho} onChange={(e) => setFormCamino((f) => (f ? { ...f, ancho: e.target.value } : f))} />
                    </Entrada>
                  </div>
                  <Entrada etiqueta="Tipo">
                    <select className={CAMPO} value={formCamino.tipo} onChange={(e) => setFormCamino((f) => (f ? { ...f, tipo: e.target.value as TipoCamino } : f))}>
                      {Object.values(TipoCamino).map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETAS_TIPO_CAMINO[t]}
                        </option>
                      ))}
                    </select>
                  </Entrada>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setFormCamino(null)} className="rounded-lg border border-acero-300 px-3 py-1.5 text-sm text-acero-700 hover:bg-acero-100">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void unaVez("agregar-camino", guardarCamino)}
                      disabled={procesandoCamino}
                      className="rounded-lg bg-solar-500 px-3 py-1.5 text-sm font-semibold text-acero-50 hover:bg-solar-600 disabled:opacity-50"
                    >
                      {procesandoCamino ? "Agregando…" : "Agregar camino"}
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-acero-400">
                Los caminos se trazan rectos, de borde a borde del terreno; el área útil descuenta solo lo que cae dentro.
              </p>
            </div>
          )}

          {/* ─── Proporción antisísmica (prototipo) ──────── */}
          {layout && !borrador && fueraDeProporcion.map((t) => {
            const ideal = 3;
            return (
              <div key={t.tipo} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Tipo {t.tipo}: proporción antisísmica</p>
                <p className="mt-1 text-xs">
                  {t.repeticiones} bloque{t.repeticiones === 1 ? "" : "s"} de {t.paneles_largo} × {t.paneles_ancho} con
                  proporción {numero(t.proporcion)} : 1, fuera del rango de {ideal} : 1 ±{" "}
                  {numero(layout.parametros.tolerancia_proporcion * 100, 0)} %. Ajústalo o confírmalo bajo tu
                  responsabilidad.
                </p>
                <button
                  type="button"
                  onClick={() => ajustarTipo(t.tipo)}
                  disabled={layout.desactualizado}
                  className="mt-2 rounded-md border border-amber-400 px-2.5 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                >
                  Ajustar {t.tipo}
                </button>
              </div>
            );
          })}

          {borrador && (
            <p className="rounded-lg bg-solar-50 px-3 py-2 text-xs text-solar-800">
              Mientras editas, estos resultados son los del layout guardado. Se recalculan al guardar.
            </p>
          )}
          {!layout ? (
            <div className="rounded-xl border border-dashed border-acero-300 bg-superficie p-5 text-sm text-acero-500">
              Genera el layout para ver los bloques, la potencia instalada y la configuración eléctrica.
            </div>
          ) : (
            <>
              <Tarjeta titulo="Planta">
                <p className="mt-3 text-3xl font-bold text-acero-900">
                  {numero(layout.potencia_kwp, 1)}
                  <span className="ml-2 text-sm font-normal text-acero-500">kWp</span>
                </p>
                <dl className="mt-3 space-y-2">
                  <Fila nombre="Paneles" valor={numero(layout.total_paneles, 0)} />
                  <Fila nombre="Bloques" valor={numero(layout.bloques.length, 0)} />
                  <Fila nombre="Área útil" valor={formatearArea(layout.area_util_m2)} />
                  <Fila
                    nombre="Ocupación"
                    valor={`${numero((100 * layout.area_ocupada_m2) / layout.area_util_m2, 1)} %`}
                  />
                </dl>
              </Tarjeta>

              {layout.capacidad && (
                <Tarjeta titulo="Capacidad deseada">
                  <span
                    className={[
                      "mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      layout.capacidad.cabe ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900",
                    ].join(" ")}
                  >
                    {layout.capacidad.cabe ? "Cabe en el terreno" : "No cabe"}
                  </span>
                  <dl className="mt-3 space-y-2">
                    <Fila nombre="Deseada" valor={`${numero(layout.capacidad.deseada_kwp, 1)} kWp`} />
                    <Fila nombre="Instalada" valor={`${numero(layout.capacidad.instalada_kwp, 1)} kWp`} />
                    <Fila nombre="Máxima del terreno" valor={`${numero(layout.capacidad.maxima_kwp, 1)} kWp`} />
                    {layout.capacidad.cabe && (
                      <Fila nombre="Espacio remanente" valor={`${numero(layout.capacidad.remanente_kwp, 1)} kWp`} />
                    )}
                  </dl>
                </Tarjeta>
              )}

              <Tarjeta titulo="Bloques por tipo">
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-acero-400">
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">L × A</th>
                      <th className="pb-2 text-right font-medium">Cant.</th>
                      <th className="pb-2 text-right font-medium">Prop.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-acero-100">
                    {layout.tipos.map((t) => (
                      <tr key={t.tipo}>
                        <td className="py-1.5">
                          <span
                            className={[
                              "inline-block min-w-6 rounded px-1.5 text-center text-xs font-semibold",
                              t.en_proporcion ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900",
                            ].join(" ")}
                          >
                            {t.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 text-acero-700">
                          {t.paneles_largo} × {t.paneles_ancho}
                        </td>
                        <td className="py-1.5 text-right font-medium text-acero-800">{t.repeticiones}</td>
                        <td className="py-1.5 text-right text-acero-600">{numero(t.proporcion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fueraDeProporcion.length > 0 && (
                  <p className="mt-3 text-xs text-amber-800">
                    Los tipos en ámbar se apartan más de{" "}
                    {numero(layout.parametros.tolerancia_proporcion * 100, 0)} % de la proporción 3 : 1.
                    Suelen ser los bloques cortos que aprovechan el final de cada franja.
                  </p>
                )}
                <dl className="mt-4 space-y-2 border-t border-acero-200 pt-3">
                  <Fila nombre="Bloque ideal" valor={`${layout.parametros.paneles_largo} × ${layout.paneles_ancho_ideal}`} />
                  <Fila nombre="Medidas en planta" valor={`${numero(layout.largo_bloque_m)} × ${numero(layout.ancho_bloque_m)} m`} />
                  <Fila nombre="Separación este-oeste" valor={`${numero(layout.separacion_este_oeste_m)} m`} />
                  <Fila nombre="Separación norte-sur" valor={`${numero(layout.separacion_norte_sur_m)} m`} />
                </dl>
              </Tarjeta>

              <Tarjeta titulo="Configuración eléctrica">
                {layout.inversores.length === 0 ? (
                  <p className="mt-2 text-sm text-acero-500">Configura los inversores en el Paso 2.</p>
                ) : (
                  <ul className="mt-3 space-y-4">
                    {layout.inversores.map((inv, i) => (
                      <li key={inv.numero}>
                        <p className="flex items-center gap-2 text-sm font-medium text-acero-800">
                          <span className={`h-2.5 w-2.5 rounded-full ${colorInversor(i).muestra}`} aria-hidden />
                          Inversor {inv.numero}
                        </p>
                        <dl className="mt-1.5 space-y-1.5">
                          {inv.strings != null && (
                            <Fila
                              nombre="Strings"
                              valor={`${inv.strings} de ${inv.paneles_por_string} paneles (rango ${inv.paneles_por_string_min}–${inv.paneles_por_string_max})`}
                            />
                          )}
                          {!!inv.paneles_sin_string && <Fila nombre="Paneles sin string completo" valor={inv.paneles_sin_string} />}
                          {inv.strings_por_mppt != null && <Fila nombre="Strings por MPPT" valor={inv.strings_por_mppt} />}
                          {inv.relacion_dc_ac != null && inv.paneles > 0 && (
                            <Fila nombre="Relación DC/AC" valor={`${numero(inv.relacion_dc_ac)} (kWp / kW)`} />
                          )}
                        </dl>
                        {inv.compatible ? (
                          <span className="mt-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                            Configuración válida
                          </span>
                        ) : (
                          <p className={["mt-1.5 text-xs", inv.compatible === false ? "text-red-700" : "text-acero-500"].join(" ")}>
                            {inv.motivo}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="mt-4 space-y-2 border-t border-acero-200 pt-3">
                  <Fila nombre="Inversores sugeridos (~400 paneles c/u)" valor={layout.inversores_sugeridos} />
                </dl>
              </Tarjeta>

              {layout.advertencias.length > 0 && (
                <ul className="space-y-2">
                  {layout.advertencias.map((a) => (
                    <li key={a} className="rounded-lg border border-solar-200 bg-solar-50 px-3 py-2 text-xs text-solar-900">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>

      <BarraPaso
        // Con cambios sin guardar, useCambiosSinGuardar pregunta antes de salir
        atras={{ etiqueta: "\u2190 Anterior", onClick: () => void navegar(rutaPaso(proyectoId, 2)) }}
        resumen={
          layout
            ? `${numero(layout.total_paneles, 0)} paneles · ${numero(layout.potencia_kwp, 1)} kWp · ${layout.bloques.length} bloques`
            : "Genera el layout para continuar"
        }
        adelante={{
          etiqueta: "Confirmar layout \u2192",
          deshabilitado: true,
          titulo: "El diagrama de confirmación (RF-05) llega en la siguiente entrega",
        }}
      />
    </div>
  );
}
