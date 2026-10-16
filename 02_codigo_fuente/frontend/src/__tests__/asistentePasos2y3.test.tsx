import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { EquipoPage } from "@/pages/EquipoPage";
import { LayoutPage } from "@/pages/LayoutPage";
import * as equipo from "@/services/equipo";
import * as layout from "@/services/layout";
import * as terreno from "@/services/terreno";

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
vi.mock("@/services/layout", () => ({
  obtenerLayout: vi.fn(async () => null),
  generarLayout: vi.fn(),
  guardarBloques: vi.fn(),
  reagruparLayout: vi.fn(),
}));
vi.mock("@/services/inversores", () => ({ listarInversores: vi.fn(async () => []) }));
vi.mock("@/services/terreno", async () => {
  const { TERRENO } = await import("./utilidades");
  return {
    // Terreno angosto (10 m) con un camino horizontal de 8 m
    obtenerTerreno: vi.fn(async () =>
      TERRENO([[0, 0], [10, 0], [10, 100], [0, 100]], [
        { id: 7, nombre: "Camino H1", tipo: "acceso", vertices: [[0, 46], [10, 46], [10, 54], [0, 54]] },
      ]),
    ),
    agregarCamino: vi.fn(async () => ({})),
    eliminarCamino: vi.fn(),
  };
});

const CONFIG = {
  proyecto_id: 5,
  panel: { marca: "A", modelo: "B", potencia_wp: 580, largo_mm: 2278, ancho_mm: 1134, voc_v: 52, vmp_v: 43 },
  angulo_montaje: 15,
  inversores: [{ marca: "H", modelo: "M", potencia_kw: 160, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null }],
  potencia_objetivo_kwp: null,
  calculos: { area_panel_m2: 2.58, separacion: null, strings: [null], sugerencia: null, advertencias: [] },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const paso2 = () => montar(<EquipoPage />, "/generar/5/equipo", ["/generar/:proyectoId/equipo"]);
const paso3 = () => montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
const salidas: [string, () => void][] = [
  ["Anterior", () => fireEvent.click(screen.getByText(/Anterior/))],
  ["barra de pasos", () => fireEvent.click(screen.getByText("Terreno"))],
  ["menú lateral", () => fireEvent.click(screen.getByText("MENU HISTORIAL"))],
];

async function intentarSalir(salir: () => void) {
  const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => salir());
  expect(confirmar).toHaveBeenCalledOnce();
  expect(screen.queryByText("HISTORIAL")).toBeNull();
  expect(screen.queryByText("PASO 1")).toBeNull();
}

function llenarEquipo() {
  const textos = screen.getAllByRole("textbox");
  // Panel (8 campos), potencia objetivo (vacía) e Inversor 1
  ["A", "B", "580", "2278", "1134", "52", "43", "15", "", "H", "M", "160"].forEach((v, i) =>
    fireEvent.change(textos[i], { target: { value: v } }),
  );
}

