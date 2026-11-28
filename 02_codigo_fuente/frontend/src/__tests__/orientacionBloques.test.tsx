/**
 * Orientación de los bloques en el Paso 3 (revisión del 25 de noviembre):
 * norte, o alineados al terreno (el backend prueba cada lado y se queda
 * con el que más paneles ubica). La pantalla muestra cuántos entran con
 * cada una para que se elija la mejor.
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
  it("parte en el norte, tiene solo dos opciones y la envía al generar", async () => {
    paso3();
    const selector = (await screen.findByLabelText("Orientación de los bloques")) as HTMLSelectElement;
    expect(selector.value).toBe("norte");
    expect([...selector.options].map((o) => o.textContent)).toEqual(["Norte (filas de norte a sur)", "Alineado al terreno"]);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ orientacion_bloques: "norte" });
  });

  it("envía alineado al terreno si se elige", async () => {
    paso3();
    fireEvent.change(await screen.findByLabelText("Orientación de los bloques"), { target: { value: "terreno" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));

    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ orientacion_bloques: "terreno" });
  });
});

/** Layout guardado con su orientación y los paneles de cada una. */
const LAYOUT = (orientacion: "norte" | "terreno", porOrientacion: { norte: number; terreno: number } | null) => ({
  proyecto_id: 5,
  parametros: { paneles_largo: 4, pasillo_m: 2, tolerancia_proporcion: 0.2, capacidad_deseada_kwp: null, paneles_ancho_minimo: 1, orientacion_bloques: orientacion },
  bloques: [],
  tipos: [],
  total_paneles: 0, potencia_kwp: 0, paneles_ancho_ideal: 24, largo_bloque_m: 9.112, ancho_bloque_m: 27.216,
  separacion_este_oeste_m: 2, separacion_norte_sur_m: 2, area_util_m2: 6000, area_ocupada_m2: 0, capacidad: null,
  inversores: [], inversores_sugeridos: 1, advertencias: [], angulo_norte: 0, lado_menor_m: 1.134,
  paneles_por_orientacion: porOrientacion,
  ediciones_manuales: 0, desactualizado: false, created_at: "2026-11-25T10:00:00Z", updated_at: "2026-11-25T10:00:00Z",
});

describe("Layout guardado", () => {
  it("conserva la orientación con que se generó y muestra cuántos paneles entran con cada una", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValueOnce(LAYOUT("terreno", { norte: 0, terreno: 1680 }) as never);
    paso3();
    const selector = (await screen.findByLabelText("Orientación de los bloques")) as HTMLSelectElement;
    await waitFor(() => expect(selector.value).toBe("terreno"));
    expect(screen.getByText(/entran 0 paneles siguiendo el norte y 1\.680 alineados al terreno/)).toBeTruthy();
  });

  it("un layout de antes de este cambio no muestra la comparación", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValueOnce(LAYOUT("norte", null) as never);
    paso3();
    await screen.findByLabelText("Orientación de los bloques");
    expect(screen.queryByText(/alineados al terreno\./)).toBeNull();
  });
});
