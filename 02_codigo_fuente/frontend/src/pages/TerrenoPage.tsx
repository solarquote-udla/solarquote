/**
 * Asistente, Paso 1 — Terreno (RF-01).
 *
 * Como en el prototipo: el plano a la izquierda y, a la derecha, los datos
 * del proyecto, las dimensiones del terreno y la orientación del norte.
 * Sin id en la ruta (/generar) es un proyecto nuevo: "Siguiente" lo crea,
 * guarda el terreno y pasa al Paso 2.
 *
 * Tres formas de ingresar la geometría, porque los datos llegan de formas
 * distintas según el proyecto:
 *   - Ancho y largo (el caso más común): "Actualizar plano"
 *   - Dibujar el contorno con clics sobre el plano (terrenos irregulares)
 *   - Editar las coordenadas a mano (datos de un levantamiento)
 *
 * Los caminos se definen en el Paso 3, junto al layout. Aquí solo se
 * muestran si ya existen.
 *
 * El área útil la calcula el backend al guardar (resuelve el cruce entre
 * caminos). Aquí solo se muestra el área del contorno, que es geometría
 * directa y coincide con la "bruta" del backend.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BarraPaso } from "@/components/BarraPaso";
import { EditorPoligonos, type CaminoDibujo } from "@/components/EditorPoligonos";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { rutaPaso } from "@/components/asistente";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import { listarClientes } from "@/services/clientes";
import { actualizarProyecto, crearProyecto, obtenerProyecto } from "@/services/proyectos";
import { actualizarTerreno, crearTerreno, obtenerTerreno } from "@/services/terreno";
import type { ClienteListado, Proyecto, ProyectoActualizar, Punto, Terreno } from "@/types/api";
import { formatearArea, formatearMetros, rectangulo } from "@/utils/geometria";

const BOTON =
  "rounded-lg border border-acero-300 bg-superficie px-3 py-1.5 text-sm text-acero-700 transition hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-40";
const CAMPO =
  "w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";
const ETIQUETA = "block text-xs font-medium text-acero-600";
const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

/** Orientaciones rápidas del prototipo; cualquier otro ángulo se escribe a mano. */
const ORIENTACIONES = [
  { etiqueta: "Norte", grados: 0, flecha: "↑" },
  { etiqueta: "Este", grados: 90, flecha: "→" },
];

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
  if (vertices.length < 3) return null;
  const xs = vertices.map((p) => p[0]);
  const ys = vertices.map((p) => p[1]);
  return { ancho: Math.max(...xs) - Math.min(...xs), largo: Math.max(...ys) - Math.min(...ys) };
}

/** Ancho y largo como texto para los campos, redondeados al centímetro. */
function textoDimensiones(vertices: Punto[]): { ancho: string; largo: string } {
  const ext = extension(vertices);
  return ext
    ? { ancho: String(Math.round(ext.ancho * 100) / 100), largo: String(Math.round(ext.largo * 100) / 100) }
    : { ancho: "", largo: "" };
}

/** Rectángulo con lados paralelos a los ejes: el único que "ancho × largo" describe sin perder nada. */
function esRectanguloAlineado(vertices: Punto[]): boolean {
  if (vertices.length !== 4) return false;
  const clave = (v: number) => Math.round(v * 1e6);
  const xs = new Set(vertices.map((p) => clave(p[0])));
  const ys = new Set(vertices.map((p) => clave(p[1])));
  const esquinas = new Set(vertices.map((p) => `${clave(p[0])},${clave(p[1])}`));
  return xs.size === 2 && ys.size === 2 && esquinas.size === 4;
}

