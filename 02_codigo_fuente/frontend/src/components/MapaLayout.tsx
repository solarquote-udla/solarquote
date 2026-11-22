/**
 * Layout sobre la imagen satelital (Paso 3 y confirmación): terreno,
 * caminos y bloques con el color de su inversor, para ver si la planta
 * calza en el terreno real (revisión del 16 de noviembre, Lenin, y de UX
 * del 21 de noviembre).
 *
 * También sirve para dibujar un camino: el usuario marca su eje con
 * clics y el mapa muestra el camino con su ancho y el largo de cada
 * tramo mientras lo dibuja.
 *
 * Todo llega en metros del plano. El mapa lo pasa a latitud y longitud
 * con el punto de ubicación del proyecto y la orientación del norte del
 * terreno (utils/terrenoMapa.ts), igual que el Paso 1.
 */
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";

import type { Punto } from "@/types/api";
import { corredor } from "@/utils/caminos";
import { colorInversor } from "@/utils/inversores";
import { crearMapaSatelital, iconoTexto } from "@/utils/mapaSatelital";
import { aMapa, aPlano, type Coordenadas } from "@/utils/terrenoMapa";

export interface BloqueMapa {
  vertices: Punto[];
  inversor: number;
  en_proporcion: boolean;
}

export interface CaminoMapa {
  vertices: Punto[];
  nombre: string | null;
}

export interface DibujoCamino {
  /** Eje marcado hasta ahora, en metros del plano */
  eje: Punto[];
  ancho: number;
  /** Punto que quedaría bajo el cursor (ya ajustado a 90°, si corresponde) */
  vistaPrevia: (p: Punto) => Punto;
  onPunto: (p: Punto) => void;
}

interface Props {
  ubicacion: Coordenadas;
  /** Grados del norte en sentido horario desde +Y del plano; null = arriba */
  orientacionNorte: number | null;
  terreno: Punto[];
  caminos: CaminoMapa[];
  bloques: BloqueMapa[];
  /** Con esto, los clics marcan el eje de un camino nuevo */
  dibujo?: DibujoCamino | null;
  alto?: string;
}

const AMARILLO = "#f59e0b";
const GRIS_CAMINO = "#cbd5e1";

const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 });
const metros = (v: number) => `${numero.format(v)} m`;

