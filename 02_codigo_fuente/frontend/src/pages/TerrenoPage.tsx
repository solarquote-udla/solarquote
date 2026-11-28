/**
 * Asistente, Paso 1 — Terreno (RF-01).
 *
 * Como en el prototipo: el plano a la izquierda y, a la derecha, los datos
 * del proyecto, las medidas del terreno y el norte del plano.
 * Sin id en la ruta (/generar) es un proyecto nuevo: "Siguiente" lo crea,
 * guarda el terreno y pasa al Paso 2.
 *
 * Cuatro formas de ingresar la geometría, porque los datos llegan de
 * formas distintas según el proyecto:
 *   - Empezar con un rectángulo de ancho por largo (solo sin contorno)
 *   - Dibujar el contorno sobre el mapa satelital, con el largo de cada
 *     lado y ángulos de 90° (revisión del 16 de noviembre, Lenin)
 *   - Dibujar el contorno con clics sobre el plano (terrenos irregulares)
 *   - Editar las coordenadas a mano (datos de un levantamiento)
 * Con el contorno definido se editan sus lados, nunca un ancho y largo:
 * convertirlo en rectángulo pierde la forma real (Anita, 25 de noviembre).
 *
 * El norte solo se pregunta en el plano. En el mapa ya se conoce: arriba.
 *
 * Los caminos se definen en el Paso 3, junto al layout. Aquí solo se
 * muestran si ya existen.
 *
 * El área útil la calcula el backend al guardar (resuelve el cruce entre
 * caminos). Aquí solo se muestra el área del contorno, que es geometría
 * directa y coincide con la "bruta" del backend.
 */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { EditorPoligonos, type CaminoDibujo } from "@/components/EditorPoligonos";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { Campo } from "@/components/Campo";
import { FormularioCliente } from "@/components/FormularioCliente";
import { MapaUbicacion, type DibujoMapa } from "@/components/MapaUbicacion";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { mensajeDeError } from "@/services/api";
import { listarClientes } from "@/services/clientes";
import { buscarDireccion, type ResultadoDireccion } from "@/services/geocodificacion";
import { actualizarProyecto, crearProyecto, obtenerProyecto } from "@/services/proyectos";
import { actualizarTerreno, crearTerreno, obtenerTerreno } from "@/services/terreno";
import type { ClienteListado, Proyecto, ProyectoActualizar, Punto, Terreno } from "@/types/api";
import { bordeCampo } from "@/utils/campo";
import { formatearArea, formatearMetros, limitesDe, rectangulo } from "@/utils/geometria";
import {
  ajustarAngulo,
  anguloEnVertice,
  aMapa,
  aPlano,
  cambiarLargoLado,
  insertarEnMitad,
  largosDeLados,
  perimetro,
  quitarVertice,
  type Coordenadas,
} from "@/utils/terrenoMapa";

const BOTON =
  "rounded-lg border border-acero-300 bg-superficie px-3 py-1.5 text-sm text-acero-700 transition hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-40";
const CAMPO_BASE =
  "w-full rounded-lg border bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:outline-none focus:ring-1 disabled:opacity-60";
const CAMPO = `${CAMPO_BASE} ${bordeCampo()}`;
const ETIQUETA = "block text-xs font-medium text-acero-600";
const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

interface DatosProyecto {
  nombre: string;
  clienteId: string;
  ubicacion: string;
  latitud: string;
  longitud: string;
}

const DATOS_VACIOS: DatosProyecto = { nombre: "", clienteId: "", ubicacion: "", latitud: "", longitud: "" };

function datosDe(p: Proyecto): DatosProyecto {
  return {
    nombre: p.nombre,
    clienteId: String(p.cliente.id),
    ubicacion: p.ubicacion ?? "",
    latitud: p.latitud == null ? "" : String(p.latitud),
    longitud: p.longitud == null ? "" : String(p.longitud),
  };
}

/** Número desde texto con coma o punto. Vacío → null; inválido → NaN. */
function numeroOpcional(valor: string): number | null {
  const limpio = valor.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : Number.NaN;
}

type CampoPaso1 = "nombre" | "cliente" | "ancho" | "largo" | "orientacion";
type ErroresPaso1 = Partial<Record<CampoPaso1, string>>;

/** Error de una dimensión del terreno: si se escribe, debe ser mayor que cero. */
function errorDimension(valor: string): string | undefined {
  const n = numeroOpcional(valor);
  if (n === null) return undefined;
  if (Number.isNaN(n)) return "Debe ser un número en metros.";
  if (n <= 0) return "Debe ser mayor que cero.";
  return undefined;
}

/**
 * Errores de cada campo del Paso 1. Se calculan siempre; la pantalla los
 * muestra cuando el usuario deja el campo o intenta avanzar.
 */
function erroresPaso1(
  datos: DatosProyecto,
  dimensiones: { ancho: string; largo: string },
  orientacion: string,
  { exigeCliente, hayContorno }: { exigeCliente: boolean; hayContorno: boolean },
): ErroresPaso1 {
  const errores: ErroresPaso1 = {};
  const nombre = datos.nombre.trim();
  if (nombre === "") errores.nombre = "Escribe el nombre del proyecto.";
  else if (nombre.length < 3) errores.nombre = "Debe tener al menos 3 caracteres.";
  if (exigeCliente && !datos.clienteId) errores.cliente = "Elige el cliente del proyecto.";
  // Ancho y largo solo existen mientras no hay contorno
  if (!hayContorno) {
    errores.ancho = errorDimension(dimensiones.ancho);
    errores.largo = errorDimension(dimensiones.largo);
    if (!errores.ancho && dimensiones.ancho.trim() === "") errores.ancho = "Ingresa el ancho o dibuja el contorno.";
    if (!errores.largo && dimensiones.largo.trim() === "") errores.largo = "Ingresa el largo o dibuja el contorno.";
  }
  const grados = numeroOpcional(orientacion);
  if (grados !== null && (Number.isNaN(grados) || grados < 0 || grados >= 360)) {
    errores.orientacion = "Debe estar entre 0 y 359,99 grados.";
  }
  for (const campo of Object.keys(errores) as CampoPaso1[]) {
    if (errores[campo] === undefined) delete errores[campo];
  }
  return errores;
}

