/**
 * Plano del layout (RF-03): terreno, caminos y bloques.
 *
 * Usa el mismo sistema de coordenadas que EditorPoligonos (metros, grupo
 * con `scale(1, -1)` para que el norte quede arriba), así que el terreno
 * se ve igual en las dos pestañas.
 *
 * Dos modos:
 *   - Lectura: solo dibuja.
 *   - Edición (SQ-64): clic selecciona un bloque, arrastrar lo mueve. El
 *     componente no decide nada: informa el desplazamiento en metros y la
 *     página actualiza el borrador y valida.
 *
 * Colores:
 *   azul   bloque en proporción
 *   ámbar  bloque que se aparta de ancho = 3 × largo (RF-03 lo exige)
 *   rojo   bloque que no se puede guardar (fuera del terreno, sobre un
 *          camino o encima de otro)
 */

import { useRef, type PointerEvent } from "react";

import type { Punto } from "@/types/api";
import { encuadre, marcas, pasoCuadricula } from "@/utils/geometria";

export interface BloqueDibujo {
  clave: number;
  vertices: Punto[];
  tipo: string;
  paneles_largo: number;
  paneles_ancho: number;
  en_proporcion: boolean;
  /** Motivo por el que no se puede guardar; undefined si es válido */
  problema?: string;
}

interface Props {
  terreno: Punto[];
  caminos: Punto[][];
  bloques: BloqueDibujo[];
  /** Grados del norte en sentido horario desde +Y. Null = sin definir. */
  orientacionNorte: number | null;
  /** Atenúa los bloques cuando el layout ya no corresponde a los datos */
  desactualizado?: boolean;

  // ─── Edición ─────────────────────────────────────────
  editable?: boolean;
  seleccionado?: number | null;
  onSeleccionar?: (clave: number | null) => void;
  onIniciarArrastre?: (clave: number) => void;
  /** Desplazamiento total desde que empezó el arrastre, en metros del terreno */
  onArrastrar?: (clave: number, desplazamiento: Punto) => void;
}

const puntos = (vertices: Punto[]) => vertices.map(([x, y]) => `${x},${y}`).join(" ");

function centro(vertices: Punto[]): Punto {
  const n = vertices.length;
  return [
    vertices.reduce((s, [x]) => s + x, 0) / n,
    vertices.reduce((s, [, y]) => s + y, 0) / n,
  ];
}

/** Lado más corto del bloque: decide si la letra entra adentro. */
function ladoMenor(vertices: Punto[]): number {
  const [a, b, c] = vertices;
  return Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]));
}

function claseBloque(b: BloqueDibujo): string {
  if (b.problema) return "fill-red-500/70 stroke-red-800";
  return b.en_proporcion ? "fill-sky-600/80 stroke-sky-900" : "fill-amber-400/90 stroke-amber-700";
}

