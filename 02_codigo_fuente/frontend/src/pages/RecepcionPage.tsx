/**
 * Recepción en terreno — RF-15.
 *
 * Como en el prototipo (Pantalla 8): se elige la cotización despachada y
 * se revisa material por material. Cada uno queda OK (llegó lo que salió
 * de planta), Diferencia (llegó otra cantidad, con su observación) o
 * Pendiente (todavía no se verifica). "Generar reporte de recepción"
 * confirma el checklist, la propuesta pasa a recibida (RF-16) y se abre
 * el reporte. Una recepción confirmada no se modifica.
 *
 * Se compara contra lo despachado, no contra lo cotizado: si en planta se
 * justificó una diferencia, en terreno se espera lo que realmente salió.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { ListaCotizacionesValidacion } from "@/components/ListaCotizacionesValidacion";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import {
  confirmarRecepcion,
  EXTENSIONES_FOTO,
  listarPorRecibir,
  MAXIMO_FOTOS,
  obtenerValidacion,
  problemaDeLaFoto,
} from "@/services/validacion";
import { ETIQUETAS_ESTADO_ITEM, EstadoCotizacion, type EstadoItemRecepcion, type Validacion } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

const CAMPO =
  "w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500";
const ETIQUETA = "block text-xs font-medium text-acero-600";
const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

const ESTILO_ESTADO: Record<EstadoItemRecepcion, string> = {
  ok: "border-green-300 bg-green-50",
  diferencia: "border-amber-300 bg-amber-50",
  pendiente: "border-acero-200 bg-superficie",
};
const BADGE_ESTADO: Record<EstadoItemRecepcion, string> = {
  ok: "bg-green-100 text-green-800",
  diferencia: "bg-amber-100 text-amber-900",
  pendiente: "bg-sky-100 text-sky-800",
};

interface FilaChecklist {
  estado: EstadoItemRecepcion;
  recibida: string;
  observacion: string;
}

const esCantidad = (texto: string) => /^\d+$/.test(texto.trim());

function checklistInicial(v: Validacion): Record<number, FilaChecklist> {
  return Object.fromEntries(
    (v.despacho?.items ?? []).map((i) => [i.material_id, { estado: "pendiente", recibida: "", observacion: "" }]),
  );
}

export function RecepcionPage() {
  const { cotizacionId: parametro } = useParams();
  const id = parametro ? Number(parametro) : null;
  const cotizacionId = id !== null && Number.isInteger(id) && id > 0 ? id : null;

  return (
    <div className="mx-auto max-w-7xl">
      <nav className="text-sm text-acero-500">
        <span>Operaciones</span>
        <span className="mx-2">/</span>
        <span>Validación de materiales</span>
        <span className="mx-2">/</span>
        <span className="text-acero-700">Recepción en terreno</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-acero-900">Recepción en terreno</h1>
      <p className="mt-1 text-sm text-acero-500">Verificación de los materiales recibidos frente a los despachados.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <aside>
          <ListaCotizacionesValidacion
            titulo="COTIZACIÓN DESPACHADA"
            cargar={listarPorRecibir}
            rutaDe={(c) => `/validacion/recepcion/${c}`}
            seleccionada={cotizacionId}
            vacio="No hay lotes despachados por recibir."
          />
        </aside>
        <section className="space-y-4 lg:col-span-2">
          {cotizacionId === null ? (
            <div className={`${TARJETA} text-sm text-acero-500`}>Selecciona el lote que llegó a obra.</div>
          ) : (
            // La clave reinicia el checklist al cambiar de cotización
            <ChecklistRecepcion key={cotizacionId} cotizacionId={cotizacionId} />
          )}
        </section>
      </div>
    </div>
  );
}

/** El checklist de un lote despachado, con los datos de quien recibe. */
function ChecklistRecepcion({ cotizacionId }: { cotizacionId: number }) {
  const navegar = useNavigate();
  const unaVez = useAccionUnica();

  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [filas, setFilas] = useState<Record<number, FilaChecklist>>({});
  const [recibidoPor, setRecibidoPor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    obtenerValidacion(cotizacionId)
      .then((v) => {
        if (cancelado) return;
        setValidacion(v);
        setFilas(checklistInicial(v));
      })
      .catch((e) => {
        if (!cancelado) setErrorCarga(mensajeDeError(e, "No se pudo cargar la cotización"));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cotizacionId]);

  const items = validacion?.despacho?.items ?? [];
  const porRecibir = validacion?.estado === EstadoCotizacion.DESPACHADA;

  const conteo = {
    despachadas: items.reduce((s, i) => s + i.cantidad_despachada, 0),
    revisados: items.filter((i) => filas[i.material_id]?.estado !== "pendiente").length,
    diferencias: items.filter((i) => filas[i.material_id]?.estado === "diferencia").length,
    pendientes: items.filter((i) => filas[i.material_id]?.estado === "pendiente").length,
  };

  /** Problema de una fila con diferencia, o null si está completa */
  function problemaDeFila(materialId: number, esperada: number): string | null {
    const fila = filas[materialId];
    if (fila?.estado !== "diferencia") return null;
    if (!esCantidad(fila.recibida)) return "Indica cuántas llegaron.";
    if (Number(fila.recibida) === esperada) return "Llegó lo esperado: márcalo como OK.";
    if (!fila.observacion.trim()) return "Explica la diferencia.";
    return null;
  }

  const filasConProblema = items.filter((i) => problemaDeFila(i.material_id, i.cantidad_despachada) !== null);
  const hayCambios =
    porRecibir &&
    !enviando &&
    (conteo.revisados > 0 || recibidoPor.trim() !== "" || observaciones.trim() !== "" || fotos.length > 0);
  const permitirSalida = useCambiosSinGuardar(hayCambios);

  const impedimento = !validacion
    ? "Selecciona una cotización."
    : filasConProblema.length > 0
      ? `Completa los materiales con diferencia: ${filasConProblema.map((i) => i.codigo).join(", ")}.`
      : !recibidoPor.trim()
        ? "Indica quién recibió el lote."
        : null;

  function cambiarFila(materialId: number, cambios: Partial<FilaChecklist>) {
    setFilas((actuales) => ({ ...actuales, [materialId]: { ...actuales[materialId], ...cambios } }));
  }

  function marcar(materialId: number, estado: EstadoItemRecepcion) {
    cambiarFila(materialId, estado === "diferencia" ? { estado } : { estado, recibida: "", observacion: "" });
  }

  function agregarFoto(lista: FileList | null) {
    const archivo = lista?.[0];
    if (!archivo) return;
    const problema = problemaDeLaFoto(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    if (fotos.length >= MAXIMO_FOTOS) {
      setError(`Se admiten hasta ${MAXIMO_FOTOS} fotos por recepción.`);
      return;
    }
    setError(null);
    setFotos((f) => [...f, archivo]);
  }

  function limpiar() {
    if (!validacion) return;
    setFilas(checklistInicial(validacion));
    setObservaciones("");
    setFotos([]);
    setError(null);
  }

  async function confirmar() {
    if (!validacion || impedimento) return;
    setError(null);
    setEnviando(true);
    try {
      await confirmarRecepcion(
        validacion.cotizacion_id,
        {
          recibido_por: recibidoPor.trim(),
          observaciones: observaciones.trim() || null,
          items: items.map((i) => {
            const fila = filas[i.material_id];
            return {
              material_id: i.material_id,
              estado: fila.estado,
              cantidad_recibida: fila.estado === "diferencia" ? Number(fila.recibida) : null,
              observacion: fila.estado === "diferencia" ? fila.observacion.trim() : fila.observacion.trim() || null,
            };
          }),
        },
        fotos,
      );
      permitirSalida();
      void navegar(`/validacion/seguimiento/${validacion.cotizacion_id}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo registrar la recepción"));
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-acero-500">Cargando cotización…</p>;
  if (errorCarga || !validacion) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {errorCarga ?? "No se encontró la cotización."}
      </p>
    );
  }

  return (
    <>
      <div className={`${TARJETA} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <p className="font-mono text-sm text-solar-700">{validacion.numero_proforma}</p>
          <p className="text-lg font-semibold text-acero-900">{validacion.cliente_nombre}</p>
          {validacion.despacho && (
            <p className="text-sm text-acero-500">
              Despachado {fechaHora(validacion.despacho.created_at)} a {validacion.despacho.destino}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-acero-500">Estado actual</p>
          <EstadoCotizacionBadge estado={validacion.estado} />
        </div>
      </div>

      {!porRecibir ? (
        <div className={TARJETA}>
          <p className="text-sm text-acero-700">
            {validacion.estado === EstadoCotizacion.COTIZADA
              ? "Este lote todavía no se despacha."
              : `La recepción ya se registró${validacion.recepcion ? ` el ${fechaHora(validacion.recepcion.created_at)}` : ""}.`}
          </p>
          <Link
            to={`/validacion/seguimiento/${validacion.cotizacion_id}`}
            className="mt-3 inline-block text-sm font-semibold text-solar-700 hover:underline"
          >
            Ver el seguimiento de la propuesta
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { titulo: "Despachadas", valor: conteo.despachadas, color: "text-sky-700" },
              { titulo: "Revisados", valor: `${conteo.revisados}/${items.length}`, color: "text-green-700" },
              { titulo: "Diferencias", valor: conteo.diferencias, color: "text-amber-700" },
              { titulo: "Pendientes", valor: conteo.pendientes, color: "text-acero-700" },
            ].map((c) => (
              <div key={c.titulo} className="rounded-xl border border-acero-200 bg-superficie p-3 text-center">
                <dd className={`text-2xl font-bold ${c.color}`}>{c.valor}</dd>
                <dt className="text-xs text-acero-500">{c.titulo}</dt>
              </div>
            ))}
          </dl>

          <div>
            <h2 className="text-sm font-semibold text-acero-900">Checklist de materiales</h2>
            <ul className="mt-3 space-y-3">
              {items.map((i) => {
                const fila = filas[i.material_id] ?? { estado: "pendiente", recibida: "", observacion: "" };
                const problema = problemaDeFila(i.material_id, i.cantidad_despachada);
                const diferencia =
                  fila.estado === "diferencia" && esCantidad(fila.recibida)
                    ? Number(fila.recibida) - i.cantidad_despachada
                    : null;
                return (
                  <li
                    key={i.material_id}
                    data-testid={`fila-${i.codigo}`}
                    className={`rounded-xl border p-4 ${ESTILO_ESTADO[fila.estado]}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-acero-900">
                        {i.codigo} <span className="font-normal text-acero-600">· {i.nombre}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_ESTADO[fila.estado]}`}>
                        {ETIQUETAS_ESTADO_ITEM[fila.estado]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-6 text-sm">
                      <div>
                        <p className="text-xs text-acero-500">Despachadas</p>
                        <p className="font-semibold text-acero-800">{i.cantidad_despachada}</p>
                      </div>
                      {fila.estado === "diferencia" ? (
                        <>
                          <label className={ETIQUETA}>
                            Recibidas *
                            <input
                              aria-label={`Recibidas ${i.codigo}`}
                              inputMode="numeric"
                              value={fila.recibida}
                              onChange={(e) => cambiarFila(i.material_id, { recibida: e.target.value })}
                              className="mt-1 block w-24 rounded-lg border border-acero-300 bg-acero-50 px-2 py-1 text-right text-sm text-acero-900"
                            />
                          </label>
                          <div>
                            <p className="text-xs text-acero-500">Diferencia</p>
                            <p className="font-semibold text-amber-700">
                              {diferencia === null ? "—" : diferencia > 0 ? `+${diferencia}` : diferencia}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="text-xs text-acero-500">Recibidas</p>
                          <p className="font-semibold text-acero-800">
                            {fila.estado === "ok" ? i.cantidad_despachada : "—"}
                          </p>
                        </div>
                      )}
                      <div className="ml-auto flex gap-2" role="group" aria-label={`Estado de ${i.codigo}`}>
                        {(["ok", "diferencia", "pendiente"] as const).map((estado) => (
                          <button
                            key={estado}
                            type="button"
                            aria-pressed={fila.estado === estado}
                            onClick={() => marcar(i.material_id, estado)}
                            className={[
                              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                              fila.estado === estado
                                ? "border-solar-500 bg-solar-500 text-acero-50"
                                : "border-acero-300 text-acero-700 hover:bg-acero-100",
                            ].join(" ")}
                          >
                            {ETIQUETAS_ESTADO_ITEM[estado]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {fila.estado === "diferencia" && (
                      <label className={`mt-3 ${ETIQUETA}`}>
                        Observación *
                        <input
                          aria-label={`Observación ${i.codigo}`}
                          className={`mt-1 ${CAMPO}`}
                          value={fila.observacion}
                          maxLength={500}
                          placeholder="Qué pasó: varillas dobladas, faltantes, sobrantes…"
                          onChange={(e) => cambiarFila(i.material_id, { observacion: e.target.value })}
                        />
                      </label>
                    )}
                    {problema && <p className="mt-2 text-xs text-amber-800">{problema}</p>}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>DATOS DE LA RECEPCIÓN</h2>
            <div className="mt-3 space-y-3">
              <label className={ETIQUETA}>
                Recibido por *
                <input
                  className={`mt-1 ${CAMPO}`}
                  value={recibidoPor}
                  maxLength={120}
                  placeholder="Instalador u operario que recibe en obra"
                  onChange={(e) => setRecibidoPor(e.target.value)}
                />
              </label>
              <label className={ETIQUETA}>
                Observaciones generales
                <textarea
                  className={`mt-1 ${CAMPO}`}
                  rows={3}
                  maxLength={2000}
                  value={observaciones}
                  placeholder="Acuerdos con el cliente, reposiciones, estado del transporte"
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </label>
              <div>
                <input
                  ref={entrada}
                  type="file"
                  className="hidden"
                  data-testid="foto-recepcion"
                  accept={EXTENSIONES_FOTO.join(",")}
                  onChange={(e) => {
                    agregarFoto(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => entrada.current?.click()}
                  disabled={fotos.length >= MAXIMO_FOTOS}
                  className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100 disabled:opacity-50"
                >
                  Subir foto de evidencia
                </button>
                {fotos.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-acero-700">
                    {fotos.map((f, indice) => (
                      <li key={`${f.name}-${indice}`} className="flex items-center gap-3">
                        <span>{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setFotos((actuales) => actuales.filter((_, j) => j !== indice))}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {impedimento && <p className="text-xs text-acero-500">{impedimento}</p>}
            <button
              type="button"
              onClick={limpiar}
              disabled={enviando}
              className="rounded-lg border border-acero-300 px-4 py-2.5 text-sm text-acero-700 hover:bg-acero-100"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => void unaVez("recibir", confirmar)}
              disabled={impedimento !== null || enviando}
              title={impedimento ?? undefined}
              className="rounded-lg bg-solar-500 px-5 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Generar reporte de recepción"}
            </button>
          </div>
          {conteo.pendientes > 0 && !impedimento && (
            <p className="text-right text-xs text-acero-500">
              Quedan {conteo.pendientes} materiales pendientes: el reporte los registra como pendientes de revisión.
            </p>
          )}
        </>
      )}
    </>
  );
}
