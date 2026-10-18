/**
 * Varios inversores (PR B): Paso 2 con una tarjeta por inversor y la
 * sugerencia automática; Paso 3 con los bloques por inversor, Reagrupar
 * y el cambio de inversor de un bloque en modo edición.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { EquipoPage } from "@/pages/EquipoPage";
import { LayoutPage } from "@/pages/LayoutPage";
import * as equipo from "@/services/equipo";
import * as layout from "@/services/layout";
import { sugerenciaInversores } from "@/utils/inversores";

import { montar } from "./utilidades";

vi.mock("@/services/proyectos", async () => {
  const { PROYECTO } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => PROYECTO), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({
  obtenerEquipo: vi.fn(async () => null),
  guardarEquipo: vi.fn(),
  listarPanelesReferencia: vi.fn(async () => []),
}));
vi.mock("@/services/inversores", () => ({
  listarInversores: vi.fn(async () => [
    { id: 3, marca: "Huawei", modelo: "SUN2000-150K", potencia_kw: 150, vmax_v: 1100, vmin_v: 200, mppts: 6, strings_por_mppt: 2, activo: true },
  ]),
}));
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(async () => null),
  generarLayout: vi.fn(),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
}));
vi.mock("@/services/terreno", async () => {
  const { TERRENO, rect } = await import("./utilidades");
  return { obtenerTerreno: vi.fn(async () => TERRENO(rect(100, 100))), agregarCamino: vi.fn(), eliminarCamino: vi.fn() };
});

const INVERSOR = { marca: "Huawei", modelo: "SUN2000", potencia_kw: 160, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null };

const CONFIG = (cantidad = 1) => ({
  proyecto_id: 5,
  panel: { marca: "A", modelo: "B", potencia_wp: 580, largo_mm: 2278, ancho_mm: 1134, voc_v: 52, vmp_v: 43 },
  angulo_montaje: 15,
  inversores: Array.from({ length: cantidad }, () => INVERSOR),
  potencia_objetivo_kwp: null,
  calculos: { area_panel_m2: 2.58, separacion: null, strings: Array(cantidad).fill(null), sugerencia: null, advertencias: [] },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const paso2 = () => montar(<EquipoPage />, "/generar/5/equipo", ["/generar/:proyectoId/equipo"]);
const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);

const tarjeta = (n: number) => screen.getByLabelText(`Inversor ${n}`);
const camposDe = (n: number) => within(tarjeta(n)).getAllByRole("textbox");
const escribir = (campo: HTMLElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });

/** Panel (8 campos) y potencia objetivo, en el orden de la pantalla. */
function llenarPanel(objetivo = "") {
  const textos = screen.getAllByRole("textbox");
  ["A", "B", "550", "2278", "1134", "52", "43", "15", objetivo].forEach((v, i) => escribir(textos[i], v));
}

function llenarInversor(n: number, marca = "Huawei", modelo = "SUN2000", potencia = "160") {
  const [m, mo, p] = camposDe(n);
  escribir(m, marca);
  escribir(mo, modelo);
  escribir(p, potencia);
}

describe("Sugerencia de inversores", () => {
  it("coincide con el ejemplo del prototipo y con el backend", () => {
    // 316 kWp con paneles de 550 Wp: 575 paneles, 2 inversores de ~288
    expect(sugerenciaInversores(316, 550)).toMatchObject({ paneles: 575, inversores: 2, panelesPorInversor: 288 });
    expect(sugerenciaInversores(220, 550)).toMatchObject({ paneles: 400, inversores: 1 });
    expect(sugerenciaInversores(0, 550)).toBeNull();
    expect(sugerenciaInversores(316, Number.NaN)).toBeNull();
  });
});

