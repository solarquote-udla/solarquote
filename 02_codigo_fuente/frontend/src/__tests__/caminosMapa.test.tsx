/**
 * Caminos dibujados sobre el mapa del Paso 3 (revisión de UX del 21 de
 * noviembre): geometría del camino y el Paso 3 con el mapa simulado. El
 * mapa real con Leaflet está en mapaLayout.test.tsx.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { LayoutPage } from "@/pages/LayoutPage";
import * as terreno from "@/services/terreno";
import type { Punto } from "@/types/api";
import { corredor, esPoligonoSimple, largoEje, nombreCaminoDibujado } from "@/utils/caminos";

import { montar } from "./utilidades";

vi.mock("@/services/proyectos", async () => {
  const { PROYECTO } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => ({ ...PROYECTO, latitud: -0.22, longitud: -78.51 })), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({ obtenerEquipo: vi.fn(async () => null) }));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(async () => null),
  generarLayout: vi.fn(),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
}));
vi.mock("@/services/terreno", async () => {
  const u = await import("./utilidades");
  return {
    obtenerTerreno: vi.fn(async () => u.TERRENO(u.rect(100, 60))),
    agregarCamino: vi.fn(async () => ({})),
    eliminarCamino: vi.fn(),
  };
});

/** El mapa simulado: cada botón es un clic en un punto del plano. */
vi.mock("@/components/MapaLayout", () => ({
  MapaLayout: ({ dibujo, caminos, bloques }: { dibujo?: { onPunto: (p: Punto) => void; eje: Punto[] } | null; caminos: unknown[]; bloques: unknown[] }) => (
    <div>
      <span data-testid="mapa-layout">{`${caminos.length} caminos, ${bloques.length} bloques`}</span>
      {dibujo && (
        <>
          <span data-testid="eje">{JSON.stringify(dibujo.eje)}</span>
          <button type="button" onClick={() => dibujo.onPunto([-5, 30])}>CLIC OESTE</button>
          <button type="button" onClick={() => dibujo.onPunto([50, 31])}>CLIC CENTRO</button>
          <button type="button" onClick={() => dibujo.onPunto([51, 70])}>CLIC NORTE</button>
        </>
      )}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("geometría del camino", () => {
  it("un camino recto es un rectángulo del ancho pedido alrededor del eje", () => {
    expect(corredor([[0, 10], [100, 10]], 4)).toEqual([
      [0, 12],
      [100, 12],
      [100, 8],
      [0, 8],
    ]);
  });

  it("en un quiebre de 90° los bordes se cortan en esquina", () => {
    const poligono = corredor([[0, 0], [50, 0], [50, 40]], 4);
    expect(poligono).toEqual([
      [0, 2],
      [48, 2],
      [48, 40],
      [52, 40],
      [52, -2],
      [0, -2],
    ]);
    expect(esPoligonoSimple(poligono)).toBe(true);
  });

  it("puntos repetidos no rompen el camino; con un solo punto o ancho 0 no hay camino", () => {
    expect(corredor([[0, 0], [0, 0], [10, 0]], 2)).toHaveLength(4);
    expect(corredor([[0, 0]], 2)).toEqual([]);
    expect(corredor([[0, 0], [10, 0]], 0)).toEqual([]);
  });

  it("detecta un polígono que se cruza, como el que rechaza el backend", () => {
    expect(esPoligonoSimple([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false);
    expect(esPoligonoSimple([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
  });

  it("largo del eje y nombre libre", () => {
    expect(largoEje([[0, 0], [30, 0], [30, 40]])).toBe(70);
    expect(nombreCaminoDibujado(["Camino H1", "Camino 1", "Camino 3", null])).toBe("Camino 4");
    expect(nombreCaminoDibujado([])).toBe("Camino 1");
  });
});

describe("Paso 3: caminos dibujados en el mapa", () => {
  const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
  const listo = () => screen.findByTestId("mapa-layout");
  const boton = (n: string | RegExp) => fireEvent.click(screen.getByRole("button", { name: n }));

  it("con ubicación abre en el Mapa, y los caminos están junto a la vista", async () => {
    paso3();
    expect((await listo()).textContent).toBe("0 caminos, 0 bloques");
    expect(screen.getByRole("tab", { name: "Mapa" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("CAMINOS DE ACCESO")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dibujar en el mapa" })).toBeTruthy();
  });

  it("dibuja un camino con un quiebre a 90°, ajusta el punto casi recto y lo guarda", async () => {
    paso3();
    await listo();
    boton("Dibujar en el mapa");
    // No se cambia de pestaña a medio dibujar
    expect((screen.getByRole("tab", { name: "Plano" }) as HTMLButtonElement).disabled).toBe(true);

    boton("CLIC OESTE");
    boton("CLIC CENTRO");
    boton("CLIC NORTE");
    // El tercer punto estaba a 1 m de quedar recto: se ajusta a 90°
    const [a, b, c] = JSON.parse(screen.getByTestId("eje").textContent ?? "[]") as Punto[];
    const producto = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    expect(Math.abs(producto)).toBeLessThan(1);
    expect(hayCambiosPendientes()).toBe(true);

    fireEvent.change(screen.getByLabelText(/Ancho del camino/), { target: { value: "6" } });
    await act(async () => boton("Terminar camino"));

    expect(terreno.agregarCamino).toHaveBeenCalledOnce();
    const [, datos] = vi.mocked(terreno.agregarCamino).mock.calls[0];
    expect(datos.nombre).toBe("Camino 1");
    expect(datos.tipo).toBe("acceso");
    expect(esPoligonoSimple(datos.vertices)).toBe(true);
    expect(datos.vertices).toHaveLength(6);
    expect(await screen.findByText(/Camino 1 agregado/)).toBeTruthy();
    expect(hayCambiosPendientes()).toBe(false);
  });

  it("deshacer, cancelar y un ancho inválido no guardan nada", async () => {
    paso3();
    await listo();
    boton("Dibujar en el mapa");
    boton("CLIC OESTE");
    boton("CLIC CENTRO");
    boton("Deshacer punto");
    expect(screen.getByTestId("eje").textContent).toBe("[[-5,30]]");
    expect((screen.getByRole("button", { name: "Terminar camino" }) as HTMLButtonElement).disabled).toBe(true);

    boton("CLIC CENTRO");
    fireEvent.change(screen.getByLabelText(/Ancho del camino/), { target: { value: "0" } });
    await act(async () => boton("Terminar camino"));
    expect(screen.getByText("El ancho del camino debe estar entre 0 y 50 m.")).toBeTruthy();

    boton("Cancelar camino");
    expect(screen.queryByLabelText("Dibujo del camino")).toBeNull();
    expect(terreno.agregarCamino).not.toHaveBeenCalled();
  });
});