describe("Paso 2", () => {
  for (const [salida, salir] of salidas) {
    it(`primera vez con datos escritos + ${salida}: pregunta`, async () => {
      paso2();
      await screen.findByText("Panel solar");
      fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Canadian" } });
      await intentarSalir(salir);
    });

    it(`"Editar datos" del encabezado con cambios + ${salida}: pregunta`, async () => {
      paso2();
      await screen.findByText("Panel solar");
      fireEvent.click(screen.getByText("Editar datos"));
      fireEvent.change(screen.getByDisplayValue("San Pablo"), { target: { value: "Otro nombre" } });
      await intentarSalir(salir);
    });
  }

  it("sin cambios sale directo", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    paso2();
    await screen.findByText("Panel solar");
    await act(async () => fireEvent.click(screen.getByText(/Anterior/)));
    expect(await screen.findByText("PASO 1")).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("Siguiente guarda una sola vez y avanza sin preguntar", async () => {
    vi.mocked(equipo.guardarEquipo).mockResolvedValue(CONFIG as never);
    const confirmar = vi.spyOn(window, "confirm");
    paso2();
    await screen.findByText("Panel solar");
    llenarEquipo();
    const siguiente = screen.getByText(/Siguiente/);
    await act(async () => {
      fireEvent.click(siguiente);
      fireEvent.click(siguiente);
    });
    expect(await screen.findByText("PASO 3")).toBeTruthy();
    expect(equipo.guardarEquipo).toHaveBeenCalledOnce();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("Siguiente con 'Editar datos' a medio llenar no avanza ni guarda", async () => {
    paso2();
    await screen.findByText("Panel solar");
    fireEvent.click(screen.getByText("Editar datos"));
    fireEvent.change(screen.getByDisplayValue("San Pablo"), { target: { value: "Otro nombre" } });
    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(screen.getByText(/antes de continuar/)).toBeTruthy();
    expect(equipo.guardarEquipo).not.toHaveBeenCalled();
    expect(screen.queryByText("PASO 3")).toBeNull();
  });

  it("si guarda pero falla refrescar el encabezado, igual informa que guardó", async () => {
    const { obtenerProyecto } = await import("@/services/proyectos");
    vi.mocked(equipo.guardarEquipo).mockResolvedValue(CONFIG as never);
    paso2();
    await screen.findByText("Panel solar");
    vi.mocked(obtenerProyecto).mockRejectedValueOnce(new Error("red"));
    llenarEquipo();
    await act(async () => fireEvent.click(screen.getByText("Guardar y calcular")));
    expect(await screen.findByText("Configuración guardada.")).toBeTruthy();
    expect(screen.getByText("Área por panel")).toBeTruthy();
  });
});

describe("Paso 3", () => {
  it("sin cambios sale directo; abrir el formulario de camino sin tocarlo no cuenta", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    paso3();
    await screen.findByText(/Horizontal · 8 m de ancho/);
    fireEvent.click(screen.getByText("+ Agregar"));
    expect(hayCambiosPendientes()).toBe(false);
    await act(async () => fireEvent.click(screen.getByText(/Anterior/)));
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
  });

  const cambios: [string, () => void][] = [
    ["camino a medio cargar", () => {
      fireEvent.click(screen.getByText("+ Agregar"));
      fireEvent.change(screen.getByLabelText(/^Ancho \(m\)/), { target: { value: "6" } });
    }],
    ["dirección del camino cambiada", () => {
      fireEvent.click(screen.getByText("+ Agregar"));
      fireEvent.click(screen.getByText("Vertical"));
    }],
    ["capacidad deseada sin volver a generar", () =>
      fireEvent.change(screen.getByPlaceholderText("Máxima"), { target: { value: "316" } })],
    ["pasillo sin volver a generar", () => fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "3" } })],
    ["Editar datos del encabezado", () => {
      fireEvent.click(screen.getByText("Editar datos"));
      fireEvent.change(screen.getByDisplayValue("San Pablo"), { target: { value: "Otro" } });
    }],
  ];
  for (const [cambio, hacer] of cambios) {
    for (const [salida, salir] of salidas) {
      it(`${cambio} + ${salida}: pregunta`, async () => {
        paso3();
        await screen.findByText(/Horizontal · 8 m de ancho/);
        hacer();
        expect(hayCambiosPendientes()).toBe(true);
        await intentarSalir(salir);
      });
    }
  }

  it("la posición se recentra al cambiar de dirección y un eje fuera del terreno se rechaza", async () => {
    paso3();
    await screen.findByText(/Horizontal · 8 m de ancho/);
    fireEvent.click(screen.getByText("+ Agregar"));
    expect((screen.getByLabelText(/Eje desde abajo/) as HTMLInputElement).value).toBe("50");
    fireEvent.click(screen.getByText("Vertical"));
    expect((screen.getByLabelText(/Eje desde la izquierda/) as HTMLInputElement).value).toBe("5");
    fireEvent.change(screen.getByLabelText(/Eje desde la izquierda/), { target: { value: "30" } });
    await act(async () => fireEvent.click(screen.getByText("Agregar camino")));
    expect(screen.getByText(/entre 0 y 10 m/)).toBeTruthy();
    expect(terreno.agregarCamino).not.toHaveBeenCalled();
  });

  it("agregar un camino con doble clic lo crea una sola vez y deja el formulario sin pendientes", async () => {
    paso3();
    await screen.findByText(/Horizontal · 8 m de ancho/);
    fireEvent.click(screen.getByText("+ Agregar"));
    fireEvent.change(screen.getByLabelText(/^Ancho \(m\)/), { target: { value: "6" } });
    const agregar = screen.getByText("Agregar camino");
    await act(async () => {
      fireEvent.click(agregar);
      fireEvent.click(agregar);
    });
    expect(terreno.agregarCamino).toHaveBeenCalledOnce();
    expect(hayCambiosPendientes()).toBe(false);
    expect(layout.generarLayout).not.toHaveBeenCalled();
  });
});