describe("Paso 2: varios inversores", () => {
  it("la sugerencia aparece al escribir la potencia objetivo y 'Usar 2 inversores' agrega uno copiando el anterior", async () => {
    paso2();
    await screen.findByText("Panel solar");
    llenarPanel("316");
    llenarInversor(1);

    expect(screen.getByText(/Con 575 paneles/)).toBeTruthy();
    fireEvent.click(screen.getByText("Usar 2 inversores"));

    const [marca, modelo, potencia] = camposDe(2);
    expect([(marca as HTMLInputElement).value, (modelo as HTMLInputElement).value, (potencia as HTMLInputElement).value]).toEqual([
      "Huawei",
      "SUN2000",
      "160",
    ]);
    expect(screen.queryByText("Usar 2 inversores")).toBeNull();
    // Mitad de los paneles para cada uno
    expect(within(tarjeta(1)).getByText("~288 paneles")).toBeTruthy();
  });

  it("guarda la lista de inversores y la potencia objetivo", async () => {
    vi.mocked(equipo.guardarEquipo).mockResolvedValue(CONFIG(2) as never);
    paso2();
    await screen.findByText("Panel solar");
    llenarPanel("316");
    llenarInversor(1);
    fireEvent.click(screen.getByText("+ Agregar"));
    llenarInversor(2, "SMA", "Sunny", "100");

    await act(async () => fireEvent.click(screen.getByText("Guardar y calcular")));

    expect(equipo.guardarEquipo).toHaveBeenCalledOnce();
    const [, datos] = vi.mocked(equipo.guardarEquipo).mock.calls[0];
    expect(datos.potencia_objetivo_kwp).toBe(316);
    expect(datos.inversores.map((i) => [i.marca, i.potencia_kw])).toEqual([
      ["Huawei", 160],
      ["SMA", 100],
    ]);
  });

  it("dice cuál inversor tiene el problema y no guarda", async () => {
    paso2();
    await screen.findByText("Panel solar");
    llenarPanel();
    llenarInversor(1);
    fireEvent.click(screen.getByText("+ Agregar"));
    escribir(camposDe(2)[0], "");
    escribir(camposDe(2)[3], "1100"); // Vmax sin Vmin

    await act(async () => fireEvent.click(screen.getByText("Guardar y calcular")));
    expect(screen.getByText("Inversor 2: falta la marca.")).toBeTruthy();

    escribir(camposDe(2)[0], "SMA");
    await act(async () => fireEvent.click(screen.getByText("Guardar y calcular")));
    expect(screen.getByText(/Inversor 2: ingresa los dos voltajes/)).toBeTruthy();
    expect(equipo.guardarEquipo).not.toHaveBeenCalled();
  });

  it("elegir del catálogo llena los datos del inversor", async () => {
    paso2();
    await screen.findByText("Panel solar");
    const catalogo = await within(tarjeta(1)).findByDisplayValue("Escrito a mano");
    fireEvent.change(catalogo, { target: { value: "3" } });

    const [marca, modelo, potencia, vmax, vmin, mppts] = camposDe(1) as HTMLInputElement[];
    expect([marca.value, modelo.value, potencia.value, vmax.value, vmin.value, mppts.value]).toEqual([
      "Huawei",
      "SUN2000-150K",
      "150",
      "1100",
      "200",
      "6",
    ]);
  });

  it("quitar un inversor con datos pide confirmación; el único no se puede quitar", async () => {
    paso2();
    await screen.findByText("Panel solar");
    expect((screen.getByLabelText("Quitar inversor 1") as HTMLButtonElement).disabled).toBe(true);

    llenarInversor(1);
    fireEvent.click(screen.getByText("+ Agregar"));
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByLabelText("Quitar inversor 2"));
    expect(confirmar).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Inversor 2")).toBeTruthy();

    confirmar.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText("Quitar inversor 2"));
    expect(screen.queryByLabelText("Inversor 2")).toBeNull();
  });

  it("agregar un inversor a una configuración guardada cuenta como cambio sin guardar", async () => {
    vi.mocked(equipo.obtenerEquipo).mockResolvedValue(CONFIG(1) as never);
    paso2();
    await screen.findByText("Panel solar");
    expect(hayCambiosPendientes()).toBe(false);
    fireEvent.click(screen.getByText("+ Agregar"));
    expect(hayCambiosPendientes()).toBe(true);
  });
});

// ─── Paso 3 ─────────────────────────────────────────────────────────

const bloque = (x: number, a: number, inversor: number, tipo = "A", en_proporcion = true) => ({
  vertices: [[x + 9.112, 0], [x + 9.112, a * 1.134], [x, a * 1.134], [x, 0]],
  paneles_largo: 4,
  paneles_ancho: a,
  paneles: 4 * a,
  proporcion: (a * 1.134) / 9.112,
  en_proporcion,
  tipo,
  inversor,
});

