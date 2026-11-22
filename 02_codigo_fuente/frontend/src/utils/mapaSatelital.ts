/**
 * Mapa satelital compartido por el Paso 1 (ubicación y terreno) y el
 * Paso 3 (caminos y bloques): la misma imagen, atribución y norte arriba.
 *
 * La imagen satelital es de Esri (World Imagery). La URL se puede cambiar
 * con VITE_MAPA_TILES_URL, por ejemplo para usar una clave propia.
 */
import L from "leaflet";

export const TILES_URL: string =
  import.meta.env.VITE_MAPA_TILES_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ATRIBUCION = "Imagen: Esri, Maxar, Earthstar Geographics";
export const ZOOM_MAXIMO = 19;

/** Mapa con la capa satelital, sin girar (el norte siempre arriba). */
export function crearMapaSatelital(contenedor: HTMLElement, centro: L.LatLngTuple, zoom: number): L.Map {
  const mapa = L.map(contenedor, { center: centro, zoom, maxZoom: ZOOM_MAXIMO, worldCopyJump: true });
  L.tileLayer(TILES_URL, { attribution: ATRIBUCION, maxZoom: ZOOM_MAXIMO }).addTo(mapa);
  return mapa;
}

/** Texto (por ejemplo, un largo) centrado en un punto y corrido `dx`, `dy` píxeles. */
export function iconoTexto(texto: string, [dx, dy]: [number, number] = [0, 0]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="etiqueta-lado" style="transform:translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px));display:inline-block;white-space:nowrap;padding:1px 5px;border-radius:4px;background:#0f172acc;color:#fff;font-size:11px;font-weight:600">${texto}</div>`,
    iconSize: [0, 0],
  });
}
