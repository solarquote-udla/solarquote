/**
 * Mapa satelital para ubicar el proyecto (RF-01, revisión del 16 de
 * noviembre). Reemplaza los campos de latitud y longitud: el usuario hace
 * clic sobre el terreno y el punto queda marcado. La latitud se usa para
 * la sombra entre filas.
 *
 * El mapa siempre tiene el norte hacia arriba.
 *
 * La imagen satelital es de Esri (World Imagery). La URL se puede cambiar
 * con VITE_MAPA_TILES_URL, por ejemplo para usar una clave propia.
 */
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

const TILES_URL =
  import.meta.env.VITE_MAPA_TILES_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIBUCION = "Imagen: Esri, Maxar, Earthstar Geographics";

/** Centro de Ecuador continental cuando el proyecto aún no tiene ubicación. */
const CENTRO_ECUADOR: L.LatLngTuple = [-1.5, -78.5];
const ZOOM_PAIS = 6;
const ZOOM_TERRENO = 17;

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

interface Props {
  valor: Coordenadas | null;
  onCambio: (coordenadas: Coordenadas) => void;
}

/** Redondeo a 6 decimales: unos 11 cm, más que suficiente para un terreno. */
const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

const ICONO = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 0 1px #00000066"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function MapaUbicacion({ valor, onCambio }: Props) {
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
    });
    L.tileLayer(TILES_URL, { attribution: ATRIBUCION, maxZoom: 19 }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      alCambiar.current({ latitud: redondear(e.latlng.lat), longitud: redondear(e.latlng.lng) });
    });
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El valor inicial solo centra el mapa; los cambios los maneja el efecto de abajo
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
      nuevo.on("dragend", () => {
        const p = nuevo.getLatLng();
        alCambiar.current({ latitud: redondear(p.lat), longitud: redondear(p.lng) });
      });
      marcador.current = nuevo.addTo(m);
    }
  }, [valor]);

  return (
    <div className="relative">
      <div
        ref={contenedor}
        className="h-64 w-full overflow-hidden rounded-lg border border-acero-300"
        role="application"
        aria-label="Mapa satelital: haz clic sobre el terreno para ubicar el proyecto"
      />
      <div
        className="pointer-events-none absolute right-2 top-2 z-[400] flex flex-col items-center rounded-md bg-white/90 px-1.5 py-1 text-xs font-bold text-acero-800 shadow"
        aria-hidden="true"
      >
        <span>N</span>
        <span className="leading-none">↑</span>
      </div>
    </div>
  );
}
