/**
 * Mapa satelital para ubicar el proyecto (RF-01, revisión del 16 de
 * noviembre), al estilo de Smart Design: el usuario busca la dirección o
 * hace clic sobre el terreno y el punto queda marcado; se puede arrastrar.
 * La latitud se usa para la sombra entre filas.
 *
 * El mapa siempre tiene el norte hacia arriba.
 *
 * La imagen satelital es de Esri (World Imagery). La URL se puede cambiar
 * con VITE_MAPA_TILES_URL, por ejemplo para usar una clave propia.
 */
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { normalizarLongitud, redondearCoordenada } from "@/utils/coordenadas";

const TILES_URL =
  import.meta.env.VITE_MAPA_TILES_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIBUCION = "Imagen: Esri, Maxar, Earthstar Geographics";

/** Centro de Ecuador continental cuando el proyecto aún no tiene ubicación. */
const CENTRO_ECUADOR: L.LatLngTuple = [-1.5, -78.5];
const ZOOM_PAIS = 6;
export const ZOOM_TERRENO = 17;

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

interface Props {
  valor: Coordenadas | null;
  onCambio: (coordenadas: Coordenadas) => void;
  /** Cada vez que cambia, el mapa se acerca al punto (por ejemplo, tras buscar una dirección). */
  enfoque?: number;
  /** Clase de altura del mapa (Tailwind). */
  alto?: string;
}

const ICONO = L.divIcon({
  className: "",
  html: '<div style="width:20px;height:20px;border-radius:9999px;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 1px #00000066"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const aCoordenadas = (p: L.LatLng): Coordenadas => ({
  latitud: redondearCoordenada(p.lat),
  longitud: normalizarLongitud(p.lng),
});

export function MapaUbicacion({ valor, onCambio, enfoque = 0, alto = "h-64" }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const alCambiar = useRef(onCambio);
  useEffect(() => {
    alCambiar.current = onCambio;
  }, [onCambio]);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, {
      center: valor ? [valor.latitud, valor.longitud] : CENTRO_ECUADOR,
      zoom: valor ? ZOOM_TERRENO : ZOOM_PAIS,
      maxZoom: 19,
      worldCopyJump: true,
    });
    L.tileLayer(TILES_URL, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => alCambiar.current(aCoordenadas(e.latlng)));
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El valor inicial solo centra el mapa; los cambios los manejan los efectos de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mostrar, mover o quitar el marcador
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!valor) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }
    const punto: L.LatLngTuple = [valor.latitud, valor.longitud];
    if (marcador.current) {
      marcador.current.setLatLng(punto);
    } else {
      const nuevo = L.marker(punto, { icon: ICONO, draggable: true, keyboard: false });
      nuevo.on("dragend", () => alCambiar.current(aCoordenadas(nuevo.getLatLng())));
      marcador.current = nuevo.addTo(m);
    }
  }, [valor]);

  // Acercarse al punto cuando se pide (búsqueda de dirección)
  useEffect(() => {
    if (enfoque === 0 || !valor) return;
    mapa.current?.setView([valor.latitud, valor.longitud], ZOOM_TERRENO);
    // Solo reacciona al pedido de enfoque, no a cada movimiento del punto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfoque]);

  return (
    <div className="relative">
      <div
        ref={contenedor}
        className={`${alto} w-full overflow-hidden rounded-lg border border-acero-300`}
        role="application"
        aria-label="Mapa satelital: haz clic sobre el terreno para ubicar el proyecto"
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
