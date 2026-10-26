/**
 * Despacho en planta — RF-14.
 *
 * Como en el prototipo (Pantalla 7): a la izquierda las cotizaciones por
 * despachar; a la derecha el lote de la seleccionada. El operario
 * fotografía los extremos de las varillas, la IA cuenta los círculos
 * visibles y el conteo llena la cantidad despachada de ese material, que
 * él revisa y corrige. Si alguna cantidad difiere de la cotizada, la
 * justificación es obligatoria. Al confirmar, la propuesta pasa a
 * despachada (RF-16) y se abre el reporte de despacho.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EstadoCotizacionBadge } from "@/components/EstadoCotizacionBadge";
import { ListaCotizacionesValidacion } from "@/components/ListaCotizacionesValidacion";
import { useAccionUnica } from "@/hooks/useAccionUnica";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import { mensajeDeError } from "@/services/api";
import {
  confirmarDespacho,
  contarVarillas,
  EXTENSIONES_FOTO,
  listarPorDespachar,
  MAXIMO_FOTOS,
  obtenerValidacion,
  problemaDeLaFoto,
} from "@/services/validacion";
import { EstadoCotizacion, type Validacion } from "@/types/api";
import { fechaHora } from "@/utils/fechas";

const CAMPO =
  "w-full rounded-lg border border-acero-300 bg-acero-50 px-3 py-2 text-sm text-acero-900 placeholder:text-acero-400 focus:border-solar-500 focus:outline-none focus:ring-1 focus:ring-solar-500 disabled:opacity-60";
const ETIQUETA = "block text-xs font-medium text-acero-600";
const TARJETA = "rounded-xl border border-acero-200 bg-superficie p-5";
const TITULO_TARJETA = "text-xs font-semibold tracking-wider text-acero-400";

const TRAZABILIDAD = [
  { campo: "fabricado_por", etiqueta: "Fabricó" },
  { campo: "soldado_por", etiqueta: "Soldó" },
  { campo: "contado_por", etiqueta: "Contó" },
  { campo: "despachado_por", etiqueta: "Despachó" },
] as const;

type CampoTrazabilidad = (typeof TRAZABILIDAD)[number]["campo"] | "destino";

interface FotoLote {
  clave: number;
  archivo: File;
  materialId: number;
  estado: "contando" | "contada" | "sin-conteo";
  conteo: number | null;
  confianza: number | null;
  mensaje: string | null;
}

const esCantidad = (texto: string) => /^\d+$/.test(texto.trim());

export function DespachoPage() {
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
        <span className="text-acero-700">Despacho en planta</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold text-acero-900">Despacho en planta</h1>
      <p className="mt-1 text-sm text-acero-500">Valida el lote antes de enviarlo al cliente.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <aside>
          <ListaCotizacionesValidacion
            titulo="COTIZACIÓN A DESPACHAR"
            cargar={listarPorDespachar}
            rutaDe={(c) => `/validacion/despacho/${c}`}
            seleccionada={cotizacionId}
            vacio="No hay cotizaciones por despachar."
          />
        </aside>
        <section className="space-y-4 lg:col-span-2">
          {cotizacionId === null ? (
            <div className={`${TARJETA} text-sm text-acero-500`}>Selecciona una cotización para validar su lote.</div>
          ) : (
            // La clave reinicia el formulario al cambiar de cotización
            <LoteDespacho key={cotizacionId} cotizacionId={cotizacionId} />
          )}
        </section>
      </div>
    </div>
  );
}

/** El lote de una cotización: fotos, cantidades, trazabilidad y confirmación. */
function LoteDespacho({ cotizacionId }: { cotizacionId: number }) {
  const navegar = useNavigate();
  const unaVez = useAccionUnica();

  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  /** Cantidades que el operario escribió a mano; las demás salen del conteo o de lo cotizado */
  const [editadas, setEditadas] = useState<Record<number, string>>({});
  const [trazabilidad, setTrazabilidad] = useState<Record<CampoTrazabilidad, string>>({
    fabricado_por: "",
    soldado_por: "",
    contado_por: "",
    despachado_por: "",
    destino: "",
  });
  const [justificacion, setJustificacion] = useState("");
  const [fotos, setFotos] = useState<FotoLote[]>([]);
  const [materialFoto, setMaterialFoto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrada = useRef<HTMLInputElement>(null);
  const siguienteClave = useRef(1);

  useEffect(() => {
    let cancelado = false;
    obtenerValidacion(cotizacionId)
      .then((v) => {
        if (cancelado) return;
        setValidacion(v);
        setTrazabilidad((t) => ({ ...t, destino: v.proyecto_nombre ?? "" }));
        const varilla = v.materiales.find((m) => m.codigo.startsWith("VAR")) ?? v.materiales[0];
        setMaterialFoto(varilla?.material_id ?? null);
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

  const porDespachar = validacion?.estado === EstadoCotizacion.COTIZADA;

  /** Suma de lo que contó la IA en las fotos de cada material */
  const conteoPorMaterial = useMemo(() => {
    const suma: Record<number, number> = {};
    for (const f of fotos) {
      if (f.conteo !== null) suma[f.materialId] = (suma[f.materialId] ?? 0) + f.conteo;
    }
    return suma;
  }, [fotos]);

  /** Lo que se despacha de cada material: lo escrito a mano, si no lo contado, si no lo cotizado */
  const valorDe = (materialId: number, cotizada: number): string =>
    editadas[materialId] ??
    (conteoPorMaterial[materialId] !== undefined ? String(conteoPorMaterial[materialId]) : String(cotizada));

  /** Un conteo nuevo o una foto quitada vuelven a mandar sobre lo escrito a mano */
  function soltarEdicion(materialId: number) {
    setEditadas((actuales) => {
      const resto = { ...actuales };
      delete resto[materialId];
      return resto;
    });
  }

  const diferencias = (validacion?.materiales ?? []).filter((m) => {
    const valor = valorDe(m.material_id, m.cantidad);
    return esCantidad(valor) && Number(valor) !== m.cantidad;
  });

  const hayCambios =
    porDespachar &&
    !enviando &&
    (fotos.length > 0 ||
      justificacion.trim() !== "" ||
      TRAZABILIDAD.some((t) => trazabilidad[t.campo].trim() !== "") ||
      Object.keys(editadas).length > 0);
  const permitirSalida = useCambiosSinGuardar(hayCambios);

  const impedimento = !validacion
    ? "Selecciona una cotización."
    : validacion.materiales.some((m) => !esCantidad(valorDe(m.material_id, m.cantidad)))
      ? "Cada material necesita una cantidad despachada (número entero, cero o más)."
      : TRAZABILIDAD.some((t) => !trazabilidad[t.campo].trim())
        ? "Completa la trazabilidad: quién fabricó, soldó, contó y despachó."
        : !trazabilidad.destino.trim()
          ? "Indica el destino del lote."
          : diferencias.length > 0 && !justificacion.trim()
            ? "Hay cantidades distintas a las cotizadas: escribe la justificación."
            : fotos.some((f) => f.estado === "contando")
              ? "Espera a que termine el conteo de las fotos."
              : null;

  async function agregarFoto(lista: FileList | null) {
    const archivo = lista?.[0];
    if (!archivo || !validacion || materialFoto === null) return;
    const problema = problemaDeLaFoto(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    if (fotos.length >= MAXIMO_FOTOS) {
      setError(`Se admiten hasta ${MAXIMO_FOTOS} fotos por despacho.`);
      return;
    }
    setError(null);
    const clave = siguienteClave.current++;
    const materialId = materialFoto;
    setFotos((actuales) => [
      ...actuales,
      { clave, archivo, materialId, estado: "contando", conteo: null, confianza: null, mensaje: null },
    ]);
    try {
      const conteo = await contarVarillas(validacion.cotizacion_id, archivo);
      setFotos((actuales) =>
        actuales.map((f) =>
          f.clave === clave
            ? {
                ...f,
                estado: "contada" as const,
                conteo: conteo.cantidad,
                confianza: conteo.confianza,
                mensaje: conteo.advertencias.join(" ") || null,
              }
            : f,
        ),
      );
      soltarEdicion(materialId);
    } catch (e) {
      const mensaje = mensajeDeError(e, "No se pudo contar la foto");
      setFotos((actuales) =>
        actuales.map((f) =>
          f.clave === clave
            ? { ...f, estado: "sin-conteo" as const, mensaje: `${mensaje} La foto queda como evidencia.` }
            : f,
        ),
      );
    }
  }

  function quitarFoto(foto: FotoLote) {
    setFotos((actuales) => actuales.filter((f) => f.clave !== foto.clave));
    if (foto.conteo !== null) soltarEdicion(foto.materialId);
  }

  async function confirmar() {
    if (!validacion || impedimento) return;
    setError(null);
    setEnviando(true);
    try {
      await confirmarDespacho(
        validacion.cotizacion_id,
        {
          fabricado_por: trazabilidad.fabricado_por.trim(),
          soldado_por: trazabilidad.soldado_por.trim(),
          contado_por: trazabilidad.contado_por.trim(),
          despachado_por: trazabilidad.despachado_por.trim(),
          destino: trazabilidad.destino.trim(),
          justificacion: justificacion.trim() || null,
          items: validacion.materiales.map((m) => ({
            material_id: m.material_id,
            cantidad_despachada: Number(valorDe(m.material_id, m.cantidad)),
            conteo_ia: conteoPorMaterial[m.material_id] ?? null,
          })),
          fotos: fotos.map((f) => ({ material_id: f.materialId, conteo_ia: f.conteo })),
        },
        fotos.map((f) => f.archivo),
      );
      permitirSalida();
      void navegar(`/validacion/seguimiento/${validacion.cotizacion_id}`);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo registrar el despacho"));
      setEnviando(false);
    }
  }

  const codigoDe = (materialId: number) =>
    validacion?.materiales.find((m) => m.material_id === materialId)?.codigo ?? "";

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
          {validacion.proyecto_nombre && <p className="text-sm text-acero-500">{validacion.proyecto_nombre}</p>}
        </div>
        <EstadoCotizacionBadge estado={validacion.estado} />
      </div>

      {!porDespachar ? (
        <div className={TARJETA}>
          <p className="text-sm text-acero-700">
            Este lote ya se despachó
            {validacion.despacho ? ` el ${fechaHora(validacion.despacho.created_at)}` : ""}.
          </p>
          <Link
            to={`/validacion/seguimiento/${validacion.cotizacion_id}`}
            className="mt-3 inline-block text-sm font-semibold text-solar-700 hover:underline"
          >
            Ver el reporte de despacho
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
            <p className="font-semibold">Cómo fotografiar el lote</p>
            <p className="mt-1">
              Fotografía de frente los extremos de las varillas, con buena luz. La IA cuenta los círculos visibles y el
              resultado llena la cantidad despachada de ese material; revísala antes de confirmar. Si el atado no entra
              en una foto, sube varias: los conteos se suman.
            </p>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>FOTOS DEL LOTE</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className={`${ETIQUETA} min-w-48 flex-1`}>
                Material de la foto
                <select
                  className={`mt-1 ${CAMPO}`}
                  value={materialFoto ?? ""}
                  onChange={(e) => setMaterialFoto(Number(e.target.value))}
                >
                  {validacion.materiales.map((m) => (
                    <option key={m.material_id} value={m.material_id}>
                      {m.codigo} · {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <input
                ref={entrada}
                type="file"
                className="hidden"
                data-testid="foto-lote"
                accept={EXTENSIONES_FOTO.join(",")}
                onChange={(e) => {
                  void agregarFoto(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={fotos.length >= MAXIMO_FOTOS}
                className="rounded-lg border border-acero-300 px-4 py-2 text-sm text-acero-700 hover:bg-acero-100 disabled:opacity-50"
              >
                Agregar foto
              </button>
            </div>
            <p className="mt-2 text-xs text-acero-500">JPG o PNG de hasta 10 MB · hasta {MAXIMO_FOTOS} fotos.</p>

            {fotos.length > 0 && (
              <ul className="mt-4 divide-y divide-acero-100 rounded-lg border border-acero-200">
                {fotos.map((f) => (
                  <li key={f.clave} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <p className="text-acero-800">
                        {f.archivo.name} <span className="text-acero-500">· {codigoDe(f.materialId)}</span>
                      </p>
                      {f.estado === "contando" && <p className="text-xs text-solar-700">Contando con IA…</p>}
                      {f.estado === "contada" && (
                        <p className="text-xs text-acero-600">
                          IA: {f.conteo} varillas
                          {f.confianza !== null && ` · confianza ${Math.round(f.confianza * 100)} %`}
                        </p>
                      )}
                      {f.mensaje && <p className="text-xs text-amber-800">{f.mensaje}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarFoto(f)}
                      disabled={f.estado === "contando"}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-acero-200 bg-superficie">
            <h2 className={`border-b border-acero-200 px-5 py-3 ${TITULO_TARJETA}`}>MATERIALES DEL LOTE</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-acero-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Cotizada</th>
                  <th className="px-3 py-2 text-right font-medium">Conteo IA</th>
                  <th className="px-3 py-2 text-right font-medium">Despachada</th>
                  <th className="px-5 py-2 text-right font-medium">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-acero-100">
                {validacion.materiales.map((m) => {
                  const valor = valorDe(m.material_id, m.cantidad);
                  const diferencia = esCantidad(valor) ? Number(valor) - m.cantidad : null;
                  return (
                    <tr key={m.material_id}>
                      <td className="px-5 py-2">
                        <span className="font-mono text-xs text-acero-500">{m.codigo}</span>
                        <span className="ml-2 text-acero-700">{m.nombre}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-acero-700">{m.cantidad}</td>
                      <td className="px-3 py-2 text-right text-acero-500">{conteoPorMaterial[m.material_id] ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          aria-label={`Despachada ${m.codigo}`}
                          inputMode="numeric"
                          value={valor}
                          onChange={(e) => setEditadas((c) => ({ ...c, [m.material_id]: e.target.value }))}
                          className={`w-24 rounded-lg border px-2 py-1 text-right text-sm text-acero-900 ${
                            esCantidad(valor) ? "border-acero-300 bg-acero-50" : "border-red-400 bg-red-50"
                          }`}
                        />
                      </td>
                      <td
                        className={`px-5 py-2 text-right font-medium ${
                          diferencia ? "text-amber-700" : "text-acero-400"
                        }`}
                      >
                        {diferencia === null
                          ? "—"
                          : diferencia > 0
                            ? `+${diferencia}`
                            : diferencia === 0
                              ? "0"
                              : diferencia}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={TARJETA}>
            <h2 className={TITULO_TARJETA}>TRAZABILIDAD DEL LOTE</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {TRAZABILIDAD.map((t) => (
                <label key={t.campo} className={ETIQUETA}>
                  {t.etiqueta} *
                  <input
                    className={`mt-1 ${CAMPO}`}
                    value={trazabilidad[t.campo]}
                    maxLength={120}
                    placeholder="Nombre y apellido"
                    onChange={(e) => setTrazabilidad((v) => ({ ...v, [t.campo]: e.target.value }))}
                  />
                </label>
              ))}
              <label className={`${ETIQUETA} sm:col-span-2`}>
                Destino *
                <input
                  className={`mt-1 ${CAMPO}`}
                  value={trazabilidad.destino}
                  maxLength={200}
                  placeholder="Proyecto o dirección de entrega"
                  onChange={(e) => setTrazabilidad((v) => ({ ...v, destino: e.target.value }))}
                />
              </label>
              <label className={`${ETIQUETA} sm:col-span-2`}>
                Justificación de diferencias {diferencias.length > 0 ? "*" : "(solo si alguna cantidad difiere)"}
                <textarea
                  className={`mt-1 ${CAMPO} ${diferencias.length > 0 && !justificacion.trim() ? "border-amber-400" : ""}`}
                  rows={3}
                  maxLength={2000}
                  value={justificacion}
                  placeholder="Por qué sale una cantidad distinta a la cotizada"
                  onChange={(e) => setJustificacion(e.target.value)}
                />
              </label>
            </div>
            {diferencias.length > 0 && (
              <p className="mt-2 text-xs text-amber-800">
                {diferencias.length === 1 ? "1 material difiere" : `${diferencias.length} materiales difieren`} de lo
                cotizado: {diferencias.map((m) => m.codigo).join(", ")}.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {impedimento && <p className="text-xs text-acero-500">{impedimento}</p>}
            <button
              type="button"
              onClick={() => void unaVez("despachar", confirmar)}
              disabled={impedimento !== null || enviando}
              title={impedimento ?? undefined}
              className="rounded-lg bg-solar-500 px-5 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Confirmar despacho"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
