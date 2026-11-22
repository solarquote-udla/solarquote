/**
 * Layout sobre la imagen satelital (Paso 3 y confirmación), con Leaflet
 * real: terreno, caminos, bloques y el camino a medio dibujar.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapaLayout } from "@/components/MapaLayout";
import type { Punto } from "@/types/api";

import { rect } from "./utilidades";

afterEach(cleanup);

describe("MapaLayout (Leaflet real)", () => {
  const UBICACION = { latitud: -0.22, longitud: -78.51 };

  it("dibuja el terreno, los caminos y los bloques sobre la imagen satelital", () => {
    const { container } = render(
      <MapaLayout
        ubicacion={UBICACION}
        orientacionNorte={0}
        terreno={rect(100, 60) as Punto[]}
        caminos={[{ nombre: "Camino 1", vertices: [[0, 28], [100, 28], [100, 32], [0, 32]] }]}
        bloques={[
          { vertices: [[10, 0], [19, 0], [19, 14], [10, 14]], inversor: 0, en_proporcion: true },
          { vertices: [[30, 0], [39, 0], [39, 14], [30, 14]], inversor: 1, en_proporcion: false },
        ]}
      />,
    );
    expect(screen.getByRole("application", { name: /2 bloques y 1 caminos/ })).toBeTruthy();
    const tiles = Array.from(container.querySelectorAll("img.leaflet-tile")).map((i) => i.getAttribute("src") ?? "");
    expect(tiles.every((src) => src.includes("World_Imagery"))).toBe(true);
    // Terreno + camino + 2 bloques
    expect(container.querySelectorAll(".leaflet-overlay-pane path")).toHaveLength(4);
    // El bloque no compacto va con borde punteado
    expect(container.querySelectorAll('.leaflet-overlay-pane path[stroke-dasharray="4 3"]')).toHaveLength(1);
  });

  it("al dibujar, muestra el camino con su ancho y el largo de cada tramo", () => {
    const { container } = render(
      <MapaLayout
        ubicacion={UBICACION}
        orientacionNorte={0}
        terreno={rect(100, 60) as Punto[]}
        caminos={[]}
        bloques={[]}
        dibujo={{ eje: [[0, 30], [80, 30]], ancho: 4, vistaPrevia: (p) => p, onPunto: vi.fn() }}
      />,
    );
    expect(screen.getByRole("application", { name: /marcar el eje del camino/ })).toBeTruthy();
    expect(Array.from(container.querySelectorAll(".etiqueta-lado")).map((e) => e.textContent)).toEqual(["80 m"]);
    // Terreno + camino con su ancho + eje + 2 puntos del eje
    expect(container.querySelectorAll(".leaflet-overlay-pane path")).toHaveLength(5);
  });
});
