/**
 * Lienzo para dibujar el terreno y sus caminos (RF-01).
 *
 * Componente presentacional: no sabe qué significa lo que dibuja ni
 * guarda nada. Recibe los polígonos, los pinta en metros y avisa a la
 * página de cada clic. La página decide si ese punto va al terreno o a
 * un camino.
 *
 * Sistema de coordenadas
 * ──────────────────────
 * Las unidades del SVG son metros. El eje Y del SVG crece hacia abajo,
 * pero en un plano de terreno el norte va arriba, así que el contenido
 * se dibuja dentro de un grupo con `scale(1, -1)`. Para convertir un
 * clic en coordenadas del terreno basta invertir la matriz de pantalla
 * de ese grupo: la inversión ya incluye el volteo.
 *
 * Los textos no pueden ir en el grupo volteado —se verían en espejo—,
 * así que van en un grupo aparte con la Y negada a mano.
 */

import { useRef, useState, type MouseEvent } from "react";

import type { Punto } from "@/types/api";
import {
  ajustar,
  distancia,
  encuadre,
  formatearMetros,
  marcas,
  pasoCuadricula,
} from "@/utils/geometria";

export interface CaminoDibujo {
  clave: string;
  nombre: string | null;
  vertices: Punto[];
}

interface Props {
  terreno: Punto[];
  caminos: CaminoDibujo[];
  borrador: Punto[];
  /** Qué se está dibujando; `null` deshabilita los clics. */
  dibujando: "terreno" | "camino" | null;
  /** Extensión mínima visible, en metros. */
  lienzo: { ancho: number; alto: number };
  /** Redondeo de los clics, en metros. `null` = sin ajuste. */
  pasoAjuste: number | null;
  onAgregarPunto: (punto: Punto) => void;
  /** Se llama al hacer clic sobre el primer vértice del borrador. */
  onCerrarBorrador: () => void;
}

const redondear = (v: number) => Math.round(v * 100) / 100;

