/**
 * Mapa satelital del Paso 1 con Leaflet real (sin clics: jsdom no calcula
 * posiciones). Se verifica la capa satelital, el norte y el marcador.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapaUbicacion } from "@/components/MapaUbicacion";

afterEach(cleanup);

describe("MapaUbicacion", () => {
  it("usa la imagen satelital y muestra el norte", () => {
    const { container } = render(<MapaUbicacion valor={null} onCambio={vi.fn()} />);
    expect(screen.getByRole("application", { name: /Mapa satelital/ })).toBeTruthy();
    const tiles = Array.from(container.querySelectorAll("img.leaflet-tile")).map((i) => i.getAttribute("src") ?? "");
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((src) => src.includes("World_Imagery"))).toBe(true);
    expect(screen.getByText("N")).toBeTruthy();
    expect(container.querySelector(".leaflet-control-attribution")?.textContent).toMatch(/Esri/);
  });

  it("sin ubicación no hay marcador; con ubicación aparece y se quita", () => {
    const { container, rerender } = render(<MapaUbicacion valor={null} onCambio={vi.fn()} />);
    expect(container.querySelector(".leaflet-marker-icon")).toBeNull();

    rerender(<MapaUbicacion valor={{ latitud: 0.35, longitud: -78.12 }} onCambio={vi.fn()} />);
    expect(container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

    rerender(<MapaUbicacion valor={{ latitud: 0.36, longitud: -78.13 }} onCambio={vi.fn()} />);
    expect(container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);

    rerender(<MapaUbicacion valor={null} onCambio={vi.fn()} />);
    expect(container.querySelector(".leaflet-marker-icon")).toBeNull();
  });
});
