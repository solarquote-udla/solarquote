/**
 * Reemplazo del mapa satelital en las pruebas: Leaflet no se puede
 * cliquear en jsdom. Un botón marca un punto fijo, como un clic en el mapa.
 * Con `dibujo`, otros botones hacen lo que harían los clics sobre el
 * terreno: marcar esquinas, cerrar, mover, agregar y quitar vértices.
 */
import type { Coordenadas, DibujoMapa } from "@/components/MapaUbicacion";
import type { Punto } from "@/types/api";
import { aMapa } from "@/utils/terrenoMapa";

export const PUNTO_DEL_MAPA = { latitud: -0.2298, longitud: -78.5249 };

/** Esquinas que marca "CLIC DIBUJO", en metros desde el punto. La tercera está a 89°: se ajusta a 90°. */
export const ESQUINAS: Punto[] = [
  [0, 0],
  [100, 0],
  [101.5, 60],
  [0, 60],
];

interface Props {
  valor: Coordenadas | null;
  onCambio: (c: Coordenadas) => void;
  dibujo?: DibujoMapa;
}

export function MapaFalso({ valor, onCambio, dibujo }: Props) {
  const origen = valor ?? PUNTO_DEL_MAPA;
  return (
    <div>
      <span data-testid="marcador">{valor ? `${valor.latitud},${valor.longitud}` : "sin marcador"}</span>
      <button type="button" onClick={() => onCambio(PUNTO_DEL_MAPA)}>
        CLIC EN EL MAPA
      </button>
      {dibujo && (
        <>
          <span data-testid="lados-mapa">{dibujo.etiquetas.join(" | ")}</span>
          <span data-testid="contorno-mapa">{dibujo.contorno.length}</span>
          <span data-testid="dibujando-mapa">{dibujo.dibujando ? "si" : "no"}</span>
          <button type="button" onClick={() => dibujo.onClicDibujo(aMapa(origen, ESQUINAS[dibujo.borrador.length % ESQUINAS.length]))}>
            CLIC DIBUJO
          </button>
          <button type="button" onClick={dibujo.onCerrarBorrador}>
            CERRAR EN EL MAPA
          </button>
          <button type="button" onClick={() => dibujo.onMoverVertice(1, aMapa(origen, [120, 0]))}>
            MOVER VERTICE 2
          </button>
          <button type="button" onClick={() => dibujo.onInsertarVertice(0)}>
            MITAD LADO 1
          </button>
          <button type="button" onClick={() => dibujo.onQuitarVertice(0)}>
            QUITAR VERTICE 1
          </button>
        </>
      )}
    </div>
  );
}
