/**
 * Definición del terreno y sus caminos — RF-01.
 *
 * Tres formas de ingresar la geometría, porque los datos llegan de
 * formas distintas según el proyecto:
 *   - Dibujar con clics sobre el plano (croquis rápido)
 *   - Rectángulo por largo y ancho (el caso más común)
 *   - Editar las coordenadas a mano (datos de un levantamiento)
 *
 * Las áreas se muestran solo después de guardar: las calcula el backend,
 * que resuelve correctamente el cruce entre caminos. Mostrar aquí un
 * cálculo propio podría contradecir la cifra oficial.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EditorPoligonos, type CaminoDibujo } from "@/components/EditorPoligonos";
import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { mensajeDeError } from "@/services/api";
import { obtenerProyecto } from "@/services/proyectos";
import {
  actualizarTerreno,
  agregarCamino,
  crearTerreno,
  eliminarCamino,
  obtenerTerreno,
} from "@/services/terreno";
import {
  ETIQUETAS_TIPO_CAMINO,
  TipoCamino,
  type Proyecto,
  type Punto,
  type Terreno,
} from "@/types/api";
import { formatearArea, rectangulo } from "@/utils/geometria";

interface CaminoEditable extends CaminoDibujo {
  /** `null` mientras el camino no se ha guardado en el servidor. */
  id: number | null;
  tipo: TipoCamino;
}

type Modo = "terreno" | "camino" | null;

const BOTON =
  "rounded-lg border border-acero-300 bg-white px-3 py-1.5 text-sm text-acero-700 transition hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-40";
const BOTON_PRIMARIO =
  "rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50";
const CAMPO =
  "w-full rounded-lg border border-acero-300 px-2.5 py-1.5 text-sm focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";

/** Forma comparable del estado, para detectar cambios sin guardar. */
function huella(
  vertices: Punto[],
  caminos: { id: number | null; nombre: string | null; tipo: TipoCamino; vertices: Punto[] }[],
  orientacion: string,
  notas: string,
): string {
  return JSON.stringify({
    v: vertices,
    c: caminos.map((c) => [c.id, c.nombre, c.tipo, c.vertices]),
    o: orientacion.trim(),
    n: notas.trim(),
  });
}

