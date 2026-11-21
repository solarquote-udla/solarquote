/**
 * Mapa satelital para ubicar el proyecto (RF-01, revisión del 16 de
 * noviembre), al estilo de Smart Design: el usuario busca la dirección o
 * hace clic sobre el terreno y el punto queda marcado; se puede arrastrar.
 * La latitud se usa para la sombra entre filas.
 *
 * El mapa siempre tiene el norte hacia arriba.
 *
 * Con `dibujo`, el mapa también muestra el contorno del terreno y sus
 * caminos, con el largo de cada lado, y permite dibujarlo con clics,
 * mover sus vértices, agregar uno en la mitad de un lado y quitarlo con
 * doble clic. El mapa solo trabaja con latitud y longitud: la página
 * pasa todo a metros (utils/terrenoMapa.ts).
 *
 * La imagen satelital es de Esri (World Imagery). La URL se puede cambiar
 * con VITE_MAPA_TILES_URL, por ejemplo para usar una clave propia.
 */
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import { normalizarLongitud, redondearCoordenada } from "@/utils/coordenadas";
import { desplazamientoEtiqueta, type Coordenadas } from "@/utils/terrenoMapa";

export type { Coordenadas } from "@/utils/terrenoMapa";

const TILES_URL =
  import.meta.env.VITE_MAPA_TILES_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIBUCION = "Imagen: Esri, Maxar, Earthstar Geographics";

/** Centro de Ecuador continental cuando el proyecto aún no tiene ubicación. */
const CENTRO_ECUADOR: L.LatLngTuple = [-1.5, -78.5];
const ZOOM_PAIS = 6;
export const ZOOM_TERRENO = 17;

export interface DibujoMapa {
  /** Contorno guardado del terreno; vacío si todavía no hay. */
  contorno: Coordenadas[];
  /** Largo de cada lado del contorno, ya formateado. */
  etiquetas: string[];
  caminos: Coordenadas[][];
  /** Contorno a medio dibujar. */
  borrador: Coordenadas[];
  etiquetasBorrador: string[];
  dibujando: boolean;
  /** Punto que quedaría bajo el cursor (ya ajustado a 90°) y el largo del lado. */
  vistaPrevia: (c: Coordenadas) => { punto: Coordenadas; etiqueta: string } | null;
  onClicDibujo: (c: Coordenadas) => void;
  onCerrarBorrador: () => void;
  onMoverVertice: (i: number, c: Coordenadas) => void;
  onInsertarVertice: (i: number) => void;
  onQuitarVertice: (i: number) => void;
}

