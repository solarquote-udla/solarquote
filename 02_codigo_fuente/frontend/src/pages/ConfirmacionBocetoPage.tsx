/**
 * Confirmación del boceto — RF-05 para los diseños que trae el cliente.
 *
 * La lectura del boceto (con IA o del DXF) puede equivocarse, así que el
 * Gerente la revisa al lado del archivo original: a la izquierda el
 * boceto y el esquema de los tipos detectados; a la derecha el resumen,
 * la tabla editable L, A, B, los avisos de la lectura y de proporción
 * antisísmica, y la confirmación.
 *
 * Las correcciones se guardan con "Guardar cambios"; confirmar exige que
 * no queden cambios sin guardar, para que se cotice exactamente lo que
 * se ve. Los bloques fuera de proporción se aceptan bajo responsabilidad,
 * igual que en el layout.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EstadoProyectoBadge } from "@/components/EstadoProyectoBadge";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import { confirmarYCotizarBoceto, guardarBloquesBoceto, obtenerArchivoBoceto, obtenerBoceto } from "@/services/bocetos";
import { obtenerProyecto } from "@/services/proyectos";
import type { BloqueBocetoEditar, Boceto, Proyecto } from "@/types/api";
import {
  enProporcion,
  type FilaBoceto,
  leerFila,
  nombresDeTipos,
  proporcion,
  rutaCargarBoceto,
  tamanoLegible,
} from "@/utils/bocetos";

const numero = (v: number, decimales = 2) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimales }).format(v);

const CELDA =
  "w-full rounded border border-acero-300 bg-acero-50 px-1.5 py-1 text-right text-sm text-acero-900 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";
const BOTON_SECUNDARIO =
  "rounded-lg border border-acero-300 px-4 py-2 text-center text-sm text-acero-700 hover:bg-acero-100 disabled:cursor-not-allowed disabled:opacity-50";

function filasDe(boceto: Boceto | null): FilaBoceto[] {
  return (boceto?.bloques ?? []).map((b, i) => ({
    clave: i,
    etiqueta: b.etiqueta ?? "",
    L: String(b.paneles_largo),
    A: String(b.paneles_ancho),
    B: String(b.repeticiones),
    orientacion: b.orientacion,
  }));
}

const firma = (filas: FilaBoceto[]) =>
  JSON.stringify(filas.map((f) => [f.etiqueta.trim(), f.L.trim(), f.A.trim(), f.B.trim(), f.orientacion]));

/** Vista del archivo original: imagen, PDF o, para un DXF, solo la descarga. */
function VistaOriginal({ proyectoId, boceto }: { proyectoId: number; boceto: Boceto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conVista = boceto.formato !== "dxf" && typeof URL.createObjectURL === "function";

  useEffect(() => {
    if (!conVista) return;
    let creada: string | null = null;
    let cancelado = false;
    obtenerArchivoBoceto(proyectoId)
      .then((blob) => {
        if (cancelado) return;
        creada = URL.createObjectURL(blob);
        setUrl(creada);
      })
      .catch((e) => {
        if (!cancelado) setError(mensajeDeError(e, "No se pudo abrir el archivo"));
      });
    return () => {
      cancelado = true;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [conVista, proyectoId, boceto.updated_at]);

  async function descargar() {
    try {
      const blob = await obtenerArchivoBoceto(proyectoId);
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = boceto.nombre_archivo;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo descargar el archivo"));
    }
  }

  return (
    <div className="rounded-xl border border-acero-200 bg-superficie p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-acero-400">BOCETO ORIGINAL</h2>
          <p className="mt-1 text-sm text-acero-700">
            {boceto.nombre_archivo} · {tamanoLegible(boceto.tamano_bytes)} ·{" "}
            {boceto.metodo === "dxf" ? "leído del DXF" : "leído con IA"}
          </p>
        </div>
        <button type="button" onClick={() => void descargar()} className={BOTON_SECUNDARIO}>
          Descargar original
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4">
        {!conVista ? (
          <p className="rounded-lg border border-dashed border-acero-300 p-8 text-center text-sm text-acero-500">
            {boceto.formato === "dxf"
              ? "Los DXF no tienen vista previa aquí: ábrelo en AutoCAD para compararlo."
              : "Vista previa no disponible."}
          </p>
        ) : url && boceto.formato === "pdf" ? (
          <object data={url} type="application/pdf" className="h-[32rem] w-full rounded-lg" aria-label="Boceto en PDF">
            <p className="text-sm text-acero-500">El navegador no muestra PDF: usa "Descargar original".</p>
          </object>
        ) : url ? (
          <img src={url} alt="Boceto del cliente" className="max-h-[32rem] w-full rounded-lg object-contain" />
        ) : (
          <p className="text-sm text-acero-500">Cargando vista previa…</p>
        )}
      </div>
    </div>
  );
}

interface TipoEsquema {
  clave: number;
  nombre: string;
  L: number;
  A: number;
  B: number;
  ok: boolean;
  /** Metros a lo largo de la fila (A) */
  ancho: number;
  /** Metros en la pendiente (L) */
  largo: number;
  orientacion: "vertical" | "horizontal";
}

/**
 * Un rectángulo por tipo, con la proporción real del bloque y girado como
 * en el plano: "vertical" = las filas (A) corren de arriba hacia abajo.
 */
function EsquemaTipos({ tipos }: { tipos: TipoEsquema[] }) {
  if (tipos.length === 0) return null;
  const maximo = Math.max(...tipos.map((t) => Math.max(t.ancho, t.largo)));
  return (
    <div className="rounded-xl border border-acero-200 bg-superficie p-5">
      <h2 className="text-xs font-semibold tracking-wider text-acero-400">ESQUEMA DE LOS TIPOS</h2>
      <div className="mt-4 flex flex-wrap items-end gap-6">
        {tipos.map((t) => {
          const escala = 160 / maximo;
          const vertical = t.orientacion === "vertical";
          const ancho = Math.max((vertical ? t.largo : t.ancho) * escala, 8);
          const largo = Math.max((vertical ? t.ancho : t.largo) * escala, 8);
          return (
            <figure key={t.clave} className="text-center">
              <svg width={ancho + 2} height={largo + 2} role="img" aria-label={`Tipo ${t.nombre}: ${t.L} × ${t.A}`}>
                <rect
                  x={1}
                  y={1}
                  width={ancho}
                  height={largo}
                  className={t.ok ? "fill-sky-600/80 stroke-sky-300" : "fill-amber-400/90 stroke-amber-600"}
                  strokeWidth={1}
                />
              </svg>
              <figcaption className="mt-1 text-xs text-acero-600">
                <span className="font-semibold text-acero-800">{t.nombre}</span> {t.L} × {t.A} · ×{t.B}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-acero-400">Cada tipo orientado como en el plano y a la misma escala.</p>
    </div>
  );
}

export function ConfirmacionBocetoPage() {
  const { proyectoId: parametro } = useParams();
  const proyectoId = Number(parametro);
  const idValido = Number.isInteger(proyectoId) && proyectoId > 0;
  const navegar = useNavigate();
  const unaVez = useAccionUnica();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [boceto, setBoceto] = useState<Boceto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [filas, setFilas] = useState<FilaBoceto[]>([]);
  const [siguienteClave, setSiguienteClave] = useState(0);
  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idValido) return;
    let cancelado = false;
    Promise.all([obtenerProyecto(proyectoId), obtenerBoceto(proyectoId)])
      .then(([p, b]) => {
        if (cancelado) return;
        setProyecto(p);
        setBoceto(b);
        const iniciales = filasDe(b);
        setFilas(iniciales);
        setSiguienteClave(iniciales.length);
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar el boceto"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [idValido, proyectoId]);

  const cotizado = proyecto?.cotizacion_id != null;
  const hayCambios = !cotizado && boceto !== null && firma(filas) !== firma(filasDe(boceto));
  const permitirSalida = useCambiosSinGuardar(hayCambios);

  // Estado de cada fila calculado en vivo, para ver el efecto de una corrección antes de guardarla
  const evaluadas = useMemo(() => {
    const nombres = nombresDeTipos(filas);
    return filas.map((f, i) => {
        const valores = leerFila(f);
        const nombre = nombres[i];
        if ("problema" in valores || !boceto) {
          return { fila: f, nombre, problema: "problema" in valores ? valores.problema : null, valores: null };
        }
        const prop = proporcion(valores.L, valores.A, boceto.panel);
        return { fila: f, nombre, problema: null, valores, prop, ok: enProporcion(prop, boceto.tolerancia_proporcion) };
      });
  }, [filas, boceto]);

  // Confianza de la IA por tipo: un tipo corregido a mano ya no la tiene
  const confianzaDe = useMemo(
    () => new Map(filasDe(boceto).map((f, i) => [firma([f]), boceto!.bloques[i].confianza])),
    [boceto],
  );

  if (!idValido) {
    return <p className="text-sm text-red-600">El identificador del proyecto no es válido.</p>;
  }
  if (cargando) {
    return <p className="text-sm text-acero-500">Cargando boceto…</p>;
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
  if (!boceto) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-acero-300 bg-superficie p-10 text-center text-sm text-acero-500">
        {proyecto.nombre} todavía no tiene un boceto cargado.{" "}
        <Link to={rutaCargarBoceto(proyecto.id)} className="font-semibold text-solar-700 underline">
          Cargar boceto
        </Link>
      </div>
    );
  }

  const conProblema = evaluadas.filter((e) => e.problema);
  const validas = evaluadas.filter((e) => e.valores);
  const totalPaneles = validas.reduce((s, e) => s + e.valores!.L * e.valores!.A * e.valores!.B, 0);
  const totalBloques = validas.reduce((s, e) => s + e.valores!.B, 0);
  const fuera = validas.filter((e) => !e.ok);
  const bloquesFuera = fuera.reduce((s, e) => s + e.valores!.B, 0);
  const potencia = boceto.panel.potencia_wp ? (totalPaneles * boceto.panel.potencia_wp) / 1000 : null;
  const mayor = Math.max(boceto.panel.largo_mm, boceto.panel.ancho_mm) / 1000;
  const menor = Math.min(boceto.panel.largo_mm, boceto.panel.ancho_mm) / 1000;

  const impedimento = cotizado
    ? null
    : filas.length === 0
      ? "Agrega al menos un tipo de bloque."
      : conProblema.length > 0
        ? "Corrige los valores marcados en la tabla."
        : hayCambios
          ? "Guarda los cambios antes de confirmar."
          : bloquesFuera > 0 && !acepta
            ? "Ajusta los bloques fuera de proporción o acéptalos bajo tu responsabilidad."
            : null;

  const cambiar = (clave: number, cambio: Partial<FilaBoceto>) =>
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  function agregar() {
    setFilas((actuales) => [...actuales, { clave: siguienteClave, etiqueta: "", L: "4", A: "24", B: "1", orientacion: "vertical" }]);
    setSiguienteClave((c) => c + 1);
  }

  async function guardar() {
    if (conProblema.length > 0 || filas.length === 0) return;
    setError(null);
    setGuardando(true);
    try {
      const datos: BloqueBocetoEditar[] = evaluadas.map((e) => ({
        etiqueta: e.fila.etiqueta.trim() || null,
        paneles_largo: e.valores!.L,
        paneles_ancho: e.valores!.A,
        repeticiones: e.valores!.B,
        orientacion: e.fila.orientacion,
      }));
      const guardado = await guardarBloquesBoceto(proyectoId, datos);
      setBoceto(guardado);
      const nuevas = filasDe(guardado);
      setFilas(nuevas);
      setSiguienteClave(nuevas.length);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudieron guardar los cambios"));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmar() {
    setError(null);
    setConfirmando(true);
    try {
      const emitida = await confirmarYCotizarBoceto(proyectoId, { acepta_fuera_de_proporcion: acepta });
      permitirSalida();
      void navegar(`/cotizaciones/${emitida.id}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo generar la cotización"));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="text-sm text-acero-500">
          <span>Generación</span>
          <span className="mx-2">/</span>
          <Link to={rutaCargarBoceto(proyecto.id)} className="hover:text-solar-700 hover:underline">
            Cargar boceto
          </Link>
          <span className="mx-2">/</span>
          <span className="text-acero-700">Confirmación del boceto</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-acero-800">
            {proyecto.numero_proforma ?? <span className="font-normal text-acero-500">Proforma: se asigna al confirmar</span>}
          </span>
          {cotizado ? (
            <EstadoProyectoBadge estado={proyecto.estado} />
          ) : (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800">
              En revisión
            </span>
          )}
        </div>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-acero-900">{proyecto.nombre}</h1>
      <p className="mt-1 text-sm text-acero-500">
        {proyecto.cliente.nombre} · panel {boceto.panel.origen === "equipo" ? "del proyecto" : "de referencia"}{" "}
        {numero(boceto.panel.largo_mm, 0)} × {numero(boceto.panel.ancho_mm, 0)} mm
      </p>

      {cotizado && (
        <div role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Este boceto ya se confirmó y se cotizó con la proforma {proyecto.numero_proforma ?? "sin número"}.{" "}
          <Link to={`/cotizaciones/${proyecto.cotizacion_id}`} className="font-semibold underline">
            Ver cotización
          </Link>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <VistaOriginal proyectoId={proyecto.id} boceto={boceto} />
          <EsquemaTipos
            tipos={validas.map((e) => ({
              clave: e.fila.clave,
              nombre: e.nombre,
              L: e.valores!.L,
              A: e.valores!.A,
              B: e.valores!.B,
              ok: e.ok!,
              ancho: e.valores!.A * menor,
              largo: e.valores!.L * mayor,
              orientacion: e.fila.orientacion,
            }))}
          />
        </div>

        <aside className="space-y-5 lg:col-span-2">
          {/* ─── Resumen ─────────────────────────────── */}
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-acero-400">RESUMEN</h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[
                { etiqueta: "paneles", valor: numero(totalPaneles, 0), clase: "text-sky-800" },
                { etiqueta: "kWp", valor: potencia === null ? "–" : numero(potencia, 1), clase: "text-green-800" },
                { etiqueta: "bloques", valor: numero(totalBloques, 0), clase: "text-acero-900" },
                {
                  etiqueta: "fuera de proporción",
                  valor: String(bloquesFuera),
                  clase: bloquesFuera ? "text-amber-700" : "text-acero-900",
                },
              ].map((d) => (
                <div key={d.etiqueta} className="rounded-xl border border-acero-200 bg-superficie px-4 py-3">
                  <p className={`text-xl font-bold ${d.clase}`}>{d.valor}</p>
                  <p className="text-xs text-acero-500">{d.etiqueta}</p>
                </div>
              ))}
            </div>
            {potencia === null && (
              <p className="mt-2 text-xs text-acero-500">La potencia se calcula cuando el proyecto tiene panel configurado.</p>
            )}
          </div>

          {/* ─── Tabla editable L, A, B ──────────────── */}
          <div className="rounded-xl border border-acero-200 bg-superficie p-5">
            <h2 className="text-xs font-semibold tracking-wider text-acero-400">DETALLE DE BLOQUES</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-acero-400">
                  <th className="pb-2 font-medium">Tipo</th>
                  <th className="w-14 pb-2 text-right font-medium">L</th>
                  <th className="w-16 pb-2 text-right font-medium">A</th>
                  <th className="w-16 pb-2 text-right font-medium">B</th>
                  <th className="pb-2 text-right font-medium">Estado</th>
                  {!cotizado && <th className="w-6 pb-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-acero-100">
                {evaluadas.map((e) => {
                  const confianza = confianzaDe.get(firma([e.fila]));
                  return (
                    <tr key={e.fila.clave} className="align-top">
                      <td className="py-1.5 pr-2">
                        <input
                          aria-label={`Nombre del tipo ${e.nombre}`}
                          className={`${CELDA} text-left`}
                          value={e.fila.etiqueta}
                          placeholder={e.nombre}
                          maxLength={20}
                          disabled={cotizado}
                          onChange={(ev) => cambiar(e.fila.clave, { etiqueta: ev.target.value })}
                        />
                        <select
                          aria-label={`Orientación del tipo ${e.nombre}`}
                          title="Hacia dónde corren las filas (A) en el plano"
                          className="mt-1 w-full rounded border border-acero-300 bg-acero-50 px-1 py-0.5 text-[11px] text-acero-700 focus:border-solar-500 focus:outline-none disabled:opacity-60"
                          value={e.fila.orientacion}
                          disabled={cotizado}
                          onChange={(ev) =>
                            cambiar(e.fila.clave, { orientacion: ev.target.value as FilaBoceto["orientacion"] })
                          }
                        >
                          <option value="vertical">Filas verticales</option>
                          <option value="horizontal">Filas horizontales</option>
                        </select>
                        {confianza != null && (
                          <span
                            className={`mt-0.5 block text-[11px] ${confianza < 0.7 ? "text-amber-700" : "text-acero-400"}`}
                            title="Confianza de la IA en este tipo"
                          >
                            IA {Math.round(confianza * 100)} %
                          </span>
                        )}
                      </td>
                      {(["L", "A", "B"] as const).map((campo) => (
                        <td key={campo} className="py-1.5 pl-1">
                          <input
                            aria-label={`${campo} del tipo ${e.nombre}`}
                            inputMode="numeric"
                            className={CELDA}
                            value={e.fila[campo]}
                            disabled={cotizado}
                            onChange={(ev) => cambiar(e.fila.clave, { [campo]: ev.target.value })}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 text-right">
                        {e.problema ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={e.problema}>
                            Corregir
                          </span>
                        ) : (
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              e.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900",
                            ].join(" ")}
                          >
                            {e.ok ? "OK" : "Revisar"}
                          </span>
                        )}
                      </td>
                      {!cotizado && (
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            aria-label={`Quitar el tipo ${e.nombre}`}
                            onClick={() => setFilas((actuales) => actuales.filter((f) => f.clave !== e.fila.clave))}
                            className="px-1 text-acero-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {conProblema.map((e) => (
              <p key={e.fila.clave} className="mt-2 text-xs text-red-600">
                Tipo {e.nombre}: {e.problema}.
              </p>
            ))}
            <p className="mt-2 text-xs text-acero-400">L: paneles en el largo · A: en el ancho · B: bloques iguales</p>
            {!cotizado && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={agregar} className={BOTON_SECUNDARIO}>
                  + Agregar tipo
                </button>
                <button
                  type="button"
                  onClick={() => void unaVez("guardar", guardar)}
                  disabled={!hayCambios || guardando || conProblema.length > 0 || filas.length === 0}
                  className="rounded-lg bg-acero-800 px-4 py-2 text-sm font-semibold text-acero-50 hover:bg-acero-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            )}
          </div>

          {/* ─── Avisos de la lectura ────────────────── */}
          {boceto.advertencias.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Avisos de la lectura</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {boceto.advertencias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Proporción antisísmica ──────────────── */}
          {fuera.map((e) => (
            <div key={e.fila.clave} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Tipo {e.nombre}: proporción antisísmica</p>
              <p className="mt-1 text-xs">
                {e.valores!.B} bloque{e.valores!.B === 1 ? "" : "s"} de {e.valores!.L} × {e.valores!.A} con proporción{" "}
                {numero(e.prop!)} : 1, fuera de 3 : 1 ± {numero(boceto.tolerancia_proporcion * 100, 0)} %. Ajústalo o
                confírmalo bajo tu responsabilidad.
              </p>
            </div>
          ))}

          {/* ─── Confirmación ────────────────────────── */}
          {!cotizado && (
            <div className="space-y-3">
              {bloquesFuera > 0 && !hayCambios && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                    checked={acepta}
                    onChange={(ev) => setAcepta(ev.target.checked)}
                  />
                  <span>
                    Acepto bajo mi responsabilidad {bloquesFuera === 1 ? "el bloque" : `los ${bloquesFuera} bloques`} fuera de
                    la proporción antisísmica.
                  </span>
                </label>
              )}
              <button
                type="button"
                onClick={() => void unaVez("confirmar", confirmar)}
                disabled={impedimento !== null || confirmando}
                title={impedimento ?? undefined}
                className="w-full rounded-lg bg-solar-500 px-4 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmando ? "Generando cotización…" : "Confirmar y generar cotización"}
              </button>
              {impedimento && <p className="text-xs text-acero-500">{impedimento}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Link to="/historial" className={`flex-1 ${BOTON_SECUNDARIO}`}>
              ← Historial
            </Link>
            {!cotizado && (
              <Link to={rutaCargarBoceto(proyecto.id)} className={`flex-1 ${BOTON_SECUNDARIO}`}>
                Cargar otro boceto
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