const inversorLayout = (numero: number, bloques: number, paneles: number) => ({
  numero, marca: "Huawei", modelo: "SUN2000", potencia_kw: 160, bloques, paneles, potencia_kwp: paneles * 0.58,
  relacion_dc_ac: (paneles * 0.58) / 160, paneles_por_string_min: null, paneles_por_string_max: null, paneles_por_string: null,
  strings: null, paneles_sin_string: null, strings_por_mppt: null, compatible: null,
  motivo: "Faltan Vmax y Vmin del inversor para calcular los strings.",
});

const LAYOUT = (inversores = 2) => ({
  proyecto_id: 5,
  parametros: { paneles_largo: 4, pasillo_m: 2, tolerancia_proporcion: 0.2, capacidad_deseada_kwp: null },
  bloques: [bloque(0, 24, 0), bloque(12, 24, inversores - 1), bloque(24, 10, 0, "B", false)],
  tipos: [
    { tipo: "A", paneles_largo: 4, paneles_ancho: 24, repeticiones: 2, paneles: 192, proporcion: 2.99, en_proporcion: true },
    { tipo: "B", paneles_largo: 4, paneles_ancho: 10, repeticiones: 1, paneles: 40, proporcion: 1.24, en_proporcion: false },
  ],
  total_paneles: 232, potencia_kwp: 134.56, paneles_ancho_ideal: 24, largo_bloque_m: 9.112, ancho_bloque_m: 27.216,
  separacion_este_oeste_m: 2, separacion_norte_sur_m: 2, area_util_m2: 10000, area_ocupada_m2: 600, capacidad: null,
  inversores: inversores === 2 ? [inversorLayout(1, 2, 136), inversorLayout(2, 1, 96)] : [inversorLayout(1, 3, 232)],
  inversores_sugeridos: 1, advertencias: [], angulo_norte: 0, lado_menor_m: 1.134, ediciones_manuales: 0,
  desactualizado: false, created_at: "2026-10-16T10:00:00Z", updated_at: "2026-10-16T10:00:00Z",
});

async function abrirPaso3(inversores = 2) {
  vi.mocked(equipo.obtenerEquipo).mockResolvedValue(CONFIG(inversores) as never);
  vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT(inversores) as never);
  paso3();
  await screen.findByText("BLOQUES POR INVERSOR");
}

describe("Paso 3: bloques por inversor", () => {
  it("lista cada inversor con sus bloques y la leyenda los muestra con su color", async () => {
    await abrirPaso3();
    expect(screen.getByText("Inversor 1 · Huawei SUN2000")).toBeTruthy();
    expect(screen.getByText(/2 bloques · 136 paneles/)).toBeTruthy();
    expect(screen.getByText(/1 bloque · 96 paneles/)).toBeTruthy();
    // Se sugiere 1 (232 paneles) y hay 2: avisa y enlaza al Paso 2
    expect(screen.getByText("Ajustar en el Paso 2")).toBeTruthy();
  });

  it("Reagrupar con doble clic llama una sola vez", async () => {
    vi.mocked(layout.reagruparLayout).mockResolvedValue(LAYOUT() as never);
    await abrirPaso3();
    const boton = screen.getByText("Reagrupar");
    await act(async () => {
      fireEvent.click(boton);
      fireEvent.click(boton);
    });
    expect(layout.reagruparLayout).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Bloques repartidos entre 2 inversores/)).toBeTruthy();
  });

  it("con un solo inversor no hay nada que reagrupar ni que elegir", async () => {
    await abrirPaso3(1);
    expect((screen.getByText("Reagrupar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Ajustar B"));
    expect(screen.queryByDisplayValue("Inversor 1")).toBeNull();
  });

  it("en modo edición un bloque se pasa a otro inversor y se guarda con su nuevo inversor", async () => {
    vi.mocked(layout.guardarBloques).mockResolvedValue(LAYOUT() as never);
    await abrirPaso3();
    // "Ajustar B" abre la edición con el bloque B (el tercero) elegido
    fireEvent.click(screen.getByText("Ajustar B"));
    const guardar = screen.getByText("Guardar cambios") as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);

    fireEvent.change(screen.getByDisplayValue("Inversor 1"), { target: { value: "1" } });
    expect(screen.getByText(/1 cambio\(s\)/)).toBeTruthy();
    expect(guardar.disabled).toBe(false);
    expect(hayCambiosPendientes()).toBe(true);

    await act(async () => fireEvent.click(guardar));
    const [, enviados] = vi.mocked(layout.guardarBloques).mock.calls[0];
    expect(enviados.map((b) => b.inversor)).toEqual([0, 1, 1]);
  });
});
