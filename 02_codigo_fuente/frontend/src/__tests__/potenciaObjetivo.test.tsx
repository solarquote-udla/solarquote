/**
 * Potencia objetivo del Paso 2 en el Paso 3. Regresión de la demo con
 * Producción: se cambió a 115 kWp y el Paso 3 siguió con la capacidad
 * del layout anterior.
 */
import { cleanup, screen } from "@testing-library/react";
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
    inversores: [{ marca: "H", modelo: "M", potencia_kw: 100, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null }],
    potencia_objetivo_kwp: 115,
    calculos: { area_panel_m2: 2.58, separacion: null, strings: [null], sugerencia: null, advertencias: [] },
  })),
  guardarEquipo: vi.fn(),
  listarPanelesReferencia: vi.fn(async () => []),
}));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(),
  generarLayout: vi.fn(),
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

const LAYOUT = (desactualizado: boolean) => ({
  proyecto_id: 5,
  parametros: { paneles_largo: 4, pasillo_este_oeste_m: 2, pasillo_norte_sur_m: 2, tolerancia_proporcion: 0.2, capacidad_deseada_kwp: 626, paneles_ancho_minimo: 1 },
  bloques: [],
  tipos: [],
  total_paneles: 0, potencia_kwp: 0, paneles_ancho_ideal: 24, largo_bloque_m: 9.112, ancho_bloque_m: 27.216,
  separacion_este_oeste_m: 2, separacion_norte_sur_m: 2, area_util_m2: 6000, area_ocupada_m2: 0, capacidad: null,
  inversores: [], inversores_sugeridos: 1, advertencias: [], angulo_norte: 0, lado_menor_m: 1.134,
  ediciones_manuales: 0, desactualizado, created_at: "2026-11-16T10:00:00Z", updated_at: "2026-11-16T10:00:00Z",
});

const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
const capacidad = async () =>
  ((await screen.findByLabelText(/^Capacidad deseada \(kWp\)/)) as HTMLInputElement).value;

describe("Potencia objetivo en el Paso 3", () => {
  it("sin layout, la capacidad deseada parte de la potencia objetivo", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(null);
    paso3();
    expect(await capacidad()).toBe("115");
  });

  it("con un layout desactualizado, usa la potencia objetivo nueva", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT(true) as never);
    paso3();
    expect(await capacidad()).toBe("115");
  });

  it("con un layout vigente, conserva la capacidad con la que se generó", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT(false) as never);
    paso3();
    expect(await capacidad()).toBe("626");
  });
});