export function TerrenoPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;

  // ─── Estado del servidor ─────────────────────────────
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [guardado, setGuardado] = useState<Terreno | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // ─── Estado de edición ───────────────────────────────
  const [vertices, setVertices] = useState<Punto[]>([]);
  const [caminos, setCaminos] = useState<CaminoEditable[]>([]);
  const [orientacion, setOrientacion] = useState("");
  const [notas, setNotas] = useState("");

  // ─── Dibujo ──────────────────────────────────────────
  const [modo, setModo] = useState<Modo>(null);
  const [borrador, setBorrador] = useState<Punto[]>([]);
  const [lienzo, setLienzo] = useState({ ancho: 100, alto: 60 });
  const [ajustarAlMetro, setAjustarAlMetro] = useState(true);
  const [nuevoCamino, setNuevoCamino] = useState({ nombre: "", tipo: TipoCamino.INTERNO as TipoCamino });

  // ─── Atajos de rectángulo ────────────────────────────
  const [rectTerreno, setRectTerreno] = useState({ largo: "", ancho: "" });
  const [rectCamino, setRectCamino] = useState({ x: "0", y: "0", largo: "", ancho: "" });

  // ─── Resultado de acciones ───────────────────────────
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Vuelca un terreno del servidor al estado de edición. */
  const cargarEnEditor = useCallback((terreno: Terreno | null) => {
    setGuardado(terreno);
    setVertices(terreno?.vertices ?? []);
    setCaminos(
      (terreno?.caminos ?? []).map((c) => ({
        clave: `c${c.id}`,
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        vertices: c.vertices,
      })),
    );
    setOrientacion(terreno?.orientacion_norte != null ? String(terreno.orientacion_norte) : "");
    setNotas(terreno?.notas ?? "");
    setBorrador([]);
    // Un proyecto sin terreno abre directamente en modo dibujo
    setModo(terreno ? null : "terreno");
  }, []);

  useEffect(() => {
    if (!idValido) return;

    let cancelado = false;

    Promise.all([obtenerProyecto(proyectoId), obtenerTerreno(proyectoId)])
      .then(([p, t]) => {
        if (cancelado) return;
        setProyecto(p);
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
  }, [idValido, proyectoId, cargarEnEditor]);

  const hayCambios = useMemo(
    () =>
      huella(vertices, caminos, orientacion, notas) !==
      huella(
        guardado?.vertices ?? [],
        guardado?.caminos ?? [],
        guardado?.orientacion_norte != null ? String(guardado.orientacion_norte) : "",
        guardado?.notas ?? "",
      ),
    [vertices, caminos, orientacion, notas, guardado],
  );

  function limpiarMensajes() {
    setError(null);
    setAviso(null);
  }

  // ─── Dibujo ──────────────────────────────────────────

  function empezarTerreno() {
    limpiarMensajes();
    setBorrador([]);
    setModo("terreno");
  }

  function empezarCamino() {
    limpiarMensajes();
    if (vertices.length < 3) {
      setError("Define primero el terreno; los caminos se dibujan sobre él.");
      return;
    }
    setBorrador([]);
    setModo("camino");
  }

  function cancelarDibujo() {
    setBorrador([]);
    setModo(null);
  }

  function cerrarBorrador() {
    if (borrador.length < 3) return;

    if (modo === "terreno") {
      setVertices(borrador);
    } else if (modo === "camino") {
      setCaminos((actuales) => [
        ...actuales,
        {
          clave: crypto.randomUUID(),
          id: null,
          nombre: nuevoCamino.nombre.trim() || null,
          tipo: nuevoCamino.tipo,
          vertices: borrador,
        },
      ]);
      setNuevoCamino((n) => ({ ...n, nombre: "" }));
    }

    setBorrador([]);
    setModo(null);
  }

  // ─── Atajos ──────────────────────────────────────────

  function aplicarRectanguloTerreno() {
    limpiarMensajes();
    const largo = Number(rectTerreno.largo);
    const ancho = Number(rectTerreno.ancho);
    if (!(largo > 0 && ancho > 0)) {
      setError("El largo y el ancho del terreno deben ser mayores que cero.");
      return;
    }
    setVertices(rectangulo(0, 0, largo, ancho));
    // Ajusta el lienzo a la figura para que no quede diminuta ni cortada
    setLienzo({ ancho: largo, alto: ancho });
    setBorrador([]);
    setModo(null);
  }

  function aplicarRectanguloCamino() {
    limpiarMensajes();
    if (vertices.length < 3) {
      setError("Define primero el terreno; los caminos se dibujan sobre él.");
      return;
    }
    const x = Number(rectCamino.x);
    const y = Number(rectCamino.y);
    const largo = Number(rectCamino.largo);
    const ancho = Number(rectCamino.ancho);
    if (Number.isNaN(x) || Number.isNaN(y) || !(largo > 0 && ancho > 0)) {
      setError("Revisa el camino: la posición debe ser numérica y el largo y ancho mayores que cero.");
      return;
    }
    setCaminos((actuales) => [
      ...actuales,
      {
        clave: crypto.randomUUID(),
        id: null,
        nombre: nuevoCamino.nombre.trim() || null,
        tipo: nuevoCamino.tipo,
        vertices: rectangulo(x, y, largo, ancho),
      },
    ]);
    setNuevoCamino((n) => ({ ...n, nombre: "" }));
    setRectCamino((r) => ({ ...r, largo: "", ancho: "" }));
  }

  // ─── Edición de coordenadas ──────────────────────────

  function editarVertice(indice: number, eje: 0 | 1, valor: number) {
    if (Number.isNaN(valor)) return;
    setVertices((actuales) =>
      actuales.map((p, i) => (i === indice ? (eje === 0 ? [valor, p[1]] : [p[0], valor]) : p)),
    );
  }

  function quitarVertice(indice: number) {
    setVertices((actuales) => actuales.filter((_, i) => i !== indice));
  }

  function quitarCamino(clave: string) {
    setCaminos((actuales) => actuales.filter((c) => c.clave !== clave));
  }

  // ─── Guardado ────────────────────────────────────────

  async function guardar() {
    limpiarMensajes();

    if (vertices.length < 3) {
      setError("El terreno necesita al menos 3 vértices.");
      return;
    }

    const orientacionNumero = orientacion.trim() === "" ? null : Number(orientacion);
    if (
      orientacionNumero !== null &&
      (Number.isNaN(orientacionNumero) || orientacionNumero < 0 || orientacionNumero >= 360)
    ) {
      setError("La orientación del norte debe estar entre 0 y 359,99 grados.");
      return;
    }

    setGuardando(true);
    try {
      let resultado: Terreno | null;

      if (!guardado) {
        // Alta: terreno y caminos en un solo envío
        resultado = await crearTerreno(proyectoId, {
          vertices,
          orientacion_norte: orientacionNumero,
          notas: notas.trim() || null,
          caminos: caminos.map(({ nombre, tipo, vertices: v }) => ({ nombre, tipo, vertices: v })),
        });
      } else {
        // Modificación: el terreno por PATCH, los caminos por diferencia
        await actualizarTerreno(proyectoId, {
          vertices,
          orientacion_norte: orientacionNumero,
          notas: notas.trim() || null,
        });

        const idsLocales = new Set(caminos.flatMap((c) => (c.id === null ? [] : [c.id])));
        for (const camino of guardado.caminos) {
          if (!idsLocales.has(camino.id)) {
            await eliminarCamino(proyectoId, camino.id);
          }
        }

        for (const camino of caminos) {
          if (camino.id === null) {
            const creado = await agregarCamino(proyectoId, {
              nombre: camino.nombre,
              tipo: camino.tipo,
              vertices: camino.vertices,
            });
            // Se anota el id enseguida: si una operación posterior falla,
            // reintentar no debe volver a crear este camino.
            setCaminos((actuales) =>
              actuales.map((c) => (c.clave === camino.clave ? { ...c, id: creado.id } : c)),
            );
          }
        }

        resultado = await obtenerTerreno(proyectoId);
      }

      cargarEnEditor(resultado);
      // El estado del proyecto pudo avanzar (borrador → en diseño)
      setProyecto(await obtenerProyecto(proyectoId));
      setAviso("Terreno guardado.");
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo guardar el terreno"));

      // Si falló a mitad de una modificación, parte de los cambios ya
      // están en el servidor. Se actualiza la referencia de comparación
      // sin tocar lo que el usuario dibujó, para que un reintento no
      // borre dos veces ni duplique caminos.
      if (guardado) {
        obtenerTerreno(proyectoId)
          .then(setGuardado)
          .catch(() => undefined);
      }
    } finally {
      setGuardando(false);
    }
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
        <Link to="/proyectos" className="mt-4 inline-block text-sm text-solar-700 hover:underline">
          ← Volver a proyectos
        </Link>
      </div>
    );
  }

  const dibujando = modo !== null;

  return (
    <div className="mx-auto max-w-7xl">
      {/* ─── Encabezado ─────────────────────────────────── */}
      <EncabezadoProyecto proyecto={proyecto} titulo="Terreno y caminos" onActualizado={setProyecto} />

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

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ─── Plano ────────────────────────────────────── */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {!dibujando ? (
              <>
                <button type="button" className={BOTON} onClick={empezarTerreno}>
                  {vertices.length ? "Redibujar terreno" : "Dibujar terreno"}
                </button>
                <button type="button" className={BOTON} onClick={empezarCamino}>
                  Dibujar camino
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={BOTON}
                  onClick={() => setBorrador((b) => b.slice(0, -1))}
                  disabled={borrador.length === 0}
                >
                  Deshacer punto
                </button>
                <button
                  type="button"
                  className={BOTON}
                  onClick={cerrarBorrador}
                  disabled={borrador.length < 3}
                >
                  Cerrar polígono
                </button>
                <button type="button" className={BOTON} onClick={cancelarDibujo}>
                  Cancelar
                </button>
              </>
            )}

            <label className="ml-auto flex items-center gap-2 text-sm text-acero-600">
              <input
                type="checkbox"
                checked={ajustarAlMetro}
                onChange={(e) => setAjustarAlMetro(e.target.checked)}
                className="accent-solar-500"
              />
              Ajustar al metro
            </label>
          </div>

          <EditorPoligonos
            terreno={modo === "terreno" ? [] : vertices}
            caminos={caminos}
            borrador={borrador}
            dibujando={modo}
            lienzo={lienzo}
            pasoAjuste={ajustarAlMetro ? 1 : null}
            onAgregarPunto={(p) => setBorrador((b) => [...b, p])}
            onCerrarBorrador={cerrarBorrador}
          />

          <div className="mt-2 flex items-center gap-2 text-xs text-acero-500">
            <span>Lienzo mínimo</span>
            <input
              type="number"
              min={10}
              className="w-20 rounded border border-acero-300 px-1.5 py-0.5"
              value={lienzo.ancho}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (v > 0) setLienzo((l) => ({ ...l, ancho: v }));
              }}
            />
            <span>×</span>
            <input
              type="number"
              min={10}
              className="w-20 rounded border border-acero-300 px-1.5 py-0.5"
              value={lienzo.alto}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (v > 0) setLienzo((l) => ({ ...l, alto: v }));
              }}
            />
            <span>m — amplíalo para dibujar terrenos grandes con clics</span>
          </div>
        </section>

        {/* ─── Panel lateral ────────────────────────────── */}
        <aside className="space-y-5">
          {/* Áreas */}
          <div className="rounded-xl border border-acero-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-acero-700">Superficies</h2>
            {guardado ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-acero-500">Bruta</dt>
                  <dd className="text-right font-medium text-acero-800">
                    {formatearArea(guardado.areas.area_bruta)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-acero-500">Caminos</dt>
                  <dd className="text-right text-acero-700">
                    − {formatearArea(guardado.areas.area_caminos)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-acero-200 pt-2">
                  <dt className="font-semibold text-acero-700">Útil</dt>
                  <dd className="text-right font-bold text-solar-700">
                    {formatearArea(guardado.areas.area_util)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-acero-500">
                Guarda el terreno para calcular las superficies.
              </p>
            )}
            {guardado && hayCambios && (
              <p className="mt-3 text-xs text-solar-700">
                Hay cambios sin guardar. Las cifras corresponden a la última versión guardada.
              </p>
            )}
          </div>

          {/* Terreno */}
          <div className="rounded-xl border border-acero-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-acero-700">Terreno</h2>

            <p className="mt-3 text-xs font-medium text-acero-500">Rectángulo rápido</p>
            <div className="mt-1 flex gap-2">
              <input
                className={CAMPO}
                type="number"
                min={0}
                placeholder="Largo (m)"
                value={rectTerreno.largo}
                onChange={(e) => setRectTerreno((r) => ({ ...r, largo: e.target.value }))}
              />
              <input
                className={CAMPO}
                type="number"
                min={0}
                placeholder="Ancho (m)"
                value={rectTerreno.ancho}
                onChange={(e) => setRectTerreno((r) => ({ ...r, ancho: e.target.value }))}
              />
              <button type="button" className={BOTON} onClick={aplicarRectanguloTerreno}>
                Aplicar
              </button>
            </div>

            {vertices.length > 0 && (
              <>
                <p className="mt-4 text-xs font-medium text-acero-500">
                  Vértices ({vertices.length}) — en metros
                </p>
                <div className="mt-1 max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-acero-400">
                        <th className="w-6 text-left font-normal">#</th>
                        <th className="text-left font-normal">x</th>
                        <th className="text-left font-normal">y</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {vertices.map(([x, y], i) => (
                        <tr key={i}>
                          <td className="text-xs text-acero-400">{i + 1}</td>
                          <td className="pr-1 py-0.5">
                            <input
                              type="number"
                              step="0.01"
                              className={CAMPO}
                              value={x}
                              onChange={(e) => editarVertice(i, 0, e.target.valueAsNumber)}
                              aria-label={`Vértice ${i + 1}, x`}
                            />
                          </td>
                          <td className="pr-1 py-0.5">
                            <input
                              type="number"
                              step="0.01"
                              className={CAMPO}
                              value={y}
                              onChange={(e) => editarVertice(i, 1, e.target.valueAsNumber)}
                              aria-label={`Vértice ${i + 1}, y`}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="text-acero-400 hover:text-red-600 disabled:opacity-30"
                              onClick={() => quitarVertice(i)}
                              disabled={vertices.length <= 3}
                              title="Quitar vértice"
                              aria-label={`Quitar vértice ${i + 1}`}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-acero-500">
                Orientación del norte (°)
                <input
                  className={`${CAMPO} mt-1`}
                  type="number"
                  min={0}
                  max={359.99}
                  step="0.1"
                  placeholder="Sin definir"
                  value={orientacion}
                  onChange={(e) => setOrientacion(e.target.value)}
                />
                <span className="mt-1 block font-normal text-acero-400">
                  0 = arriba del plano; sentido horario
                </span>
              </label>
            </div>

            <label className="mt-3 block text-xs font-medium text-acero-500">
              Notas
              <textarea
                className={`${CAMPO} mt-1`}
                rows={2}
                maxLength={500}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </label>
          </div>

          {/* Caminos */}
          <div className="rounded-xl border border-acero-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-acero-700">Caminos ({caminos.length})</h2>

            {caminos.length > 0 && (
              <ul className="mt-3 divide-y divide-acero-100">
                {caminos.map((c) => (
                  <li key={c.clave} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="text-acero-800">{c.nombre ?? "Sin nombre"}</span>
                      <span className="ml-2 text-xs text-acero-400">
                        {ETIQUETAS_TIPO_CAMINO[c.tipo]}
                        {c.id === null ? " · sin guardar" : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-acero-400 hover:text-red-600"
                      onClick={() => quitarCamino(c.clave)}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-xs font-medium text-acero-500">Próximo camino</p>
            <div className="mt-1 flex gap-2">
              <input
                className={CAMPO}
                placeholder="Nombre (opcional)"
                value={nuevoCamino.nombre}
                onChange={(e) => setNuevoCamino((n) => ({ ...n, nombre: e.target.value }))}
                maxLength={100}
              />
              <select
                className={`${CAMPO} max-w-40`}
                value={nuevoCamino.tipo}
                onChange={(e) => setNuevoCamino((n) => ({ ...n, tipo: e.target.value as TipoCamino }))}
                aria-label="Tipo de camino"
              >
                {Object.values(TipoCamino).map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETAS_TIPO_CAMINO[t]}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-acero-400">
              Dibújalo sobre el plano con «Dibujar camino», o ingrésalo como rectángulo: esquina
              inferior izquierda (x, y), largo y ancho en metros.
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(["x", "y", "largo", "ancho"] as const).map((campo) => (
                <input
                  key={campo}
                  className={CAMPO}
                  type="number"
                  placeholder={campo}
                  value={rectCamino[campo]}
                  onChange={(e) => setRectCamino((r) => ({ ...r, [campo]: e.target.value }))}
                  aria-label={`Camino, ${campo}`}
                />
              ))}
            </div>
            <button type="button" className={`${BOTON} mt-2 w-full`} onClick={aplicarRectanguloCamino}>
              Agregar camino
            </button>
          </div>

          <button
            type="button"
            className={`${BOTON_PRIMARIO} w-full`}
            onClick={guardar}
            disabled={guardando || dibujando || (!hayCambios && guardado !== null)}
          >
            {guardando ? "Guardando…" : guardado ? "Guardar cambios" : "Guardar terreno"}
          </button>
          {dibujando && (
            <p className="text-center text-xs text-acero-400">
              Termina o cancela el dibujo en curso para guardar.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