export function MapaLayout({ ubicacion, orientacionNorte, terreno, caminos, bloques, dibujo, alto = "h-[32rem]" }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaFija = useRef<L.LayerGroup | null>(null);
  const capaDibujo = useRef<L.LayerGroup | null>(null);
  const capaPrevia = useRef<L.LayerGroup | null>(null);
  const dibujoActual = useRef(dibujo);
  // El mapa se encuadra en el terreno una vez; después el usuario manda
  const encuadrado = useRef(false);
  const norte = orientacionNorte ?? 0;

  // Conversión del plano al mapa, estable mientras no cambie la ubicación
  const conversion = useMemo(
    () => ({
      aGeo: (p: Punto): L.LatLngTuple => {
        const c = aMapa(ubicacion, p, norte);
        return [c.latitud, c.longitud];
      },
      aMetros: (ll: L.LatLng): Punto => aPlano(ubicacion, { latitud: ll.lat, longitud: ll.lng }, norte),
    }),
    [ubicacion, norte],
  );
  const conversionActual = useRef(conversion);

  useEffect(() => {
    dibujoActual.current = dibujo;
    conversionActual.current = conversion;
  }, [dibujo, conversion]);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!contenedor.current) return;
    const m = crearMapaSatelital(contenedor.current, [ubicacion.latitud, ubicacion.longitud], 17);
    capaFija.current = L.layerGroup().addTo(m);
    capaDibujo.current = L.layerGroup().addTo(m);
    capaPrevia.current = L.layerGroup().addTo(m);

    m.on("click", (e: L.LeafletMouseEvent) => {
      const d = dibujoActual.current;
      if (d) d.onPunto(conversionActual.current.aMetros(e.latlng));
    });
    // Tramo que sigue al cursor, con su largo
    m.on("mousemove", (e: L.LeafletMouseEvent) => {
      const previa = capaPrevia.current;
      const d = dibujoActual.current;
      previa?.clearLayers();
      if (!previa || !d || d.eje.length === 0) return;
      const { aGeo, aMetros } = conversionActual.current;
      const ultimo = d.eje[d.eje.length - 1];
      const p = d.vistaPrevia(aMetros(e.latlng));
      L.polyline([aGeo(ultimo), aGeo(p)], { color: AMARILLO, weight: 2, dashArray: "6 6", interactive: false }).addTo(previa);
      const medio: Punto = [(ultimo[0] + p[0]) / 2, (ultimo[1] + p[1]) / 2];
      L.marker(aGeo(medio), {
        icon: iconoTexto(metros(Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]))),
        interactive: false,
        keyboard: false,
      }).addTo(previa);
    });
    m.on("mouseout", () => capaPrevia.current?.clearLayers());
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // La ubicación inicial solo centra el mapa; el encuadre lo hace el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terreno, caminos y bloques
  useEffect(() => {
    const m = mapa.current;
    const capa = capaFija.current;
    if (!m || !capa) return;
    capa.clearLayers();
    const { aGeo } = conversion;

    if (terreno.length >= 3) {
      const contorno = L.polygon(terreno.map(aGeo), { color: AMARILLO, weight: 2, fill: false, interactive: false }).addTo(capa);
      if (!encuadrado.current) {
        m.fitBounds(contorno.getBounds(), { padding: [24, 24], maxZoom: 19 });
        encuadrado.current = true;
      }
    }
    for (const c of caminos) {
      if (c.vertices.length < 3) continue;
      L.polygon(c.vertices.map(aGeo), { color: "#64748b", weight: 1, fillColor: GRIS_CAMINO, fillOpacity: 0.75 })
        .bindTooltip(c.nombre ?? "Camino", { sticky: true })
        .addTo(capa);
    }
    for (const b of bloques) {
      const color = colorInversor(b.inversor).hex;
      L.polygon(b.vertices.map(aGeo), {
        color: b.en_proporcion ? "#ffffff" : AMARILLO,
        weight: b.en_proporcion ? 0.5 : 1.5,
        dashArray: b.en_proporcion ? undefined : "4 3",
        fillColor: color,
        fillOpacity: 0.85,
        interactive: false,
      }).addTo(capa);
    }
  }, [conversion, terreno, caminos, bloques]);

  // Camino a medio dibujar
  useEffect(() => {
    const m = mapa.current;
    const capa = capaDibujo.current;
    if (!m || !capa) return;
    capa.clearLayers();
    capaPrevia.current?.clearLayers();
    if (dibujo) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
    if (!dibujo || dibujo.eje.length === 0) return;
    const { aGeo } = conversion;

    const poligono = corredor(dibujo.eje, dibujo.ancho);
    if (poligono.length >= 3) {
      L.polygon(poligono.map(aGeo), { color: AMARILLO, weight: 1, fillColor: GRIS_CAMINO, fillOpacity: 0.6, interactive: false }).addTo(capa);
    }
    L.polyline(dibujo.eje.map(aGeo), { color: AMARILLO, weight: 2, interactive: false }).addTo(capa);
    dibujo.eje.forEach((p, i) => {
      L.circleMarker(aGeo(p), { radius: 4, color: "#ffffff", weight: 2, fillColor: AMARILLO, fillOpacity: 1, interactive: false }).addTo(capa);
      if (i === 0) return;
      const a = dibujo.eje[i - 1];
      L.marker(aGeo([(a[0] + p[0]) / 2, (a[1] + p[1]) / 2]), {
        icon: iconoTexto(metros(Math.hypot(p[0] - a[0], p[1] - a[1]))),
        interactive: false,
        keyboard: false,
      }).addTo(capa);
    });
  }, [conversion, dibujo]);

  return (
    <div className="relative">
      <div
        ref={contenedor}
        className={`${alto} w-full overflow-hidden rounded-xl border border-acero-300`}
        role="application"
        aria-label={
          dibujo
            ? "Mapa satelital: haz clic para marcar el eje del camino"
            : `Mapa satelital con el layout: ${bloques.length} bloques y ${caminos.length} caminos`
        }
      />
      <div
        className="pointer-events-none absolute right-3 top-3 z-[400] flex h-11 w-11 flex-col items-center justify-center rounded-full shadow-md"
        style={{ background: "#ffffff", color: "#0f172a" }}
        aria-hidden="true"
      >
        <span className="text-xs font-bold leading-none">N</span>
        <span className="text-base leading-none">↑</span>
      </div>
    </div>
  );
}
