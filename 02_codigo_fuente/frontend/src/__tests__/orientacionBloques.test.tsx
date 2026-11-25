/**
 * Orientación de los bloques en el Paso 3 (revisión del 23 de noviembre):
 * norte, o paralelos a un lado del terreno, como en los planos de
 * HEXtructure de terrenos en diagonal.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayoutPage } from "@/pages/LayoutPage";
import * as layout from "@/services/layout";

import { montar } from "./utilidades";

vi.mock("@/services/proyectos", async () => {
  const { PROYECTO } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => PROYECTO), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({
  obtenerEquipo: vi.fn(async () => ({
    proyecto_id: 5,
    panel: { marca: "A", modelo: "B", potencia_wp: 580, largo_mm: 2278, ancho_mm: 1134, voc_v: 52, vmp_v: 43 },
    angulo_montaje: 15,
    inversores: [{ marca: "H", modelo: "M", potencia_kw: 160, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null }],
    potencia_objetivo_kwp: null,
    calculos: { area_panel_m2: 2.58, separacion: null, strings: [null], sugerencia: null, advertencias: [] },
  })),
  guardarEquipo: vi.fn(),
  listarPanelesReferencia: vi.fn(async () => []),
}));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(async () => null as unknown),
  // No resuelve: solo interesa con qué parámetros se llamó
  generarLayout: vi.fn(() => new Promise(() => {})),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
}));
vi.mock("@/services/inversores", () => ({ listarInversores: vi.fn(async () => []) }));
vi.mock("@/services/terreno", async () => {
  const { TERRENO, rect } = await import("./utilidades");
  return { obtenerTerreno: vi.fn(async () => TERRENO(rect(100, 60))), agregarCamino: vi.fn(), eliminarCamino: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);

describe("Orientación de los bloques", () => {
  it("parte en el norte y lista cada lado del terreno con su largo", async () => {
    paso3();
    const selector = (await screen.findByLabelText("Orientación de los bloques")) as HTMLSelectElement;
    expect(selector.value).toBe("");

    const opciones = [...selector.options].map((o) => o.textContent);
    expect(opciones).toEqual([
      "Norte (filas de norte a sur)",
      "Paralelo al lado 1 (100 m), el más largo",
      "Paralelo al lado 2 (60 m)",
      "Paralelo al lado 3 (100 m)",
      "Paralelo al lado 4 (60 m)",
    ]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ lado_bloques: null });
  });

  it("envía el lado elegido al generar", async () => {
    paso3();
    fireEvent.change(await screen.findByLabelText("Orientación de los bloques"), { target: { value: "1" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));

    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ lado_bloques: 1 });
  });
});

/** Layout guardado con un lado elegido y el giro con que se generó. */
const LAYOUT = (lado: number, anguloNorte: number) => ({
  proyecto_id: 5,
  parametros: { paneles_largo: 4, pasillo_m: 2, tolerancia_proporcion: 0.2, capacidad_deseada_kwp: null, paneles_ancho_minimo: 1, lado_bloques: lado },
  bloques: [],
  tipos: [],
  total_paneles: 0, potencia_kwp: 0, paneles_ancho_ideal: 24, largo_bloque_m: 9.112, ancho_bloque_m: 27.216,
  separacion_este_oeste_m: 2, separacion_norte_sur_m: 2, area_util_m2: 6000, area_ocupada_m2: 0, capacidad: null,
  inversores: [], inversores_sugeridos: 1, advertencias: [], angulo_norte: anguloNorte, lado_menor_m: 1.134,
  ediciones_manuales: 0, desactualizado: false, created_at: "2026-11-23T10:00:00Z", updated_at: "2026-11-23T10:00:00Z",
});

describe("Lado guardado", () => {
  it("si sigue siendo el mismo lado del terreno, se conserva", async () => {
    // Rectángulo recto: el lado 2 es vertical y los bloques quedaron sin girar
    vi.mocked(layout.obtenerLayout).mockResolvedValueOnce(LAYOUT(1, 0) as never);
    paso3();
    const selector = (await screen.findByLabelText("Orientación de los bloques")) as HTMLSelectElement;
    await waitFor(() => expect(selector.value).toBe("1"));
    expect(screen.queryByText(/ya no es el que se eligió/)).toBeNull();
  });

  it("si el terreno cambió y el número apunta a otro lado, vuelve al norte y avisa", async () => {
    // Se generó girado 30°, pero el lado 2 del terreno actual no está a 30°
    vi.mocked(layout.obtenerLayout).mockResolvedValueOnce(LAYOUT(1, 30) as never);
    paso3();
    expect(await screen.findByText(/el lado 2 ya no es el que se eligió/)).toBeTruthy();
    expect((screen.getByLabelText("Orientación de los bloques") as HTMLSelectElement).value).toBe("");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Volver a generar" })));
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ lado_bloques: null });
  });
});