export function VistaLayout({
  terreno,
  caminos,
  bloques,
  orientacionNorte,
  desactualizado,
  editable = false,
  seleccionado = null,
  onSeleccionar,
  onIniciarArrastre,
  onArrastrar,
}: Props) {
  const grupoRef = useRef<SVGGElement>(null);
  // Arrastre en curso: qué bloque y dónde empezó, en metros del terreno.
  const arrastre = useRef<{ clave: number; inicio: Punto; movio: boolean } | null>(null);

  const lim = encuadre([...terreno, ...caminos.flat()], { ancho: 1, alto: 1 });
  const ancho = lim.maxX - lim.minX;
  const alto = lim.maxY - lim.minY;
  const extension = Math.max(ancho, alto);
  const paso = pasoCuadricula(extension);
  const fuente = extension / 45;

  /** Pantalla → metros del terreno, invirtiendo la matriz del grupo volteado. */
  function aTerreno(evento: PointerEvent): Punto | null {
    const matriz = grupoRef.current?.getScreenCTM();
    if (!matriz) return null;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse());
    return [p.x, p.y];
  }

  function alPresionarBloque(evento: PointerEvent<SVGPolygonElement>, clave: number) {
    if (!editable) return;
    evento.stopPropagation();
    const inicio = aTerreno(evento);
    if (!inicio) return;
    onSeleccionar?.(clave);
    onIniciarArrastre?.(clave);
    arrastre.current = { clave, inicio, movio: false };
    (evento.currentTarget.ownerSVGElement ?? evento.currentTarget).setPointerCapture(evento.pointerId);
  }

  function alMover(evento: PointerEvent<SVGSVGElement>) {
    const a = arrastre.current;
    if (!a) return;
    const actual = aTerreno(evento);
    if (!actual) return;
    a.movio = true;
    onArrastrar?.(a.clave, [actual[0] - a.inicio[0], actual[1] - a.inicio[1]]);
  }

  function alSoltar() {
    arrastre.current = null;
  }

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-acero-200 bg-white">
      <svg
        viewBox={`${lim.minX} ${-lim.maxY} ${ancho} ${alto}`}
        preserveAspectRatio="xMidYMid meet"
        className={["h-full w-full select-none", editable ? "touch-none" : ""].join(" ")}
        role="img"
        aria-label="Plano del layout solar"
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onPointerDown={() => editable && onSeleccionar?.(null)}
      >
        <g ref={grupoRef} transform="scale(1,-1)">
          {marcas(lim.minX, lim.maxX, paso).map((x) => (
            <line key={`vx${x}`} x1={x} y1={lim.minY} x2={x} y2={lim.maxY} className="stroke-acero-100" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {marcas(lim.minY, lim.maxY, paso).map((y) => (
            <line key={`hy${y}`} x1={lim.minX} y1={y} x2={lim.maxX} y2={y} className="stroke-acero-100" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}

          <polygon points={puntos(terreno)} className="fill-acero-50 stroke-acero-500" strokeWidth={2} vectorEffect="non-scaling-stroke" />

          {caminos.map((c, i) => (
            <polygon key={`c${i}`} points={puntos(c)} className="fill-acero-300/70 stroke-acero-500" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}

          <g opacity={desactualizado ? 0.35 : 1}>
            {bloques.map((b) => (
              <polygon
                key={b.clave}
                points={puntos(b.vertices)}
                className={[claseBloque(b), editable ? "cursor-move" : ""].join(" ")}
                strokeWidth={b.clave === seleccionado ? 3 : 1}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => alPresionarBloque(e, b.clave)}
              >
                <title>
                  {`Bloque ${b.tipo} · ${b.paneles_largo} × ${b.paneles_ancho} = ${b.paneles_largo * b.paneles_ancho} paneles`}
                  {b.problema ? ` · ${b.problema}` : b.en_proporcion ? "" : " · fuera de proporción"}
                </title>
              </polygon>
            ))}
            {/* Contorno resaltado del seleccionado, encima de todo */}
            {bloques
              .filter((b) => b.clave === seleccionado)
              .map((b) => (
                <polygon key="seleccion" points={puntos(b.vertices)} fill="none" className="pointer-events-none stroke-solar-600" strokeWidth={3} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
              ))}
          </g>
        </g>

        {/* Letras de tipo: fuera del grupo volteado para que no salgan en espejo */}
        <g fontSize={fuente * 0.8} textAnchor="middle" dominantBaseline="central" className="pointer-events-none font-semibold">
          {bloques.map((b) => {
            if (ladoMenor(b.vertices) < fuente) return null;
            const [x, y] = centro(b.vertices);
            const color = b.problema ? "fill-white" : b.en_proporcion ? "fill-white" : "fill-amber-900";
            return (
              <text key={`t${b.clave}`} x={x} y={-y} className={color}>
                {b.tipo}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Rosa del norte */}
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center rounded-md bg-white/90 px-2 py-1.5 shadow-sm">
        <svg viewBox="-12 -12 24 24" className="h-8 w-8" style={{ transform: `rotate(${orientacionNorte ?? 0}deg)` }} aria-hidden="true">
          <polygon points="0,-11 5,6 0,2 -5,6" className={orientacionNorte == null ? "fill-acero-300" : "fill-red-600"} />
        </svg>
        <span className="text-[10px] font-semibold text-acero-600">N{orientacionNorte == null ? "?" : ""}</span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-md bg-white/90 px-3 py-1.5 text-xs text-acero-600 shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-sky-600" /> En proporción
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Fuera de proporción
        </span>
        {editable && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-500" /> No se puede guardar
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-acero-300" /> Camino
        </span>
      </div>
    </div>
  );
}