export function EditorPoligonos({
  terreno,
  caminos,
  borrador,
  dibujando,
  lienzo,
  pasoAjuste,
  onAgregarPunto,
  onCerrarBorrador,
}: Props) {
  const grupoRef = useRef<SVGGElement>(null);
  const [cursor, setCursor] = useState<Punto | null>(null);

  const todos: Punto[] = [...terreno, ...caminos.flatMap((c) => c.vertices), ...borrador];
  const lim = encuadre(todos, lienzo);
  const ancho = lim.maxX - lim.minX;
  const alto = lim.maxY - lim.minY;
  const extension = Math.max(ancho, alto);
  const paso = pasoCuadricula(extension);

  // Tamaños en metros, proporcionales al encuadre, para que vértices y
  // textos se vean igual en un terreno de 50 m que en uno de 500 m.
  const radio = extension / 140;
  const fuente = extension / 45;

  function aCoordenadas(evento: MouseEvent<SVGSVGElement>): Punto | null {
    const matriz = grupoRef.current?.getScreenCTM();
    if (!matriz) return null;

    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse());
    const x = pasoAjuste ? ajustar(p.x, pasoAjuste) : p.x;
    const y = pasoAjuste ? ajustar(p.y, pasoAjuste) : p.y;
    return [redondear(x), redondear(y)];
  }

  function manejarClic(evento: MouseEvent<SVGSVGElement>) {
    if (!dibujando) return;
    const punto = aCoordenadas(evento);
    if (!punto) return;

    // Clic sobre el primer vértice: cerrar el polígono, como en
    // cualquier herramienta de dibujo.
    if (borrador.length >= 3 && distancia(punto, borrador[0]) <= radio * 2.5) {
      onCerrarBorrador();
      return;
    }

    onAgregarPunto(punto);
  }

  const ultimo = borrador.at(-1);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-xl border border-acero-200 bg-white">
      <svg
        viewBox={`${lim.minX} ${-lim.maxY} ${ancho} ${alto}`}
        preserveAspectRatio="xMidYMid meet"
        className={["h-full w-full select-none", dibujando ? "cursor-crosshair" : ""].join(" ")}
        onClick={manejarClic}
        onMouseMove={(e) => setCursor(aCoordenadas(e))}
        onMouseLeave={() => setCursor(null)}
        role="img"
        aria-label="Plano del terreno"
      >
        {/* ─── Contenido en coordenadas del terreno (Y hacia arriba) ─── */}
        <g ref={grupoRef} transform="scale(1,-1)">
          {marcas(lim.minX, lim.maxX, paso).map((x) => (
            <line
              key={`vx${x}`}
              x1={x}
              y1={lim.minY}
              x2={x}
              y2={lim.maxY}
              className={x === 0 ? "stroke-acero-400" : "stroke-acero-100"}
              strokeWidth={x === 0 ? 1.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {marcas(lim.minY, lim.maxY, paso).map((y) => (
            <line
              key={`hy${y}`}
              x1={lim.minX}
              y1={y}
              x2={lim.maxX}
              y2={y}
              className={y === 0 ? "stroke-acero-400" : "stroke-acero-100"}
              strokeWidth={y === 0 ? 1.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {terreno.length >= 3 && (
            <polygon
              points={terreno.map((p) => p.join(",")).join(" ")}
              className="fill-solar-100 stroke-solar-500"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {caminos.map((camino) => (
            <polygon
              key={camino.clave}
              points={camino.vertices.map((p) => p.join(",")).join(" ")}
              className="fill-acero-300/70 stroke-acero-500"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {terreno.map(([x, y], i) => (
            <circle key={`vt${i}`} cx={x} cy={y} r={radio} className="fill-solar-600" />
          ))}

          {/* Borrador: lo que se está dibujando ahora */}
          {borrador.length > 0 && (
            <polyline
              points={borrador.map((p) => p.join(",")).join(" ")}
              fill="none"
              className="stroke-sky-600"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {dibujando && ultimo && cursor && (
            <line
              x1={ultimo[0]}
              y1={ultimo[1]}
              x2={cursor[0]}
              y2={cursor[1]}
              className="stroke-sky-400"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {borrador.map(([x, y], i) => (
            <circle
              key={`vb${i}`}
              cx={x}
              cy={y}
              // El primer vértice se agranda cuando ya se puede cerrar
              r={i === 0 && borrador.length >= 3 ? radio * 1.8 : radio}
              className={i === 0 ? "fill-sky-700" : "fill-sky-500"}
            />
          ))}
        </g>

        {/* ─── Textos (Y negada a mano para no verlos en espejo) ─── */}
        <g fontSize={fuente} className="fill-acero-400">
          {marcas(lim.minX, lim.maxX, paso).map((x) => (
            <text key={`tx${x}`} x={x} y={-lim.minY - fuente * 0.4} textAnchor="middle">
              {x}
            </text>
          ))}
          {marcas(lim.minY, lim.maxY, paso).map((y) => (
            <text key={`ty${y}`} x={lim.minX + fuente * 0.4} y={-y - fuente * 0.3}>
              {y}
            </text>
          ))}
        </g>

        {/* Cotas: longitud de cada lado del terreno */}
        <g fontSize={fuente} textAnchor="middle" className="fill-solar-800">
          {terreno.length >= 3 &&
            terreno.map((a, i) => {
              const b = terreno[(i + 1) % terreno.length];
              return (
                <text
                  key={`cota${i}`}
                  x={(a[0] + b[0]) / 2}
                  y={-(a[1] + b[1]) / 2}
                  dominantBaseline="middle"
                  stroke="white"
                  strokeWidth={fuente * 0.35}
                  paintOrder="stroke"
                >
                  {formatearMetros(distancia(a, b))}
                </text>
              );
            })}
        </g>

        {/* Nombre de cada camino en su centro aproximado */}
        <g fontSize={fuente * 0.85} textAnchor="middle" className="fill-acero-700">
          {caminos
            .filter((c) => c.nombre)
            .map((c) => {
              const cx = c.vertices.reduce((s, p) => s + p[0], 0) / c.vertices.length;
              const cy = c.vertices.reduce((s, p) => s + p[1], 0) / c.vertices.length;
              return (
                <text
                  key={`nc${c.clave}`}
                  x={cx}
                  y={-cy}
                  dominantBaseline="middle"
                  stroke="white"
                  strokeWidth={fuente * 0.3}
                  paintOrder="stroke"
                >
                  {c.nombre}
                </text>
              );
            })}
        </g>
      </svg>

      {/* Lectura de coordenadas del cursor */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-1 font-mono text-xs text-acero-600 shadow-sm">
        {cursor ? `x ${cursor[0].toFixed(2)} · y ${cursor[1].toFixed(2)} m` : "— m"}
      </div>

      {dibujando && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-sky-50 px-3 py-1.5 text-xs text-sky-800 shadow-sm">
          {borrador.length < 3
            ? `Dibujando ${dibujando}: haz clic para agregar vértices (${borrador.length}/3 mínimo)`
            : "Clic en el primer vértice o en «Cerrar polígono» para terminar"}
        </div>
      )}
    </div>
  );
}