interface Props {
  valor: Coordenadas | null;
  onCambio: (coordenadas: Coordenadas) => void;
  /** Cada vez que cambia, el mapa se acerca al punto (por ejemplo, tras buscar una dirección). */
  enfoque?: number;
  /** Clase de altura del mapa (Tailwind). */
  alto?: string;
  /** Contorno del terreno sobre el mapa. Sin él, el mapa solo ubica el punto. */
  dibujo?: DibujoMapa;
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

const aLatLng = (c: Coordenadas): L.LatLngTuple => [c.latitud, c.longitud];

const AMARILLO = "#f59e0b";

const VERTICE = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;background:#fff;border:2px solid #f59e0b;box-shadow:0 0 0 1px #00000066"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const PRIMER_VERTICE = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 1px #00000066"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const MITAD = L.divIcon({
  className: "",
  html: '<div style="width:10px;height:10px;border-radius:9999px;background:#ffffffcc;border:1px solid #f59e0b"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

/** Texto con el largo de un lado, centrado en su mitad. */
function etiqueta(texto: string, [dx, dy]: [number, number] = [0, 0]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="etiqueta-lado" style="transform:translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px));display:inline-block;white-space:nowrap;padding:1px 5px;border-radius:4px;background:#0f172acc;color:#fff;font-size:11px;font-weight:600">${texto}</div>`,
    iconSize: [0, 0],
  });
}

const mitad = (a: Coordenadas, b: Coordenadas): L.LatLngTuple => [
  (a.latitud + b.latitud) / 2,
  (a.longitud + b.longitud) / 2,
];

export function MapaUbicacion({ valor, onCambio, enfoque = 0, alto = "h-64", dibujo }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const capaDibujo = useRef<L.LayerGroup | null>(null);
  const capaPrevia = useRef<L.LayerGroup | null>(null);
  const alCambiar = useRef(onCambio);
  const dibujoActual = useRef(dibujo);
  useEffect(() => {
    alCambiar.current = onCambio;
    dibujoActual.current = dibujo;
  }, [onCambio, dibujo]);

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
    capaDibujo.current = L.layerGroup().addTo(m);
    capaPrevia.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const d = dibujoActual.current;
      if (d?.dibujando) {
        d.onClicDibujo(aCoordenadas(e.latlng));
        return;
      }
      // Con el terreno dibujado, un clic suelto no mueve la ubicación: el
      // contorno está medido desde ese punto. El punto se puede arrastrar.
      if (d && d.contorno.length >= 3) return;
      alCambiar.current(aCoordenadas(e.latlng));
    });
    // Lado que se está dibujando: sigue al cursor con su largo
    m.on("mousemove", (e: L.LeafletMouseEvent) => {
      const d = dibujoActual.current;
      const previa = capaPrevia.current;
      if (!previa) return;
      previa.clearLayers();
      if (!d?.dibujando || d.borrador.length === 0) return;
      const vista = d.vistaPrevia(aCoordenadas(e.latlng));
      if (!vista) return;
      const ultimo = d.borrador[d.borrador.length - 1];
      L.polyline([aLatLng(ultimo), aLatLng(vista.punto)], { color: AMARILLO, weight: 2, dashArray: "6 6", interactive: false }).addTo(previa);
      L.marker(mitad(ultimo, vista.punto), { icon: etiqueta(vista.etiqueta), interactive: false, keyboard: false }).addTo(previa);
    });
    m.on("mouseout", () => capaPrevia.current?.clearLayers());
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      marcador.current = null;
      capaDibujo.current = null;
      capaPrevia.current = null;
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

  // Contorno, caminos y borrador
  useEffect(() => {
    const m = mapa.current;
    const capa = capaDibujo.current;
    if (!m || !capa) return;
    capa.clearLayers();
    capaPrevia.current?.clearLayers();
    if (!dibujo) return;

    // Clics seguidos marcan vértices, no acercan el mapa
    if (dibujo.dibujando) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();

    for (const camino of dibujo.caminos) {
      if (camino.length >= 3) {
        L.polygon(camino.map(aLatLng), { color: "#94a3b8", weight: 1, fillColor: "#94a3b8", fillOpacity: 0.5, interactive: false }).addTo(capa);
      }
    }

    const { contorno } = dibujo;
    if (!dibujo.dibujando && contorno.length >= 3) {
      const poligono = L.polygon(contorno.map(aLatLng), {
        color: AMARILLO,
        weight: 2,
        fillColor: AMARILLO,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(capa);
      contorno.forEach((a, i) => {
        const b = contorno[(i + 1) % contorno.length];
        // La etiqueta va afuera del terreno para no tapar el punto de la mitad
        const icono = etiqueta(dibujo.etiquetas[i] ?? "", desplazamientoEtiqueta(contorno, i));
        L.marker(mitad(a, b), { icon: icono, interactive: false, keyboard: false }).addTo(capa);
        const medio = L.marker(mitad(a, b), { icon: MITAD, keyboard: false, title: `Agregar un vértice en la mitad del lado ${i + 1}` });
        medio.on("click", () => dibujoActual.current?.onInsertarVertice(i));
        medio.addTo(capa);
      });
      contorno.forEach((c, i) => {
        const vertice = L.marker(aLatLng(c), { icon: VERTICE, draggable: true, keyboard: false, title: `Vértice ${i + 1}: arrástralo o haz doble clic para quitarlo` });
        // Mientras se arrastra, el contorno sigue al vértice
        vertice.on("drag", () => {
          const puntos = contorno.map(aLatLng);
          const p = vertice.getLatLng();
          puntos[i] = [p.lat, p.lng];
          poligono.setLatLngs(puntos);
        });
        vertice.on("dragend", () => dibujoActual.current?.onMoverVertice(i, aCoordenadas(vertice.getLatLng())));
        vertice.on("dblclick", () => dibujoActual.current?.onQuitarVertice(i));
        vertice.addTo(capa);
      });
    }

    const { borrador } = dibujo;
    if (dibujo.dibujando && borrador.length > 0) {
      L.polyline(borrador.map(aLatLng), { color: AMARILLO, weight: 2, interactive: false }).addTo(capa);
      borrador.slice(1).forEach((b, i) => {
        L.marker(mitad(borrador[i], b), { icon: etiqueta(dibujo.etiquetasBorrador[i] ?? ""), interactive: false, keyboard: false }).addTo(capa);
      });
      borrador.forEach((c, i) => {
        const primero = i === 0;
        const vertice = L.marker(aLatLng(c), {
          icon: primero ? PRIMER_VERTICE : VERTICE,
          keyboard: false,
          interactive: primero,
          title: primero ? "Clic aquí para cerrar el contorno" : undefined,
        });
        if (primero) vertice.on("click", () => dibujoActual.current?.onCerrarBorrador());
        vertice.addTo(capa);
      });
    }
  }, [dibujo]);

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
        aria-label={
          dibujo?.dibujando
            ? "Mapa satelital: haz clic en cada esquina del terreno"
            : "Mapa satelital: haz clic sobre el terreno para ubicar el proyecto"
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
