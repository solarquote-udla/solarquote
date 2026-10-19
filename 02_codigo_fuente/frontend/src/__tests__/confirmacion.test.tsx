/**
 * Diagrama de confirmación (RF-05) y su entrada desde el Paso 3.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmacionPage } from "@/pages/ConfirmacionPage";
import { LayoutPage } from "@/pages/LayoutPage";
import * as layout from "@/services/layout";
import * as proyectos from "@/services/proyectos";

import { montar, PROYECTO } from "./utilidades";

vi.mock("@/services/proyectos", async () => {
  const { PROYECTO: P } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => P), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({
  obtenerEquipo: vi.fn(async () => ({
    proyecto_id: 5,
    panel: { marca: "Canadian Solar", modelo: "CS6W", potencia_wp: 550, largo_mm: 2279, ancho_mm: 1134, voc_v: 50, vmp_v: 42 },
    angulo_montaje: 15,
    inversores: [
      { marca: "Huawei", modelo: "SUN2000", potencia_kw: 160, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null },
      { marca: "Huawei", modelo: "SUN2000", potencia_kw: 160, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null },
    ],
    potencia_objetivo_kwp: null,
    calculos: { area_panel_m2: 2.58, separacion: null, strings: [null, null], sugerencia: null, advertencias: [] },
  })),
  guardarEquipo: vi.fn(),
  listarPanelesReferencia: vi.fn(async () => []),
}));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(),
  generarLayout: vi.fn(),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
  confirmarYCotizar: vi.fn(),
}));
vi.mock("@/services/terreno", async () => {
  const { TERRENO, rect } = await import("./utilidades");
  return { obtenerTerreno: vi.fn(async () => TERRENO(rect(100, 100))), agregarCamino: vi.fn(), eliminarCamino: vi.fn() };
});

const bloque = (x: number, a: number, inversor: number, tipo: string, en_proporcion: boolean) => ({
  vertices: [[x + 9.112, 0], [x + 9.112, a * 1.134], [x, a * 1.134], [x, 0]],
  paneles_largo: 4, paneles_ancho: a, paneles: 4 * a, proporcion: (a * 1.134) / 9.112, en_proporcion, tipo, inversor,
});

const inv = (numero: number, paneles: number) => ({
  numero, marca: "Huawei", modelo: "SUN2000", potencia_kw: 160, bloques: 1, paneles, potencia_kwp: paneles * 0.55,
  relacion_dc_ac: 1, paneles_por_string_min: null, paneles_por_string_max: null, paneles_por_string: null, strings: null,
  paneles_sin_string: null, strings_por_mppt: null, compatible: null, motivo: null,
});

const LAYOUT = (cambios: Record<string, unknown> = {}) => ({
  proyecto_id: 5,
  parametros: { paneles_largo: 4, pasillo_m: 2, tolerancia_proporcion: 0.2, capacidad_deseada_kwp: null },
  bloques: [bloque(0, 24, 0, "A", true), bloque(12, 24, 1, "A", true), bloque(24, 16, 1, "B", false)],
  tipos: [
    { tipo: "A", paneles_largo: 4, paneles_ancho: 24, repeticiones: 2, paneles: 192, proporcion: 2.99, en_proporcion: true },
    { tipo: "B", paneles_largo: 4, paneles_ancho: 16, repeticiones: 1, paneles: 64, proporcion: 1.99, en_proporcion: false },
  ],
  total_paneles: 256, potencia_kwp: 140.8, paneles_ancho_ideal: 24, largo_bloque_m: 9.112, ancho_bloque_m: 27.216,
  separacion_este_oeste_m: 2, separacion_norte_sur_m: 2, area_util_m2: 10000, area_ocupada_m2: 700, capacidad: null,
  inversores: [inv(1, 96), inv(2, 160)], inversores_sugeridos: 1, advertencias: [], angulo_norte: 0, lado_menor_m: 1.134,
  ediciones_manuales: 0, desactualizado: false, created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z",
  ...cambios,
});

const SOLO_EN_PROPORCION = {
  bloques: [bloque(0, 24, 0, "A", true), bloque(12, 24, 1, "A", true)],
  tipos: [{ tipo: "A", paneles_largo: 4, paneles_ancho: 24, repeticiones: 2, paneles: 192, proporcion: 2.99, en_proporcion: true }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function abrir(cambios: Record<string, unknown> = {}) {
  vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT(cambios) as never);
  montar(<ConfirmacionPage />, "/generar/5/confirmacion", ["/generar/:proyectoId/confirmacion"]);
  await screen.findByText("DETALLE DE BLOQUES");
}

const botonConfirmar = () => screen.getByText("Confirmar y generar cotización") as HTMLButtonElement;

describe("Diagrama de confirmación", () => {
  it("muestra los bloques en notación L, A, B, el estado de cada tipo y el equipo", async () => {
    await abrir();
    const filas = screen.getAllByRole("row").map((f) => f.textContent);
    expect(filas).toContain("A4242OK");
    expect(filas).toContain("B4161Revisar");
    expect(screen.getByText("Canadian Solar 550 Wp")).toBeTruthy();
    expect(screen.getByText("Inv. 2")).toBeTruthy();
    expect(screen.getByText("En revisión")).toBeTruthy();
  });

  it("con bloques fuera de proporción exige aceptarlos, y confirma una sola vez con doble clic", async () => {
    vi.mocked(layout.confirmarYCotizar).mockResolvedValue({ id: 42, numero_proforma: "CT-130-2026", total: "100.00" });
    await abrir();
    expect(botonConfirmar().disabled).toBe(true);
    expect(screen.getByText(/acéptalos bajo tu responsabilidad/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Acepto bajo mi responsabilidad el bloque/));
    expect(botonConfirmar().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(botonConfirmar());
      fireEvent.click(botonConfirmar());
    });

    expect(layout.confirmarYCotizar).toHaveBeenCalledOnce();
    expect(layout.confirmarYCotizar).toHaveBeenCalledWith(5, { acepta_fuera_de_proporcion: true });
    expect(await screen.findByText("DETALLE COTIZACION")).toBeTruthy();
  });

  it("sin bloques fuera de proporción no pide aceptar nada", async () => {
    vi.mocked(layout.confirmarYCotizar).mockResolvedValue({ id: 7, numero_proforma: "CT-001-2026", total: "1.00" });
    await abrir(SOLO_EN_PROPORCION);
    expect(screen.queryByLabelText(/Acepto/)).toBeNull();
    await act(async () => fireEvent.click(botonConfirmar()));
    expect(layout.confirmarYCotizar).toHaveBeenCalledWith(5, { acepta_fuera_de_proporcion: false });
  });

  it("un layout desactualizado no se puede confirmar", async () => {
    await abrir({ ...SOLO_EN_PROPORCION, desactualizado: true });
    expect(botonConfirmar().disabled).toBe(true);
    expect(screen.getByText(/Vuelve a generarlo en el Paso 3/)).toBeTruthy();
  });

  it("muestra el error del backend y deja reintentar", async () => {
    const respuesta = { status: 409, data: { detail: "El proyecto ya tiene su cotización (CT-001-2026)." } };
    vi.mocked(layout.confirmarYCotizar).mockRejectedValue(
      new AxiosError("409", "ERR", undefined, undefined, { ...respuesta, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } }),
    );
    await abrir(SOLO_EN_PROPORCION);
    await act(async () => fireEvent.click(botonConfirmar()));
    expect(screen.getByRole("alert").textContent).toContain("ya tiene su cotización");
    expect(botonConfirmar().disabled).toBe(false);
  });

  it("un proyecto ya cotizado muestra su proforma y enlaza a la cotización", async () => {
    vi.mocked(proyectos.obtenerProyecto).mockResolvedValueOnce({
      ...PROYECTO, estado: "cotizado", cotizacion_id: 42, numero_proforma: "CT-130-2026",
    } as never);
    await abrir();
    expect(screen.queryByText("Confirmar y generar cotización")).toBeNull();
    expect(screen.getAllByText(/CT-130-2026/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Ver cotización"));
    expect(await screen.findByText("DETALLE COTIZACION")).toBeTruthy();
  });
});

describe("Paso 3 hacia la confirmación", () => {
  it("'Confirmar layout' lleva al diagrama", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT() as never);
    montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
    await screen.findByText("BLOQUES POR INVERSOR");
    await act(async () => fireEvent.click(screen.getByText(/Confirmar layout/)));
    expect(await screen.findByText("CONFIRMACION")).toBeTruthy();
  });

  it("con el layout desactualizado no se puede confirmar", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT({ desactualizado: true }) as never);
    montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
    await screen.findByText("BLOQUES POR INVERSOR");
    expect((screen.getByText(/Confirmar layout/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("'Editar layout' del diagrama abre el Paso 3 en modo edición", async () => {
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT() as never);
    const router = createMemoryRouter([{ path: "/generar/:proyectoId/layout", element: <LayoutPage /> }], {
      initialEntries: [{ pathname: "/generar/5/layout", state: { editar: true } }],
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Modo edición")).toBeTruthy();
  });
});
