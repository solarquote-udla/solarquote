/**
 * Terreno dibujado sobre el mapa (revisión del 16 de noviembre, Lenin):
 * conversión entre el mapa y el plano, ajuste a 90°, largo de cada lado,
 * vértice en la mitad de un lado y el mapa real con Leaflet. El Paso 1
 * completo está en pasoTerrenoMapa.test.tsx.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapaUbicacion, type DibujoMapa } from "@/components/MapaUbicacion";
import type { Punto } from "@/types/api";
import {
  ajustarAngulo,
  anguloEnVertice,
  aMapa,
  aPlano,
  cambiarLargoLado,
  desplazamientoEtiqueta,
  insertarEnMitad,
  largosDeLados,
  quitarVertice,
} from "@/utils/terrenoMapa";


const ORIGEN = { latitud: 0.19, longitud: -78.2 };
const RECTANGULO: Punto[] = [
  [0, 0],
  [100, 0],
  [100, 60],
  [0, 60],
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("geometría del terreno sobre el mapa", () => {
  it("ida y vuelta entre el mapa y el plano, con y sin orientación", () => {
    for (const orientacion of [0, 30, 270]) {
      const punto = aMapa(ORIGEN, [123.45, -67.89], orientacion);
      expect(aPlano(ORIGEN, punto, orientacion)).toEqual([123.45, -67.89]);
    }
  });

  it("con orientación 0, +X es el este y +Y el norte", () => {
    const este = aMapa(ORIGEN, [100, 0]);
    expect(este.latitud).toBeCloseTo(ORIGEN.latitud, 9);
    expect(este.longitud).toBeGreaterThan(ORIGEN.longitud);
    const norte = aMapa(ORIGEN, [0, 100]);
    expect(norte.longitud).toBeCloseTo(ORIGEN.longitud, 9);
    // 100 m al norte son unos 0,000898 grados
    expect(norte.latitud - ORIGEN.latitud).toBeCloseTo(0.000898, 6);
  });

  it("con el norte a 90° (hacia +X del plano), +X apunta al norte del mapa", () => {
    const p = aMapa(ORIGEN, [100, 0], 90);
    expect(p.longitud).toBeCloseTo(ORIGEN.longitud, 9);
    expect(p.latitud).toBeGreaterThan(ORIGEN.latitud);
  });

  it("ajusta a 90° o en línea recta un lado casi recto, y deja los demás", () => {
    // 89° respecto del lado anterior: queda a 90°, a la misma distancia aproximada
    expect(ajustarAngulo([0, 0], [100, 0], [101.5, 60])).toEqual([100, 60]);
    // Casi en línea recta: sigue la dirección del lado anterior
    expect(ajustarAngulo([0, 0], [100, 0], [150, 3])).toEqual([150, 0]);
    // 45°: no se toca
    expect(ajustarAngulo([0, 0], [100, 0], [150, 50])).toEqual([150, 50]);
    // El primer lado no tiene referencia
    expect(ajustarAngulo(undefined, [0, 0], [10, 1])).toEqual([10, 1]);
  });

  it("cambiar el largo de un lado de un rectángulo lo mantiene rectángulo", () => {
    const nuevo = cambiarLargoLado(RECTANGULO, 0, 120);
    expect(nuevo).toEqual([
      [0, 0],
      [120, 0],
      [120, 60],
      [0, 60],
    ]);
    expect(largosDeLados(nuevo)).toEqual([120, 60, 120, 60]);
    // El lado vertical también
    expect(largosDeLados(cambiarLargoLado(RECTANGULO, 1, 80))).toEqual([100, 80, 100, 80]);
  });

  it("en un terreno irregular solo se mueve lo que queda más allá del lado", () => {
    const l: Punto[] = [
      [0, 0],
      [100, 0],
      [100, 40],
      [50, 40],
      [50, 80],
      [0, 80],
    ];
    const nuevo = cambiarLargoLado(l, 0, 110);
    expect(nuevo[1]).toEqual([110, 0]);
    expect(nuevo[2]).toEqual([110, 40]);
    expect(nuevo[3]).toEqual([50, 40]);
    expect(cambiarLargoLado(l, 0, 0)).toBe(l);
  });

  it("agrega un vértice en la mitad de un lado y quita vértices sin bajar de tres", () => {
    const con = insertarEnMitad(RECTANGULO, 0);
    expect(con).toEqual([[0, 0], [50, 0], [100, 0], [100, 60], [0, 60]]);
    expect(quitarVertice(con, 1)).toEqual(RECTANGULO);
    const triangulo: Punto[] = [[0, 0], [10, 0], [0, 10]];
    expect(quitarVertice(triangulo, 0)).toBe(triangulo);
  });

  it("la etiqueta de cada lado va afuera del terreno, gire como gire el contorno", () => {
    // RECTANGULO va en sentido antihorario: lado 1 al sur, 2 al este, 3 al norte, 4 al oeste
    const antihorario = RECTANGULO.map((p) => aMapa(ORIGEN, p));
    expect(desplazamientoEtiqueta(antihorario, 0)).toEqual([0, 16]); // abajo
    expect(desplazamientoEtiqueta(antihorario, 1)).toEqual([16, 0]); // derecha
    expect(desplazamientoEtiqueta(antihorario, 2)).toEqual([0, -16]); // arriba
    expect(desplazamientoEtiqueta(antihorario, 3)).toEqual([-16, 0]); // izquierda
    // El mismo terreno dibujado al revés: las etiquetas siguen afuera
    const horario = [...antihorario].reverse();
    expect(desplazamientoEtiqueta(horario, 0)).toEqual([0, -16]); // de NO a NE: lado norte, arriba
    expect(desplazamientoEtiqueta(horario.slice(0, 2), 0)).toEqual([0, 0]);
  });

  it("mide el ángulo de cada vértice", () => {
    expect(anguloEnVertice(RECTANGULO, 0)).toBeCloseTo(90);
    expect(anguloEnVertice([[0, 0], [10, 0], [0, 10]], 1)).toBeCloseTo(45);
  });
});

describe("MapaUbicacion con el terreno (Leaflet real)", () => {
  const dibujo = (cambios: Partial<DibujoMapa> = {}): DibujoMapa => ({
    contorno: RECTANGULO.map((p) => aMapa(ORIGEN, p)),
    etiquetas: ["100 m", "60 m", "100 m", "60 m"],
    caminos: [],
    borrador: [],
    etiquetasBorrador: [],
    dibujando: false,
    vistaPrevia: () => null,
    onClicDibujo: vi.fn(),
    onCerrarBorrador: vi.fn(),
    onMoverVertice: vi.fn(),
    onInsertarVertice: vi.fn(),
    onQuitarVertice: vi.fn(),
    ...cambios,
  });

  it("muestra el largo de cada lado y un vértice para agregar en la mitad de cada lado", () => {
    const d = dibujo();
    const { container } = render(<MapaUbicacion valor={ORIGEN} onCambio={vi.fn()} dibujo={d} />);
    const etiquetas = Array.from(container.querySelectorAll(".etiqueta-lado")).map((e) => e.textContent);
    expect(etiquetas).toEqual(["100 m", "60 m", "100 m", "60 m"]);
    // Punto de ubicación + 4 mitades + 4 vértices (las etiquetas también son marcadores)
    expect(container.querySelectorAll('[title^="Vértice"]')).toHaveLength(4);
    const mitades = container.querySelectorAll('[title^="Agregar un vértice"]');
    expect(mitades).toHaveLength(4);
    fireEvent.click(mitades[1]);
    expect(d.onInsertarVertice).toHaveBeenCalledWith(1);
  });

  it("al dibujar, el primer vértice cierra el contorno", () => {
    const d = dibujo({
      contorno: [],
      etiquetas: [],
      dibujando: true,
      borrador: RECTANGULO.slice(0, 3).map((p) => aMapa(ORIGEN, p)),
      etiquetasBorrador: ["100 m", "60 m"],
    });
    const { container } = render(<MapaUbicacion valor={ORIGEN} onCambio={vi.fn()} dibujo={d} />);
    expect(screen.getByRole("application", { name: /cada esquina/ })).toBeTruthy();
    expect(Array.from(container.querySelectorAll(".etiqueta-lado")).map((e) => e.textContent)).toEqual(["100 m", "60 m"]);
    fireEvent.click(container.querySelector('[title="Clic aquí para cerrar el contorno"]') as HTMLElement);
    expect(d.onCerrarBorrador).toHaveBeenCalled();
  });
});
