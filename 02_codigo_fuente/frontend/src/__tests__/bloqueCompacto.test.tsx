/**
 * Bloque del Paso 3 según la revisión con HEXtructure del 17 de noviembre
 * de 2026: L y A a mano, aviso de bloque compacto (A = 3 × L) sin
 * bloquear, separación entre paneles y paneles dibujados en el bloque.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VistaLayout } from "@/components/VistaLayout";
import { LayoutPage } from "@/pages/LayoutPage";
import * as layout from "@/services/layout";
import { aCompacto, divisionesPaneles, esCompacto } from "@/utils/bloque";
import type { Punto } from "@/types/api";
import { anchoBloque } from "@/utils/edicionLayout";

import { montar, rect } from "./utilidades";

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
}));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(async () => null),
  generarLayout: vi.fn(() => new Promise(() => {})),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
}));
vi.mock("@/services/inversores", () => ({ listarInversores: vi.fn(async () => []) }));
vi.mock("@/services/terreno", async () => {
  const { TERRENO, rect: r } = await import("./utilidades");
  return { obtenerTerreno: vi.fn(async () => TERRENO(r(100, 60))), agregarCamino: vi.fn(), eliminarCamino: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Reglas del bloque", () => {
  it.each([
    [2, 6],
    [4, 12],
    [8, 24],
  ])("L = %i: el bloque compacto tiene A = %i", (l, a) => {
    expect(aCompacto(l)).toBe(a);
    expect(esCompacto(l, a, 0.2)).toBe(true);
  });

  it.each([
    [4, 28],
    [22, 28],
    [2, 30],
  ])("los bloques reales %i × %i no son compactos", (l, a) => {
    expect(esCompacto(l, a, 0.2)).toBe(false);
  });

  it("el ancho del bloque suma la separación entre paneles, igual que el backend", () => {
    const g = { largo_m: 9.292, lado_menor_m: 1.134, separacion_ancho_m: 0.02, angulo_norte: 0 };
    expect(anchoBloque(12, g)).toBeCloseTo(12 * 1.134 + 11 * 0.02, 6);
    expect(anchoBloque(1, g)).toBeCloseTo(1.134, 6);
    expect(anchoBloque(12, { ...g, separacion_ancho_m: undefined })).toBeCloseTo(12 * 1.134, 6);
  });

  it("dibuja L − 1 y A − 1 divisiones entre paneles", () => {
    const vertices: Punto[] = [
      [10, 0],
      [10, 30],
      [0, 30],
      [0, 0],
    ];
    const trazo = divisionesPaneles({ vertices, paneles_largo: 4, paneles_ancho: 12 });
    expect(trazo.match(/M/g)).toHaveLength(3 + 11);
    // La primera división del largo, a un cuarto de 0 a 10
    expect(trazo.startsWith("M2.5,0L2.5,30")).toBe(true);
  });
});

describe("Plano con los paneles", () => {
  it("cada bloque lleva sus paneles dibujados", () => {
    const bloque = (clave: number, x: number) => ({
      clave,
      vertices: [
        [x + 9, 0],
        [x + 9, 14],
        [x, 14],
        [x, 0],
      ] as Punto[],
      tipo: "A",
      paneles_largo: 4,
      paneles_ancho: 12,
      en_proporcion: true,
      inversor: 0,
    });
    render(<VistaLayout terreno={rect(40, 20) as Punto[]} caminos={[]} bloques={[bloque(0, 0), bloque(1, 12)]} orientacionNorte={0} />);
    const trazos = screen.getAllByTestId("paneles-bloque");
    expect(trazos).toHaveLength(2);
    expect(trazos[0].getAttribute("d")?.match(/M/g)).toHaveLength(14);
  });
});

describe("Paso 3: L y A a mano", () => {
  const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
  const escribir = (etiqueta: string, valor: string) =>
    fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
  const generar = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Generar layout" })));

  it("sin A propone el bloque compacto y lo envía vacío, con las separaciones en metros", async () => {
    paso3();
    await screen.findByLabelText("Paneles en el ancho (A)");
    expect(screen.getByRole("status").textContent).toMatch(/Bloque 4 × 12: compacto/);
    await generar();
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({
      paneles_largo: 4,
      paneles_ancho: null,
      separacion_paneles_largo_m: 0.06,
      separacion_paneles_ancho_m: 0.02,
    });
  });

  it("un bloque no compacto avisa pero se genera igual", async () => {
    paso3();
    await screen.findByLabelText("Paneles en el ancho (A)");
    escribir("Paneles en el largo (L)", "8");
    escribir("Paneles en el ancho (A)", "13");
    expect(screen.getByRole("status").textContent).toMatch(/8 × 13: no es compacto.*A = 3 × L = 24/);
    await generar();
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ paneles_largo: 8, paneles_ancho: 13 });
  });

  it("acepta los L grandes de las plantas reales", async () => {
    paso3();
    await screen.findByLabelText("Paneles en el ancho (A)");
    escribir("Paneles en el largo (L)", "22");
    escribir("Paneles en el ancho (A)", "28");
    await generar();
    expect(vi.mocked(layout.generarLayout).mock.calls[0][1]).toMatchObject({ paneles_largo: 22, paneles_ancho: 28 });
  });

  it.each([
    ["Paneles en el largo (L)", "5", /L: debe ser un número par/],
    ["Paneles en el largo (L)", "42", /L: debe ser un número par entre 2 y 40/],
    ["Paneles en el ancho (A)", "0", /Revisa A/],
    ["Paneles en el ancho (A)", "2,5", /Revisa A/],
    ["Separación a lo largo (cm)", "-1", /separación a lo largo/],
    ["Separación entre paneles (cm)", "abc", /separación entre paneles/],
  ])("%s = %j no genera", async (etiqueta, valor, mensaje) => {
    paso3();
    await screen.findByLabelText("Paneles en el ancho (A)");
    escribir(etiqueta, valor);
    await generar();
    expect(layout.generarLayout).not.toHaveBeenCalled();
    expect(screen.getByText(mensaje)).toBeTruthy();
  });

  it("el A mínimo no puede superar A", async () => {
    paso3();
    await screen.findByLabelText("Paneles en el ancho (A)");
    escribir("Paneles en el ancho (A)", "10");
    escribir("A mínimo", "12");
    await generar();
    expect(layout.generarLayout).not.toHaveBeenCalled();
    expect(screen.getByText(/no puede ser mayor que A \(10\)/)).toBeTruthy();
  });
});
