/**
 * A mínimo del Paso 3 (SQ-170): viaja al backend con los demás
 * parámetros y se valida antes de generar.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
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
  obtenerLayout: vi.fn(async () => null),
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

describe("A mínimo del Paso 3", () => {
  it("parte en 1 (sin mínimo) y se envía con los demás parámetros", async () => {
    paso3();
    const campo = (await screen.findByLabelText("A mínimo")) as HTMLInputElement;
    expect(campo.value).toBe("1");

    fireEvent.change(campo, { target: { value: "6" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));

    expect(layout.generarLayout).toHaveBeenCalledOnce();
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ paneles_largo: 4, paneles_ancho_minimo: 6 });
  });

  it.each(["0", "2,5", "abc", ""])("con %j no genera y pide corregirlo", async (valor) => {
    paso3();
    fireEvent.change(await screen.findByLabelText("A mínimo"), { target: { value: valor } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));

    expect(layout.generarLayout).not.toHaveBeenCalled();
    expect(screen.getByText("Revisa el A mínimo: debe ser un número entero desde 1.")).toBeTruthy();
  });
});
