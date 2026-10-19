/**
 * Cargar boceto — RF-04.
 *
 * El cliente instalador ya trae su diseño (un plano de AutoCAD exportado
 * a PDF, una foto o el DXF). Como en el prototipo: la zona para soltar el
 * archivo a la izquierda y, a la derecha, qué detecta la IA y los datos
 * del proyecto. "Procesar boceto" crea el proyecto, sube el archivo y
 * muestra el avance hasta que llega la lectura; luego abre la
 * confirmación (RF-05), donde el Gerente revisa y corrige los bloques.
 *
 * Con id en la ruta (/bocetos/:id) es un proyecto existente: cargar otro
 * archivo reemplaza el boceto anterior.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import { cargarBoceto, EXTENSIONES_ADMITIDAS, obtenerBoceto } from "@/services/bocetos";
import { listarClientes } from "@/services/clientes";
import { crearProyecto, obtenerProyecto } from "@/services/proyectos";
import type { Boceto, ClienteListado, Proyecto } from "@/types/api";
import { esDxf, problemaDelArchivo, rutaConfirmacionBoceto, tamanoLegible } from "@/utils/bocetos";

const CAMPO =
  "w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";
const ETIQUETA = "block text-xs font-medium text-acero-600";
const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

const DETECTA = [
  "Los bloques de paneles y sus medidas: L paneles en el largo y A en el ancho",
  "Cuántos bloques iguales hay de cada tipo (B)",
  "La orientación de las filas",
  "Avisos de lo que no se distingue bien en el plano",
];

type Paso = "subiendo" | "leyendo";

export function CargarBocetoPage() {
  const { proyectoId: parametro } = useParams();
  const navegar = useNavigate();
  const unaVez = useAccionUnica();
  const esNuevo = parametro === undefined;
  const idRuta = Number(parametro);
  const idValido = esNuevo || (Number.isInteger(idRuta) && idRuta > 0);

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [anterior, setAnterior] = useState<Boceto | null>(null);
  const [clientes, setClientes] = useState<ClienteListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);
  const cancelador = useRef<AbortController | null>(null);

  const hayCambios = paso !== null || archivo !== null || (proyecto === null && (nombre.trim() !== "" || clienteId !== ""));
  const permitirSalida = useCambiosSinGuardar(hayCambios);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;
    const pedidos = esNuevo
      ? Promise.all([listarClientes(), null, null] as const)
      : Promise.all([null, obtenerProyecto(idRuta), obtenerBoceto(idRuta)] as const);
    pedidos
      .then(([c, p, b]) => {
        if (cancelado) return;
        if (c) setClientes(c);
        if (p) {
          setProyecto(p);
          setNombre(p.nombre);
        }
        setAnterior(b);
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
  }, [esNuevo, idRuta, idValido]);

  // Salir de la pantalla durante el proceso cancela la subida
  useEffect(() => () => cancelador.current?.abort(), []);

  function elegir(lista: FileList | null) {
    const elegido = lista?.[0];
    if (!elegido) return;
    const problema = problemaDelArchivo(elegido);
    setError(problema);
    setAviso(null);
    setArchivo(problema ? null : elegido);
  }

  const impedimento = !archivo
    ? "Elige el archivo del boceto."
    : !proyecto && !nombre.trim()
      ? "Escribe el nombre del proyecto."
      : !proyecto && !clienteId
        ? "Selecciona el cliente."
        : proyecto?.cotizacion_id
          ? "El proyecto ya está cotizado: su boceto no se puede cambiar."
          : null;

  async function procesar() {
    if (!archivo || impedimento) return;
    setError(null);
    setAviso(null);
    const control = new AbortController();
    cancelador.current = control;
    setPaso("subiendo");
    let destino = proyecto;
    try {
      if (!destino) {
        destino = await crearProyecto({
          nombre: nombre.trim(),
          cliente_id: Number(clienteId),
          ubicacion: null,
          latitud: null,
          longitud: null,
          notas: null,
        });
        // Si la lectura falla, el reintento usa este mismo proyecto
        setProyecto(destino);
      }
      await cargarBoceto(destino.id, archivo, { signal: control.signal, onSubido: () => setPaso("leyendo") });
      permitirSalida();
      void navegar(rutaConfirmacionBoceto(destino.id));
    } catch (e) {
      if (control.signal.aborted) {
        setAviso(
          destino
            ? "Se canceló el procesamiento. El proyecto quedó guardado: puedes volver a cargar el boceto aquí o desde el Historial."
            : "Se canceló el procesamiento.",
        );
      } else {
        setError(mensajeDeError(e, "No se pudo procesar el boceto"));
      }
      setPaso(null);
    } finally {
      cancelador.current = null;
    }
  }

  if (!idValido) {
    return <p className="text-sm text-red-600">El identificador del proyecto no es válido.</p>;
  }
  if (cargando) {
    return <p className="text-sm text-acero-500">Cargando…</p>;
  }
  if (errorCarga) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorCarga}</p>
        <Link to="/historial" className="mt-4 inline-block text-sm text-solar-700 hover:underline">
          Volver al historial
        </Link>
      </div>
    );
  }

  const lecturaDxf = archivo ? esDxf(archivo.name) : false;
  const pasos: { clave: Paso | "listo"; texto: string }[] = [
    { clave: "subiendo", texto: "Subiendo el archivo" },
    {
      clave: "leyendo",
      texto: lecturaDxf ? "Leyendo la geometría del DXF" : "Analizando el boceto con IA (puede tardar hasta un minuto)",
    },
    { clave: "listo", texto: "Abriendo la confirmación" },
  ];
  const actual = paso === "subiendo" ? 0 : 1;

  return (
    <div className="mx-auto max-w-7xl">
      <nav className="text-sm text-acero-500">
        <span>Generación</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Cargar boceto</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-acero-900">Cargar boceto</h1>
      <p className="mt-1 text-sm text-acero-500">
        Sube el plano que envió el cliente. SolarQuote detecta los bloques de paneles y tú los revisas antes de cotizar.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {aviso && (
        <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {aviso}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          {paso ? (
            <div className={TARJETA} aria-live="polite">
              <h2 className={TITULO_TARJETA}>PROCESANDO BOCETO</h2>
              <p className="mt-2 text-sm text-acero-700">
                {archivo?.name} · {archivo && tamanoLegible(archivo.size)}
              </p>
              <ol className="mt-4 space-y-3">
                {pasos.map((p, i) => {
                  const estado = i < actual ? "hecho" : i === actual ? "activo" : "pendiente";
                  return (
                    <li key={p.clave} className="flex items-center gap-3 text-sm">
                      <span
                        className={[
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          estado === "hecho"
                            ? "bg-green-600 text-acero-50"
                            : estado === "activo"
                              ? "animate-pulse bg-solar-500 text-acero-50"
                              : "bg-acero-200 text-acero-500",
                        ].join(" ")}
                      >
                        {i + 1}
                      </span>
                      <span className={estado === "pendiente" ? "text-acero-400" : "text-acero-800"}>{p.texto}</span>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={() => cancelador.current?.abort()}
                className="mt-6 rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Elegir archivo del boceto"
              onClick={() => entrada.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  entrada.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                elegir(e.dataTransfer.files);
              }}
              className={[
                "flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition",
                arrastrando ? "border-solar-500 bg-solar-50" : "border-acero-300 bg-superficie hover:border-solar-400",
              ].join(" ")}
            >
              <input
                ref={entrada}
                type="file"
                className="hidden"
                data-testid="archivo-boceto"
                accept={EXTENSIONES_ADMITIDAS.join(",")}
                onChange={(e) => {
                  elegir(e.target.files);
                  e.target.value = "";
                }}
              />
              {archivo ? (
                <>
                  <p className="text-base font-semibold text-acero-800">{archivo.name}</p>
                  <p className="mt-1 text-sm text-acero-500">
                    {tamanoLegible(archivo.size)} · {lecturaDxf ? "se lee directo de la geometría" : "se analiza con IA"}
                  </p>
                  <p className="mt-4 text-xs text-solar-700">Haz clic o suelta otro archivo para cambiarlo</p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-acero-800">Arrastra el boceto aquí o haz clic para elegirlo</p>
                  <p className="mt-1 text-sm text-acero-500">PDF, JPG, PNG o DXF · hasta 10 MB</p>
                  <p className="mt-4 text-xs text-acero-400">¿Tienes un DWG? En AutoCAD usa Guardar como &gt; DXF.</p>
                </>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>¿QUÉ DETECTA LA IA?</h2>
            <ul className="mt-3 space-y-2 text-sm text-acero-700">
              {DETECTA.map((d) => (
                <li key={d} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-solar-500" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-acero-500">
              Los DXF se leen directo de la geometría, sin IA. En todos los casos revisas y corriges el resultado antes de
              cotizar.
            </p>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>DATOS DEL PROYECTO</h2>
            <div className="mt-3 space-y-3">
              <label className={ETIQUETA}>
                Nombre del proyecto *
                <input
                  className={`mt-1 ${CAMPO}`}
                  value={nombre}
                  maxLength={150}
                  disabled={proyecto !== null || paso !== null}
                  placeholder="Ej. San Pablo de Lago 3era Etapa"
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <label className={ETIQUETA}>
                Cliente *
                {proyecto ? (
                  <input className={`mt-1 ${CAMPO}`} value={proyecto.cliente.nombre} disabled />
                ) : (
                  <select
                    className={`mt-1 ${CAMPO}`}
                    value={clienteId}
                    disabled={paso !== null}
                    onChange={(e) => setClienteId(e.target.value)}
                  >
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
                {!proyecto && clientes.length === 0 && (
                  <span className="mt-1 block font-normal text-acero-500">
                    No hay clientes activos. Regístralo primero en Operaciones, Clientes.
                  </span>
                )}
              </label>
              <div className="flex justify-between text-sm">
                <span className="text-acero-500">Proforma</span>
                <span className="text-acero-700">{proyecto?.numero_proforma ?? "Se asigna al confirmar"}</span>
              </div>
            </div>
          </div>

          {anterior && (
            <div className="rounded-xl border border-acero-200 bg-sky-50 p-4 text-sm text-sky-800">
              Este proyecto ya tiene un boceto ({anterior.nombre_archivo}). Cargar otro lo reemplaza.{" "}
              <Link to={rutaConfirmacionBoceto(anterior.proyecto_id)} className="font-semibold underline">
                Ver su confirmación
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => void unaVez("procesar", procesar)}
            disabled={impedimento !== null || paso !== null}
            title={impedimento ?? undefined}
            className="w-full rounded-lg bg-solar-500 px-4 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paso ? "Procesando…" : "Procesar boceto"}
          </button>
          {impedimento && !paso && <p className="text-xs text-acero-500">{impedimento}</p>}
        </aside>
      </div>
    </div>
  );
}