/** Esquina inferior izquierda del contorno, o el origen si no hay contorno. */
function esquinaInferior(vertices: Punto[]): Punto {
  if (vertices.length === 0) return [0, 0];
  return [Math.min(...vertices.map((p) => p[0])), Math.min(...vertices.map((p) => p[1]))];
}

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

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarEnEditor = useCallback((terreno: Terreno | null) => {
    setGuardado(terreno);
    setVertices(terreno?.vertices ?? []);
    setOrientacion(terreno?.orientacion_norte != null ? String(terreno.orientacion_norte) : "");
    setNotas(terreno?.notas ?? "");
    setDimensiones(textoDimensiones(terreno?.vertices ?? []));
    const ext = extension(terreno?.vertices ?? []);
    if (ext) setLienzo({ ancho: Math.max(10, ext.ancho), alto: Math.max(10, ext.largo) });
    setBorrador([]);
    setDibujando(false);
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

  // ─── Geometría ───────────────────────────────────────

  /**
   * Única forma de cambiar el contorno: mantiene ancho y largo iguales a
   * la extensión real, para que "Actualizar plano" nunca parta de cifras
   * viejas (revisión del PR #34).
   */
  function cambiarContorno(nuevos: Punto[]) {
    setVertices(nuevos);
    setDimensiones(textoDimensiones(nuevos));
  }

  /** Ancho y largo escritos en los campos, si son válidos. */
  function dimensionesEscritas(): { ancho: number; largo: number } | null {
    const ancho = numeroOpcional(dimensiones.ancho);
    const largo = numeroOpcional(dimensiones.largo);
    return ancho && ancho > 0 && largo && largo > 0 ? { ancho, largo } : null;
  }

  /**
   * Los campos tienen un ancho y largo válidos distintos de la extensión
   * del contorno (por más de medio centímetro). Campos vacíos o inválidos
   * no cuentan: en ese caso vale lo que está dibujado.
   */
  const dimensionesPendientes = (() => {
    const escritas = dimensionesEscritas();
    if (!escritas) return false;
    const ext = extension(vertices);
    return !ext || Math.abs(escritas.ancho - ext.ancho) > 0.005 || Math.abs(escritas.largo - ext.largo) > 0.005;
  })();

  /**
   * Todo lo escrito en este paso que todavía no está en el servidor:
   * datos del proyecto, contorno, orientación, notas, ancho y largo sin
   * aplicar y un contorno a medio dibujar.
   */
  const sinGuardar =
    JSON.stringify(datos) !== JSON.stringify(proyecto ? datosDe(proyecto) : DATOS_VACIOS) ||
    terrenoCambio ||
    dimensionesPendientes ||
    (dibujando && borrador.length > 0);
  const permitirSalida = useCambiosSinGuardar(sinGuardar);

  /** Rectángulo con las dimensiones escritas, en la misma esquina que el contorno actual. */
  function rectanguloEscrito(): Punto[] | null {
    const d = dimensionesEscritas();
    if (!d) return null;
    const [x, y] = esquinaInferior(vertices);
    return rectangulo(x, y, d.ancho, d.largo);
  }

  function actualizarPlano() {
    setError(null);
    const nuevo = rectanguloEscrito();
    if (!nuevo) {
      setError("El ancho y el largo del terreno deben ser mayores que cero.");
      return;
    }
    // Un contorno irregular no se describe con ancho y largo: reemplazarlo pierde vértices
    if (
      vertices.length >= 3 &&
      !esRectanguloAlineado(vertices) &&
      !window.confirm(
        `El terreno tiene un contorno irregular de ${vertices.length} vértices. ¿Reemplazarlo por un rectángulo de ${dimensiones.ancho} × ${dimensiones.largo} m?`,
      )
    ) {
      return;
    }
    cambiarContorno(nuevo);
    // Ajusta el plano a la figura para que no quede diminuta ni cortada
    const d = dimensionesEscritas()!;
    setLienzo({ ancho: d.ancho, alto: d.largo });
    setBorrador([]);
    setDibujando(false);
  }

  function cerrarBorrador() {
    if (borrador.length < 3) return;
    cambiarContorno(borrador);
    setBorrador([]);
    setDibujando(false);
  }

  function editarVertice(indice: number, eje: 0 | 1, valor: number) {
    if (Number.isNaN(valor)) return;
    cambiarContorno(vertices.map((p, i) => (i === indice ? (eje === 0 ? [valor, p[1]] : [p[0], valor]) : p)));
  }

  // ─── Siguiente: guarda proyecto y terreno ────────────

  function validar():
    | { proyecto: ProyectoActualizar & { cliente_id?: number }; orientacion: number | null; vertices: Punto[] }
    | string {
    if (datos.nombre.trim().length < 3) return "El nombre del proyecto debe tener al menos 3 caracteres.";
    if (esNuevo && !datos.clienteId) return "Elige el cliente del proyecto.";
    const latitud = numeroOpcional(datos.latitud);
    const longitud = numeroOpcional(datos.longitud);
    if (Number.isNaN(latitud) || Number.isNaN(longitud)) {
      return "Latitud y longitud deben ser números en grados decimales (ej. 0.3517).";
    }
    if (dibujando) return "Termina o cancela el dibujo del contorno.";
    // Si escribió ancho y largo sin pulsar "Actualizar plano", se aplican al guardar
    // cuando no hay nada que perder (sin contorno o con un rectángulo); si el
    // contorno es irregular, se pide decidir antes de pisarlo.
    let contorno = vertices;
    if (dimensionesPendientes) {
      if (vertices.length >= 3 && !esRectanguloAlineado(vertices)) {
        return "Las dimensiones escritas no coinciden con el contorno irregular: pulsa «Actualizar plano» para reemplazarlo, o deja ancho y largo como estaban.";
      }
      contorno = rectanguloEscrito() ?? vertices;
    }
    if (contorno.length < 3) return "Define el terreno: ingresa ancho y largo, o dibuja su contorno.";
    const grados = numeroOpcional(orientacion);
    if (grados !== null && (Number.isNaN(grados) || grados < 0 || grados >= 360)) {
      return "La orientación del norte debe estar entre 0 y 359,99 grados.";
    }
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
    const valido = validar();
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
        {/* ─── Plano ────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {!dibujando ? (
              <button
                type="button"
                className={BOTON}
                onClick={() => {
                  setError(null);
                  setBorrador([]);
                  setDibujando(true);
                }}
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
                <button type="button" className={BOTON} onClick={() => { setBorrador([]); setDibujando(false); }}>
                  Cancelar
                </button>
              </>
            )}
            <span className="rounded-lg bg-acero-100 px-3 py-1.5 text-xs text-acero-600">
              {dibujando
                ? "Haz clic en el plano para marcar cada vértice; clic en el primero para cerrar."
                : "Ingresa ancho y largo a la derecha, o dibuja el contorno si el terreno es irregular."}
            </span>
            <label className="ml-auto flex items-center gap-2 text-sm text-acero-600">
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
            onAgregarPunto={(p) => setBorrador((b) => [...b, p])}
            onCerrarBorrador={cerrarBorrador}
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
        </section>

        {/* ─── Panel derecho ────────────────────────────── */}
        <aside className="space-y-4">
          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>DATOS DEL PROYECTO</h2>
            <div className="mt-3 space-y-3">
              <label className={ETIQUETA}>
                Nombre del proyecto *
                <input className={`mt-1 ${CAMPO}`} value={datos.nombre} maxLength={150} placeholder="Ej. San Pablo de Lago 3era Etapa" onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))} />
              </label>
              <label className={ETIQUETA}>
                Cliente *
                {esNuevo && !proyecto ? (
                  <select className={`mt-1 ${CAMPO}`} value={datos.clienteId} onChange={(e) => setDatos((d) => ({ ...d, clienteId: e.target.value }))}>
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
                {esNuevo && !proyecto && clientes.length === 0 && (
                  <span className="mt-1 block font-normal text-acero-500">No hay clientes activos. Regístralo primero en Operaciones, Clientes.</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={ETIQUETA}>
                  Proforma
                  <input className={`mt-1 ${CAMPO}`} value="" placeholder="Se asigna al cotizar" disabled />
                </label>
                <label className={ETIQUETA}>
                  Fecha
                  <input className={`mt-1 ${CAMPO}`} value={fecha} disabled />
                </label>
              </div>
              <label className={ETIQUETA}>
                Ubicación
                <input className={`mt-1 ${CAMPO}`} value={datos.ubicacion} maxLength={255} placeholder="Provincia, cantón, referencia" onChange={(e) => setDatos((d) => ({ ...d, ubicacion: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={ETIQUETA}>
                  Latitud
                  <input className={`mt-1 ${CAMPO}`} inputMode="decimal" placeholder="0.3517" value={datos.latitud} onChange={(e) => setDatos((d) => ({ ...d, latitud: e.target.value }))} />
                </label>
                <label className={ETIQUETA}>
                  Longitud
                  <input className={`mt-1 ${CAMPO}`} inputMode="decimal" placeholder="-78.1223" value={datos.longitud} onChange={(e) => setDatos((d) => ({ ...d, longitud: e.target.value }))} />
                </label>
              </div>
              {datos.latitud.trim() === "" && (
                <p className="text-xs text-amber-700">Sin latitud no se calcula la sombra entre filas ni entre bloques.</p>
              )}
            </div>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>DIMENSIONES DEL TERRENO</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className={ETIQUETA}>
                Ancho (m)
                <input className={`mt-1 ${CAMPO}`} inputMode="decimal" value={dimensiones.ancho} onChange={(e) => setDimensiones((d) => ({ ...d, ancho: e.target.value }))} />
              </label>
              <label className={ETIQUETA}>
                Largo (m)
                <input className={`mt-1 ${CAMPO}`} inputMode="decimal" value={dimensiones.largo} onChange={(e) => setDimensiones((d) => ({ ...d, largo: e.target.value }))} />
              </label>
            </div>
            <p className={`mt-3 ${ETIQUETA}`}>Área calculada</p>
            <p className="mt-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              {area !== null ? formatearArea(area) : "Sin terreno"}
            </p>
            {vertices.length >= 3 && !esRectanguloAlineado(vertices) && (
              <p className="mt-1 text-xs text-acero-500">Contorno irregular de {vertices.length} vértices; ancho y largo son su extensión.</p>
            )}
            {dimensionesPendientes && (
              <p className="mt-1 text-xs text-amber-700">
                Las dimensiones escritas no coinciden con el plano: pulsa «Actualizar plano» para aplicarlas.
              </p>
            )}
            <button type="button" className={`${BOTON} mt-3 w-full`} onClick={actualizarPlano}>
              Actualizar plano
            </button>

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

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>ORIENTACIÓN NORTE</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ORIENTACIONES.map((o) => {
                const activo = gradosOrientacion === o.grados;
                return (
                  <button
                    key={o.etiqueta}
                    type="button"
                    onClick={() => setOrientacion(String(o.grados))}
                    className={[
                      "rounded-lg border px-3 py-2 text-sm font-medium transition",
                      activo ? "border-solar-500 bg-solar-50 text-solar-700" : "border-acero-300 text-acero-700 hover:bg-acero-100",
                    ].join(" ")}
                  >
                    {o.etiqueta} {o.flecha}
                  </button>
                );
              })}
            </div>
            <label className={`mt-3 ${ETIQUETA}`}>
              Otro ángulo (°)
              <input className={`mt-1 ${CAMPO}`} type="number" min={0} max={359.99} step="0.1" placeholder="Sin definir" value={orientacion} onChange={(e) => setOrientacion(e.target.value)} />
              <span className="mt-1 block font-normal text-acero-400">Hacia dónde apunta el norte: 0 = arriba del plano, sentido horario</span>
            </label>
          </div>

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

      <BarraPaso
        atras={{
          etiqueta: "Cancelar",
          // Si hay cambios sin guardar, useCambiosSinGuardar pregunta antes de salir
          onClick: () => void navegar("/historial"),
        }}
        resumen={
          area !== null
            ? `${formatearMetros(numeroOpcional(dimensiones.ancho) || 0)} × ${formatearMetros(numeroOpcional(dimensiones.largo) || 0)} · ${formatearArea(area)}`
            : "Define el terreno para continuar"
        }
        adelante={{
          etiqueta: guardando ? "Guardando…" : "Siguiente →",
          onClick: () => void siguiente(),
          deshabilitado: guardando || dibujando,
          titulo: dibujando ? "Termina o cancela el dibujo del contorno" : undefined,
        }}
      />
    </div>
  );
}