/** Área de un polígono simple (fórmula del área de Gauss). */
function areaPoligono(vertices: Punto[]): number {
  let doble = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    doble += x1 * y2 - x2 * y1;
  }
  return Math.abs(doble) / 2;
}

/** Extensión del contorno en x (ancho) e y (largo). */
function extension(vertices: Punto[]): { ancho: number; largo: number } | null {
  const caja = vertices.length >= 3 ? limitesDe(vertices) : null;
  return caja ? { ancho: caja.maxX - caja.minX, largo: caja.maxY - caja.minY } : null;
}

const formatoCoordenada = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 4, maximumFractionDigits: 6 });

const formatoFecha = new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });

export function TerrenoPage() {
  const { proyectoId: parametro } = useParams();
  const navegar = useNavigate();
  const esNuevo = parametro === undefined;
  const proyectoId = Number(parametro);
  const idValido = esNuevo || (Number.isInteger(proyectoId) && proyectoId > 0);

  // ─── Estado del servidor ─────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [guardado, setGuardado] = useState<Terreno | null>(null);
  const [clientes, setClientes] = useState<ClienteListado[]>([]);
  // Alta del cliente sin salir del Paso 1 (Lenin, 16 nov; backend en SQ-208)
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [clienteSinGuardar, setClienteSinGuardar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // ─── Estado de edición ───────────────────────────────
  const [datos, setDatos] = useState<DatosProyecto>(DATOS_VACIOS);
  const [vertices, setVertices] = useState<Punto[]>([]);
  const [orientacion, setOrientacion] = useState("");
  const [notas, setNotas] = useState("");
  const [dimensiones, setDimensiones] = useState({ ancho: "", largo: "" });
  const [verCoordenadas, setVerCoordenadas] = useState(false);

  // ─── Dibujo ──────────────────────────────────────────
  const [dibujando, setDibujando] = useState(false);
  const [borrador, setBorrador] = useState<Punto[]>([]);
  const [lienzo, setLienzo] = useState({ ancho: 100, alto: 60 });
  const [ajustarAlMetro, setAjustarAlMetro] = useState(true);
  // Dibujo sobre el mapa (Lenin): ajusta a 90° los lados casi rectos
  const [dibujoEnMapa, setDibujoEnMapa] = useState(false);
  const [angulosRectos, setAngulosRectos] = useState(true);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Mapa (al estilo de Smart Design) ─────────────────
  const [vista, setVista] = useState<"mapa" | "plano">("mapa");
  const [enfoque, setEnfoque] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDireccion[] | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  // Un error se muestra cuando el usuario dejó el campo o intentó avanzar:
  // marcar en rojo mientras escribe la primera letra molesta.
  const [tocados, setTocados] = useState<Partial<Record<CampoPaso1, boolean>>>({});
  const [intentoAvanzar, setIntentoAvanzar] = useState(false);

  const cargarEnEditor = useCallback((terreno: Terreno | null) => {
    setGuardado(terreno);
    setVertices(terreno?.vertices ?? []);
    setOrientacion(terreno?.orientacion_norte != null ? String(terreno.orientacion_norte) : "");
    setNotas(terreno?.notas ?? "");
    setDimensiones({ ancho: "", largo: "" });
    const ext = extension(terreno?.vertices ?? []);
    if (ext) setLienzo({ ancho: Math.max(10, ext.ancho), alto: Math.max(10, ext.largo) });
    setBorrador([]);
    setDibujando(false);
    setDibujoEnMapa(false);
  }, []);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;

    const pedidos = esNuevo
      ? Promise.all([Promise.resolve(null), Promise.resolve(null), listarClientes()])
      : Promise.all([obtenerProyecto(proyectoId), obtenerTerreno(proyectoId), Promise.resolve([])]);

    pedidos
      .then(([p, t, lista]) => {
        if (cancelado) return;
        setProyecto(p);
        setDatos(p ? datosDe(p) : DATOS_VACIOS);
        setClientes(lista);
        cargarEnEditor(t);
        // Sin terreno se empieza por el mapa, como en Smart Design; con terreno, por el plano
        setVista(t && t.vertices.length >= 3 ? "plano" : "mapa");
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
  }, [esNuevo, idValido, proyectoId, cargarEnEditor]);

  const terrenoCambio = useMemo(
    () =>
      JSON.stringify([vertices, orientacion.trim(), notas.trim()]) !==
      JSON.stringify([
        guardado?.vertices ?? [],
        guardado?.orientacion_norte != null ? String(guardado.orientacion_norte) : "",
        guardado?.notas ?? "",
      ]),
    [vertices, orientacion, notas, guardado],
  );

  const caminos: CaminoDibujo[] = useMemo(
    () => (guardado?.caminos ?? []).map((c) => ({ clave: `c${c.id}`, nombre: c.nombre, vertices: c.vertices })),
    [guardado],
  );

  const area = vertices.length >= 3 ? areaPoligono(vertices) : null;
  const gradosOrientacion = numeroOpcional(orientacion);
  const latitudNumero = numeroOpcional(datos.latitud);
  const longitudNumero = numeroOpcional(datos.longitud);
  const coordenadas = useMemo(
    () =>
      latitudNumero !== null && !Number.isNaN(latitudNumero) && longitudNumero !== null && !Number.isNaN(longitudNumero)
        ? { latitud: latitudNumero, longitud: longitudNumero }
        : null,
    [latitudNumero, longitudNumero],
  );

  const errores = erroresPaso1(datos, dimensiones, orientacion, {
    exigeCliente: esNuevo && !proyecto,
    hayContorno: vertices.length >= 3,
  });
  const visible = (campo: CampoPaso1) => (tocados[campo] || intentoAvanzar ? errores[campo] : undefined);
  const claseCampo = (campo: CampoPaso1) => `mt-1 ${CAMPO_BASE} ${bordeCampo(visible(campo))}`;
  const tocar = (campo: CampoPaso1) => () => setTocados((t) => ({ ...t, [campo]: true }));

  // ─── Geometría ───────────────────────────────────────

  /** Única forma de cambiar el contorno. */
  function cambiarContorno(nuevos: Punto[]) {
    setVertices(nuevos);
  }

  /** Ancho y largo escritos en los campos, si son válidos. */
  function dimensionesEscritas(): { ancho: number; largo: number } | null {
    const ancho = numeroOpcional(dimensiones.ancho);
    const largo = numeroOpcional(dimensiones.largo);
    return ancho && ancho > 0 && largo && largo > 0 ? { ancho, largo } : null;
  }

  /** Sin contorno, ancho y largo válidos escritos que todavía no forman el rectángulo. */
  const dimensionesPendientes = vertices.length < 3 && dimensionesEscritas() !== null;

  /**
   * Todo lo escrito en este paso que todavía no está en el servidor:
   * datos del proyecto, contorno, orientación, notas, un rectángulo escrito
   * sin crear y un contorno a medio dibujar.
   */
  const sinGuardar =
    JSON.stringify(datos) !== JSON.stringify(proyecto ? datosDe(proyecto) : DATOS_VACIOS) ||
    terrenoCambio ||
    dimensionesPendientes ||
    (dibujando && borrador.length > 0) ||
    (nuevoCliente && clienteSinGuardar);
  const permitirSalida = useCambiosSinGuardar(sinGuardar);
  const unaVez = useAccionUnica();

  /** Rectángulo con las dimensiones escritas, con la esquina en el punto de ubicación. */
  function rectanguloEscrito(): Punto[] | null {
    const d = dimensionesEscritas();
    return d ? rectangulo(0, 0, d.ancho, d.largo) : null;
  }

  /** Arma el contorno con el ancho y el largo escritos; después se editan los lados. */
  function crearRectangulo() {
    setError(null);
    const nuevo = rectanguloEscrito();
    const d = dimensionesEscritas();
    if (!nuevo || !d) {
      setTocados((t) => ({ ...t, ancho: true, largo: true }));
      return;
    }
    cambiarContorno(nuevo);
    // Ajusta el plano a la figura para que no quede diminuta ni cortada
    setLienzo({ ancho: d.ancho, alto: d.largo });
    setDimensiones({ ancho: "", largo: "" });
    setBorrador([]);
    setDibujando(false);
  }

  function empezarDibujo(enMapa: boolean) {
    setError(null);
    setBorrador([]);
    setDibujando(true);
    setDibujoEnMapa(enMapa);
  }

  function cancelarDibujo() {
    setBorrador([]);
    setDibujando(false);
    setDibujoEnMapa(false);
  }

  /** Agrega un vértice al borrador, ajustado a 90° si corresponde. */
  function agregarAlBorrador(p: Punto) {
    setBorrador((b) => [...b, angulosRectos ? ajustarAngulo(b[b.length - 2], b[b.length - 1], p) : p]);
  }

  function cerrarBorrador() {
    if (borrador.length < 3) return;
    cambiarContorno(borrador);
    const ext = extension(borrador);
    if (ext) setLienzo({ ancho: Math.max(10, ext.ancho), alto: Math.max(10, ext.largo) });
    // Dibujado sobre el mapa, el norte se conoce: está arriba
    if (dibujoEnMapa && orientacion.trim() === "") setOrientacion("0");
    setBorrador([]);
    setDibujando(false);
    setDibujoEnMapa(false);
  }

  // ─── Terreno sobre el mapa ───────────────────────────
  // El contorno se mide en metros desde el punto de ubicación, con la
  // orientación del norte del terreno (0 si no está definida).

  const norte = gradosOrientacion !== null && !Number.isNaN(gradosOrientacion) ? gradosOrientacion : 0;

  function clicDibujoMapa(c: Coordenadas) {
    if (!coordenadas) {
      // Sin ubicación, la primera esquina del terreno pasa a ser el punto
      setDatos((d) => ({ ...d, latitud: String(c.latitud), longitud: String(c.longitud) }));
      setBorrador([[0, 0]]);
      return;
    }
    agregarAlBorrador(aPlano(coordenadas, c, norte));
  }

  const dibujoMapa: DibujoMapa | undefined = useMemo(() => {
    const aGeo = (p: Punto) => (coordenadas ? aMapa(coordenadas, p, norte) : null);
    const geo = (puntos: Punto[]) => (coordenadas ? puntos.map((p) => aGeo(p) as Coordenadas) : []);
    const etiquetasDe = (puntos: Punto[], cerrado: boolean) => {
      const largos = largosDeLados(puntos);
      return (cerrado ? largos : largos.slice(0, -1)).map(formatearMetros);
    };
    return {
      contorno: vertices.length >= 3 ? geo(vertices) : [],
      etiquetas: etiquetasDe(vertices, true),
      caminos: caminos.map((c) => geo(c.vertices)),
      borrador: geo(borrador),
      etiquetasBorrador: etiquetasDe(borrador, false),
      dibujando: dibujando && dibujoEnMapa,
      vistaPrevia: (c, sinAjuste) => {
        if (!coordenadas || borrador.length === 0) return null;
        const ultimo = borrador[borrador.length - 1];
        const crudo = aPlano(coordenadas, c, norte);
        const p = angulosRectos && !sinAjuste ? ajustarAngulo(borrador[borrador.length - 2], ultimo, crudo) : crudo;
        return { punto: aMapa(coordenadas, p, norte), etiqueta: formatearMetros(Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1])) };
      },
      onClicDibujo: clicDibujoMapa,
      onCerrarBorrador: cerrarBorrador,
      onMoverVertice: (i, c) => {
        if (coordenadas) cambiarContorno(vertices.map((p, k) => (k === i ? aPlano(coordenadas, c, norte) : p)));
      },
      onInsertarVertice: (i) => cambiarContorno(insertarEnMitad(vertices, i)),
      onQuitarVertice: (i) => cambiarContorno(quitarVertice(vertices, i)),
    };
    // Las funciones de arriba solo leen este mismo estado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordenadas, norte, vertices, caminos, borrador, dibujando, dibujoEnMapa, angulosRectos, orientacion]);

  function editarVertice(indice: number, eje: 0 | 1, valor: number) {
    if (Number.isNaN(valor)) return;
    cambiarContorno(vertices.map((p, i) => (i === indice ? (eje === 0 ? [valor, p[1]] : [p[0], valor]) : p)));
  }

  // ─── Búsqueda de dirección ───────────────────────────

  async function buscar() {
    const texto = datos.ubicacion.trim();
    setErrorBusqueda(null);
    setResultados(null);
    if (texto.length < 3) {
      setErrorBusqueda("Escribe al menos 3 letras de la dirección o el lugar.");
      return;
    }
    setBuscando(true);
    try {
      const encontrados = await buscarDireccion(texto);
      if (encontrados.length === 0) setErrorBusqueda("No se encontró esa dirección. Prueba con la ciudad o el cantón.");
      setResultados(encontrados);
    } catch {
      setErrorBusqueda("No se pudo buscar la dirección. Marca el punto directamente en el mapa.");
    } finally {
      setBuscando(false);
    }
  }

  function elegirResultado(r: ResultadoDireccion) {
    setDatos((d) => ({
      ...d,
      ubicacion: r.nombre.slice(0, 255),
      latitud: String(r.latitud),
      longitud: String(r.longitud),
    }));
    setResultados(null);
    setVista("mapa");
    setEnfoque((n) => n + 1);
  }

  // ─── Siguiente: guarda proyecto y terreno ────────────

  function validar():
    | { proyecto: ProyectoActualizar & { cliente_id?: number }; orientacion: number | null; vertices: Punto[] }
    | string
    | null {
    // Los errores de campo se muestran junto a cada campo, sin mensaje general
    if (Object.keys(errores).length > 0) return null;
    const latitud = numeroOpcional(datos.latitud);
    const longitud = numeroOpcional(datos.longitud);
    if (dibujando) return "Termina o cancela el dibujo del contorno.";
    // Sin contorno, el ancho y el largo escritos forman el rectángulo al guardar
    const contorno = dimensionesPendientes ? (rectanguloEscrito() ?? vertices) : vertices;
    if (contorno.length < 3) return "Define el terreno: ingresa ancho y largo, o dibuja su contorno.";
    const grados = numeroOpcional(orientacion);
    return {
      proyecto: {
        nombre: datos.nombre.trim(),
        ubicacion: datos.ubicacion.trim() || null,
        latitud,
        longitud,
      },
      orientacion: grados,
      vertices: contorno,
    };
  }

  async function siguiente() {
    setError(null);
    setIntentoAvanzar(true);
    // El norte solo se edita en el plano: si tiene un error, se lleva ahí
    if (errores.orientacion) setVista("plano");
    const valido = validar();
    if (valido === null) return;
    if (typeof valido === "string") {
      setError(valido);
      return;
    }

    setGuardando(true);
    try {
      let actual = proyecto;

      if (!actual) {
        actual = await crearProyecto({
          nombre: valido.proyecto.nombre!,
          cliente_id: Number(datos.clienteId),
          ubicacion: valido.proyecto.ubicacion ?? null,
          latitud: valido.proyecto.latitud ?? null,
          longitud: valido.proyecto.longitud ?? null,
          notas: null,
        });
        // Queda en el estado: si el terreno falla, un reintento no duplica el proyecto
        setProyecto(actual);
      } else {
        const original = datosDe(actual);
        const cambios: ProyectoActualizar = {};
        if (datos.nombre.trim() !== original.nombre) cambios.nombre = valido.proyecto.nombre;
        if (datos.ubicacion.trim() !== original.ubicacion) cambios.ubicacion = valido.proyecto.ubicacion;
        if (datos.latitud.trim() !== original.latitud) cambios.latitud = valido.proyecto.latitud;
        if (datos.longitud.trim() !== original.longitud) cambios.longitud = valido.proyecto.longitud;
        if (Object.keys(cambios).length > 0) {
          actual = await actualizarProyecto(actual.id, cambios);
          setProyecto(actual);
        }
      }

      const datosTerreno = { vertices: valido.vertices, orientacion_norte: valido.orientacion, notas: notas.trim() || null };
      const terrenoDistinto =
        terrenoCambio || JSON.stringify(valido.vertices) !== JSON.stringify(guardado?.vertices ?? []);
      if (!guardado) {
        cargarEnEditor(await crearTerreno(actual.id, { ...datosTerreno, caminos: [] }));
      } else if (terrenoDistinto) {
        await actualizarTerreno(actual.id, datosTerreno);
        cargarEnEditor(await obtenerTerreno(actual.id));
      }

      // Recién guardado: esta navegación no debe pedir confirmación
      permitirSalida();
      void navegar(rutaPaso(actual.id, 2));
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar el proyecto"));
    } finally {
      setGuardando(false);
    }
  }

  // ─── Render ──────────────────────────────────────────

  if (!idValido) {
    return <p className="text-sm text-red-600">El identificador del proyecto no es válido.</p>;
  }
  if (cargando) {
    return <p className="text-sm text-acero-500">Cargando…</p>;
  }
  if (errorCarga) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {errorCarga}
      </div>
    );
  }

  const clienteActual = proyecto?.cliente;
  const fecha = formatoFecha.format(proyecto ? new Date(proyecto.created_at) : new Date());

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoProyecto paso={1} proyecto={proyecto} />

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ─── Mapa y plano ─────────────────────────────── */}
        <section>
          <div className="mb-3 inline-flex rounded-lg border border-acero-300 p-0.5" role="tablist" aria-label="Vista del terreno">
            {(["mapa", "plano"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                disabled={dibujando}
                title={dibujando ? "Termina o cancela el dibujo del contorno" : undefined}
                onClick={() => setVista(v)}
                className={[
                  "rounded-md px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed",
                  vista === v ? "bg-solar-500 text-acero-50" : "text-acero-600 hover:bg-acero-100",
                ].join(" ")}
              >
                {v === "mapa" ? "Mapa" : "Plano"}
              </button>
            ))}
          </div>

          {vista === "mapa" ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {!dibujando ? (
                  <button type="button" className={BOTON} onClick={() => empezarDibujo(true)}>
                    {vertices.length ? "Redibujar terreno en el mapa" : "Dibujar terreno en el mapa"}
                  </button>
                ) : (
                  <>
                    <button type="button" className={BOTON} onClick={() => setBorrador((b) => b.slice(0, -1))} disabled={borrador.length === 0}>
                      Deshacer punto
                    </button>
                    <button type="button" className={BOTON} onClick={cerrarBorrador} disabled={borrador.length < 3}>
                      Cerrar contorno
                    </button>
                    <button type="button" className={BOTON} onClick={cancelarDibujo}>
                      Cancelar dibujo
                    </button>
                  </>
                )}
                <label className="ml-auto flex items-center gap-2 text-sm text-acero-600">
                  <input type="checkbox" checked={angulosRectos} onChange={(e) => setAngulosRectos(e.target.checked)} className="accent-solar-500" />
                  Ajustar a 90°
                </label>
              </div>
              <MapaUbicacion
                valor={coordenadas}
                enfoque={enfoque}
                alto="h-[32rem]"
                dibujo={dibujoMapa}
                onCambio={({ latitud, longitud }) =>
                  setDatos((d) => ({ ...d, latitud: String(latitud), longitud: String(longitud) }))
                }
              />
              <p className="mt-2 text-xs text-acero-500">
                {dibujando
                  ? "Haz clic en cada esquina del terreno; clic en la primera para cerrar. Los lados casi rectos se ajustan a 90°."
                  : vertices.length >= 3
                    ? "Arrastra un vértice para moverlo, haz doble clic para quitarlo o clic en el punto blanco de un lado para agregar uno. El punto rojo ubica el terreno: al arrastrarlo, el contorno se mueve con él. El norte está arriba."
                    : "Busca la dirección a la derecha o haz clic sobre el terreno; el punto se puede arrastrar. Luego dibuja el terreno en el mapa. El norte está arriba."}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {!dibujando ? (
                  <button
                    type="button"
                    className={BOTON}
                    onClick={() => empezarDibujo(false)}
                  >
                    {vertices.length ? "Redibujar contorno" : "Dibujar contorno"}
                  </button>
                ) : (
                  <>
                    <button type="button" className={BOTON} onClick={() => setBorrador((b) => b.slice(0, -1))} disabled={borrador.length === 0}>
                      Deshacer punto
                    </button>
                    <button type="button" className={BOTON} onClick={cerrarBorrador} disabled={borrador.length < 3}>
                      Cerrar contorno
                    </button>
                    <button type="button" className={BOTON} onClick={cancelarDibujo}>
                      Cancelar dibujo
                    </button>
                  </>
                )}
                <span className="rounded-lg bg-acero-100 px-3 py-1.5 text-xs text-acero-600">
                  {dibujando
                    ? "Haz clic en el plano para marcar cada vértice; clic en el primero para cerrar."
                    : vertices.length >= 3
                      ? "Corrige el largo de los lados a la derecha o redibuja el contorno."
                      : "Empieza con un rectángulo a la derecha o dibuja el contorno con clics."}
                </span>
                <label className="ml-auto flex items-center gap-2 text-sm text-acero-600">
                  <input type="checkbox" checked={angulosRectos} onChange={(e) => setAngulosRectos(e.target.checked)} className="accent-solar-500" />
                  Ajustar a 90°
                </label>
                <label className="flex items-center gap-2 text-sm text-acero-600">
                  <input type="checkbox" checked={ajustarAlMetro} onChange={(e) => setAjustarAlMetro(e.target.checked)} className="accent-solar-500" />
                  Ajustar al metro
                </label>
              </div>

              <EditorPoligonos
                terreno={dibujando ? [] : vertices}
                caminos={caminos}
                borrador={borrador}
                dibujando={dibujando ? "terreno" : null}
                lienzo={lienzo}
                pasoAjuste={ajustarAlMetro ? 1 : null}
                onAgregarPunto={agregarAlBorrador}
                onCerrarBorrador={cerrarBorrador}
                norte={gradosOrientacion !== null && !Number.isNaN(gradosOrientacion) ? gradosOrientacion : null}
              />

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-acero-500">
                <span>Plano mínimo</span>
                {(["ancho", "alto"] as const).map((eje, i) => (
                  <span key={eje} className="flex items-center gap-2">
                    {i === 1 && <span>×</span>}
                    <input
                      type="number"
                      min={10}
                      className="w-20 rounded border border-acero-300 bg-acero-50 px-1.5 py-0.5"
                      value={lienzo[eje]}
                      aria-label={`Plano mínimo, ${eje}`}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (v > 0) setLienzo((l) => ({ ...l, [eje]: v }));
                      }}
                    />
                  </span>
                ))}
                <span>m: amplíalo para dibujar terrenos grandes con clics</span>
                {caminos.length > 0 && <span className="ml-auto">Los caminos se editan en el Paso 3.</span>}
              </div>
            </>
          )}
        </section>

        {/* ─── Panel derecho ────────────────────────────── */}
        <aside className="space-y-4 self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>DATOS DEL PROYECTO</h2>
            <div className="mt-3 space-y-3">
              <Campo etiqueta="Nombre del proyecto" obligatorio error={visible("nombre")}>
                <input className={claseCampo("nombre")} value={datos.nombre} maxLength={150} placeholder="Ej. San Pablo de Lago 3era Etapa" onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))} onBlur={tocar("nombre")} />
              </Campo>
              <label className={ETIQUETA}>
                Cliente
                <span className="text-red-600" aria-hidden="true">{" *"}</span>
                {esNuevo && !proyecto ? (
                  <select className={claseCampo("cliente")} value={datos.clienteId} onChange={(e) => setDatos((d) => ({ ...d, clienteId: e.target.value }))} onBlur={tocar("cliente")} aria-invalid={visible("cliente") ? true : undefined}>
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={`mt-1 ${CAMPO}`} value={clienteActual?.nombre ?? ""} disabled title="Un proyecto conserva su cliente" />
                )}
                {visible("cliente") && <span className="mt-1 block font-normal text-red-600">{visible("cliente")}</span>}
                {esNuevo && !proyecto && clientes.length === 0 && (
                  <span className="mt-1 block font-normal text-acero-500">Todavía no hay clientes: regístralo con «Nuevo cliente».</span>
                )}
              </label>
              {esNuevo && !proyecto && (
                <button type="button" className="text-xs font-medium text-solar-700 hover:underline" onClick={() => setNuevoCliente(true)}>
                  + Nuevo cliente
                </button>
              )}
              <label className={ETIQUETA}>
                Fecha
                <input className={`mt-1 ${CAMPO}`} value={fecha} disabled />
              </label>
              <div>
                <label className={ETIQUETA} htmlFor="direccion-proyecto">
                  Dirección o lugar
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="direccion-proyecto"
                    className={CAMPO}
                    value={datos.ubicacion}
                    maxLength={255}
                    placeholder="Ej. Ibarra, Imbabura"
                    onChange={(e) => setDatos((d) => ({ ...d, ubicacion: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void buscar();
                      }
                    }}
                  />
                  <button type="button" className={BOTON} onClick={() => void buscar()} disabled={buscando}>
                    {buscando ? "Buscando…" : "Buscar"}
                  </button>
                </div>
                {errorBusqueda && <p className="mt-1 text-xs text-red-600">{errorBusqueda}</p>}
                {resultados && resultados.length > 0 && (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-acero-200" aria-label="Resultados de la búsqueda">
                    {resultados.map((r) => (
                      <li key={`${r.latitud},${r.longitud},${r.nombre}`}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs text-acero-700 hover:bg-acero-100"
                          onClick={() => elegirResultado(r)}
                        >
                          {r.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-acero-400">Búsqueda: © colaboradores de OpenStreetMap</p>
                {coordenadas ? (
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs text-acero-500">
                    <span data-testid="coordenadas">
                      {formatoCoordenada.format(coordenadas.latitud)}, {formatoCoordenada.format(coordenadas.longitud)}
                    </span>
                    <span className="flex gap-3">
                      {vista !== "mapa" && (
                        <button type="button" className="text-solar-700 hover:underline" onClick={() => setVista("mapa")}>
                          Ver en el mapa
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-acero-500 hover:text-red-600"
                        onClick={() => setDatos((d) => ({ ...d, latitud: "", longitud: "" }))}
                      >
                        Quitar ubicación
                      </button>
                    </span>
                  </p>
                ) : latitudNumero !== null && !Number.isNaN(latitudNumero) ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Tiene latitud {formatoCoordenada.format(latitudNumero)} pero falta el punto en el mapa. Búscalo o márcalo para completar la ubicación.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">Sin ubicación, el terreno no se puede ver ni dibujar en el mapa.</p>
                )}
              </div>
            </div>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>MEDIDAS DEL TERRENO</h2>
            {vertices.length < 3 ? (
              <>
                <p className="mt-3 text-xs text-acero-500">
                  Dibuja el terreno en el mapa o en el plano, o empieza con un rectángulo y luego corrige sus lados.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Campo etiqueta="Ancho (m)" obligatorio error={visible("ancho")}>
                    <input className={claseCampo("ancho")} inputMode="decimal" value={dimensiones.ancho} onChange={(e) => setDimensiones((d) => ({ ...d, ancho: e.target.value }))} onBlur={tocar("ancho")} />
                  </Campo>
                  <Campo etiqueta="Largo (m)" obligatorio error={visible("largo")}>
                    <input className={claseCampo("largo")} inputMode="decimal" value={dimensiones.largo} onChange={(e) => setDimensiones((d) => ({ ...d, largo: e.target.value }))} onBlur={tocar("largo")} />
                  </Campo>
                </div>
                <button type="button" className={`${BOTON} mt-3 w-full`} onClick={crearRectangulo}>
                  Crear rectángulo
                </button>
              </>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-3" aria-label="Resumen del terreno">
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <dt className="text-[11px] text-green-700">Área</dt>
                    <dd className="text-sm font-medium text-green-800" data-testid="area-terreno">
                      {formatearArea(area ?? 0)}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-acero-200 bg-acero-50 px-3 py-2">
                    <dt className="text-[11px] text-acero-500">Perímetro</dt>
                    <dd className="text-sm font-medium text-acero-800" data-testid="perimetro-terreno">
                      {formatearMetros(perimetro(vertices))}
                    </dd>
                  </div>
                </dl>
                <p className={`mt-4 ${ETIQUETA}`}>Lados ({vertices.length})</p>
                <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto" aria-label="Medidas de los lados">
                  {largosDeLados(vertices).map((largo, i) => (
                    <LadoEditable
                      key={`${i}-${largo.toFixed(2)}`}
                      indice={i}
                      largo={largo}
                      recto={Math.abs(anguloEnVertice(vertices, (i + 1) % vertices.length) - 90) < 0.5}
                      onCambiar={(nuevo) => cambiarContorno(cambiarLargoLado(vertices, i, nuevo))}
                    />
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-acero-400">
                  Al cambiar un lado, el lado siguiente se corre sin deformarse y solo se ajusta el que viene después. Un rectángulo sigue siendo rectángulo.
                </p>
              </>
            )}

            <button type="button" className="mt-3 text-xs font-medium text-solar-700 hover:underline" onClick={() => setVerCoordenadas((v) => !v)} aria-expanded={verCoordenadas}>
              {verCoordenadas ? "Ocultar coordenadas" : `Editar coordenadas (${vertices.length} vértices)`}
            </button>
            {verCoordenadas && vertices.length > 0 && (
              <div className="mt-2 max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-acero-400">
                      <th className="w-6 text-left font-normal">#</th>
                      <th className="text-left font-normal">x (m)</th>
                      <th className="text-left font-normal">y (m)</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {vertices.map(([x, y], i) => (
                      <tr key={i}>
                        <td className="text-xs text-acero-400">{i + 1}</td>
                        {[x, y].map((valor, eje) => (
                          <td key={eje} className="py-0.5 pr-1">
                            <input type="number" step="0.01" className={CAMPO} value={valor} onChange={(e) => editarVertice(i, eje as 0 | 1, e.target.valueAsNumber)} aria-label={`Vértice ${i + 1}, ${eje === 0 ? "x" : "y"}`} />
                          </td>
                        ))}
                        <td>
                          <button type="button" className="text-acero-400 hover:text-red-600 disabled:opacity-30" onClick={() => cambiarContorno(vertices.filter((_, j) => j !== i))} disabled={vertices.length <= 3} aria-label={`Quitar vértice ${i + 1}`}>
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {vista === "plano" && (
            <div className={TARJETA}>
              <h2 className={TITULO_TARJETA}>NORTE DEL PLANO</h2>
              <p className="mt-2 text-sm text-acero-700">¿Hacia dónde apunta el norte en tu plano?</p>
              <div className="mt-3 flex items-start gap-4">
                <Brujula
                  grados={gradosOrientacion !== null && !Number.isNaN(gradosOrientacion) ? gradosOrientacion : null}
                  onCambiar={(g) => {
                    setOrientacion(String(g));
                    setTocados((t) => ({ ...t, orientacion: true }));
                  }}
                />
                <Campo className="flex-1" etiqueta="Grados (°)" error={visible("orientacion")} ayuda="0° es hacia arriba del plano y aumenta en sentido horario: 90° es hacia la derecha.">
                  <input className={claseCampo("orientacion")} inputMode="decimal" placeholder="Sin definir" value={orientacion} onChange={(e) => setOrientacion(e.target.value)} onBlur={tocar("orientacion")} />
                </Campo>
              </div>
              <p className="mt-2 text-[11px] text-acero-400">
                Haz clic en el círculo para apuntar la flecha. Si dibujaste el terreno en el mapa, déjalo en 0°: ahí el norte ya está arriba.
              </p>
            </div>
          )}

          <div className={TARJETA}>
            <label className={ETIQUETA}>
              Notas del terreno
              <textarea className={`mt-1 ${CAMPO}`} rows={2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
            {guardado && (
              <dl className="mt-3 space-y-1 border-t border-acero-200 pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-acero-500">Área útil guardada</dt>
                  <dd className="font-medium text-solar-700">{formatearArea(guardado.areas.area_util)}</dd>
                </div>
                {guardado.areas.area_caminos > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-acero-500">Caminos</dt>
                    <dd className="text-acero-700">− {formatearArea(guardado.areas.area_caminos)}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </aside>
      </div>

      {nuevoCliente && (
        <div
          className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-acero-900/50 p-4 sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo cliente"
        >
          <div className="w-full max-w-2xl">
            <FormularioCliente
              cliente={null}
              onCambiosSinGuardar={setClienteSinGuardar}
              onCancelar={() => {
                setNuevoCliente(false);
                setClienteSinGuardar(false);
              }}
              onGuardado={(c) => {
                setClientes((lista) =>
                  [...lista.filter((x) => x.id !== c.id), { id: c.id, nombre: c.nombre, identificacion: c.identificacion, activo: c.activo }].sort((a, b) =>
                    a.nombre.localeCompare(b.nombre),
                  ),
                );
                setDatos((d) => ({ ...d, clienteId: String(c.id) }));
                setNuevoCliente(false);
                setClienteSinGuardar(false);
              }}
            />
          </div>
        </div>
      )}

      <BarraPaso
        atras={{
          etiqueta: "Cancelar",
          // Si hay cambios sin guardar, useCambiosSinGuardar pregunta antes de salir
          onClick: () => void navegar("/historial"),
        }}
        resumen={
          area !== null
            ? `${vertices.length} lados · ${formatearMetros(perimetro(vertices))} de perímetro · ${formatearArea(area)}`
            : "Define el terreno para continuar"
        }
        adelante={{
          etiqueta: guardando ? "Guardando…" : "Siguiente →",
          onClick: () => void unaVez("siguiente", siguiente),
          deshabilitado: guardando || dibujando,
          titulo: dibujando ? "Termina o cancela el dibujo del contorno" : undefined,
        }}
      />
    </div>
  );
}

/**
 * Un lado del contorno con su largo editable. Aplica el cambio al salir
 * del campo o con Enter, no en cada tecla: escribir "4" camino a "45"
 * no debe deformar el terreno.
 */
function LadoEditable({
  indice,
  largo,
  recto,
  onCambiar,
}: {
  indice: number;
  largo: number;
  recto: boolean;
  onCambiar: (largo: number) => void;
}) {
  const inicial = String(Math.round(largo * 100) / 100);
  const [texto, setTexto] = useState(inicial);
  const valor = Number(texto.replace(",", "."));
  const invalido = texto.trim() === "" || !Number.isFinite(valor) || valor <= 0;

  function aplicar() {
    if (invalido) {
      setTexto(inicial);
      return;
    }
    if (Math.abs(valor - largo) > 0.005) onCambiar(valor);
  }

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-xs text-acero-500">Lado {indice + 1}</span>
      <input
        className={`w-full rounded-lg border bg-acero-50 px-2 py-1 text-sm text-acero-900 focus:outline-none focus:ring-1 ${bordeCampo(invalido ? "invalido" : undefined)}`}
        inputMode="decimal"
        value={texto}
        aria-label={`Largo del lado ${indice + 1} (m)`}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
      />
      <span className="w-6 shrink-0 text-xs text-acero-400">m</span>
      <span className="w-8 shrink-0 text-[11px] text-acero-400" title={recto ? "Ángulo recto con el lado siguiente" : undefined}>
        {recto ? "90°" : ""}
      </span>
    </li>
  );
}

/**
 * Flecha del norte del plano. Un clic en el círculo la apunta hacia ese
 * lado; con el teclado, las flechas la giran de 5 en 5 grados.
 */
function Brujula({ grados, onCambiar }: { grados: number | null; onCambiar: (grados: number) => void }) {
  const normalizar = (g: number) => Math.round((((g % 360) + 360) % 360) * 100) / 100;

  function clic(e: MouseEvent<SVGSVGElement>) {
    const caja = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (caja.left + caja.width / 2);
    const dy = e.clientY - (caja.top + caja.height / 2);
    if (dx === 0 && dy === 0) return;
    onCambiar(normalizar(Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)));
  }

  function tecla(e: KeyboardEvent<SVGSVGElement>) {
    const paso = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
    if (paso === undefined) return;
    e.preventDefault();
    onCambiar(normalizar((grados ?? 0) + paso));
  }

  return (
    <svg
      viewBox="-30 -30 60 60"
      className="h-24 w-24 shrink-0 cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-solar-500"
      role="slider"
      tabIndex={0}
      aria-label="Flecha del norte"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={grados ?? undefined}
      aria-valuetext={grados == null ? "Sin definir" : `${grados}°`}
      onClick={clic}
      onKeyDown={tecla}
    >
      <circle r="28" className="fill-acero-50 stroke-acero-300" strokeWidth="1" />
      {[0, 90, 180, 270].map((g) => (
        <line key={g} x1="0" y1="-28" x2="0" y2="-24" className="stroke-acero-400" strokeWidth="1" transform={`rotate(${g})`} />
      ))}
      <g transform={`rotate(${grados ?? 0})`}>
        <polygon points="0,-15 6,7 0,3 -6,7" className={grados == null ? "fill-acero-400" : "fill-red-600"} />
        <text y="-17" textAnchor="middle" className={grados == null ? "fill-acero-500 text-[8px] font-bold" : "fill-red-700 text-[8px] font-bold"}>
          {grados == null ? "N?" : "N"}
        </text>
      </g>
    </svg>
  );
}
