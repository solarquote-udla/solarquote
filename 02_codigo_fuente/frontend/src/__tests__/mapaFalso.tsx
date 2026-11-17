/**
 * Reemplazo del mapa satelital en las pruebas: Leaflet no se puede
 * cliquear en jsdom. Un botón marca un punto fijo, como un clic en el mapa.
 */
import type { Coordenadas } from "@/components/MapaUbicacion";

export const PUNTO_DEL_MAPA = { latitud: -0.2298, longitud: -78.5249 };

export function MapaFalso({ valor, onCambio }: { valor: Coordenadas | null; onCambio: (c: Coordenadas) => void }) {
  return (
    <div>
      <span data-testid="marcador">{valor ? `${valor.latitud},${valor.longitud}` : "sin marcador"}</span>
      <button type="button" onClick={() => onCambio(PUNTO_DEL_MAPA)}>
        CLIC EN EL MAPA
      </button>
    </div>
  );
}
