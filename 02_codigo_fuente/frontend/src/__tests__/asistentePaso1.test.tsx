import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { TerrenoPage } from "@/pages/TerrenoPage";
import * as proyectos from "@/services/proyectos";
import * as terreno from "@/services/terreno";

import { montar, PROYECTO, rect, TERRENO } from "./utilidades";

vi.mock("@/services/proyectos", () => ({ obtenerProyecto: vi.fn(), crearProyecto: vi.fn(), actualizarProyecto: vi.fn() }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn(), crearTerreno: vi.fn(), actualizarTerreno: vi.fn() }));
vi.mock("@/components/MapaUbicacion", async () => ({ MapaUbicacion: (await import("./mapaFalso")).MapaFalso }));
vi.mock("@/services/geocodificacion", () => ({ buscarDireccion: vi.fn() }));
vi.mock("@/services/clientes", () => ({
  listarClientes: vi.fn().mockResolvedValue([{ id: 9, nombre: "Cliente", identificacion: "1", activo: true }]),
}));

const campo = (e: RegExp) => screen.getByLabelText(e) as HTMLInputElement;
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar", "/generar/:proyectoId/terreno"]);
const listo = () => screen.findByText("MEDIDAS DEL TERRENO");
/** Cambia el largo de un lado como lo hace el usuario: escribe y sale del campo. */
function cambiarLado(n: number, valor: string) {
  const lado = screen.getByLabelText(`Largo del lado ${n} (m)`);
  fireEvent.change(lado, { target: { value: valor } });
  fireEvent.blur(lado);
}

beforeEach(() => {
  vi.mocked(proyectos.obtenerProyecto).mockResolvedValue(PROYECTO as never);
  vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
  vi.mocked(terreno.actualizarTerreno).mockResolvedValue(TERRENO(rect(1, 1)) as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Paso 1: cambios sin guardar", () => {
  it("sin cambios, la barra de pasos navega sin preguntar", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    existente();
    await listo();
    await act(async () => fireEvent.click(screen.getByText("Panel + Inversor")));
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
    expect(hayCambiosPendientes()).toBe(false);
  });

  const cambios: [string, () => void][] = [
    ["nombre del proyecto", () => escribir(campo(/^Nombre del proyecto/), "Otro")],
    ["ubicación en el mapa", () => {
      fireEvent.click(screen.getByRole("tab", { name: "Mapa" }));
      fireEvent.click(screen.getByText("CLIC EN EL MAPA"));
    }],
    ["largo de un lado", () => cambiarLado(1, "120")],
    ["norte del plano", () => escribir(campo(/^Grados/), "90")],
    ["notas", () => escribir(campo(/^Notas del terreno/), "x")],
    ["vértice editado", () => {
      fireEvent.click(screen.getByText(/Editar coordenadas/));
      escribir(screen.getByLabelText("Vértice 2, x"), "90");
    }],
  ];
  const salidas: [string, () => void][] = [
    ["Cancelar", () => fireEvent.click(screen.getByText("Cancelar"))],
    ["barra de pasos", () => fireEvent.click(screen.getByText("Panel + Inversor"))],
    ["menú lateral", () => fireEvent.click(screen.getByText("MENU HISTORIAL"))],
  ];
  for (const [cambio, hacer] of cambios) {
    for (const [salida, salir] of salidas) {
      it(`${cambio} + ${salida}: pregunta y, si se cancela, se queda`, async () => {
        existente();
        await listo();
        hacer();
        expect(hayCambiosPendientes()).toBe(true);
        const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
        await act(async () => salir());
        expect(confirmar).toHaveBeenCalledOnce();
        expect(screen.queryByText("PASO 2")).toBeNull();
        expect(screen.queryByText("HISTORIAL")).toBeNull();
      });
    }
  }

  it("empezar a dibujar sin marcar puntos no cuenta como cambio", async () => {
    existente();
    await listo();
    fireEvent.click(screen.getByText("Redibujar contorno"));
    expect(hayCambiosPendientes()).toBe(false);
  });

  it("un rectángulo escrito sin crear también cuenta como cambio", async () => {
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(null as never);
    existente();
    await listo();
    expect(hayCambiosPendientes()).toBe(false);
    escribir(campo(/^Ancho \(m\)/), "120");
    escribir(campo(/^Largo \(m\)/), "70");
    expect(hayCambiosPendientes()).toBe(true);
  });

  it("aceptar la confirmación sí sale", async () => {
    existente();
    await listo();
    cambiarLado(1, "120");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => fireEvent.click(screen.getByText("MENU HISTORIAL")));
    expect(await screen.findByText("HISTORIAL")).toBeTruthy();
  });

  it("recargar o cerrar la pestaña con cambios queda interceptado", async () => {
    existente();
    await listo();
    escribir(campo(/^Notas del terreno/), "x");
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });
});

describe("Paso 1: guardar y geometría", () => {
  it("Siguiente guarda el lado editado y avanza sin preguntar", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    existente();
    await listo();
    cambiarLado(1, "120");
    cambiarLado(2, "88,5");
    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(confirmar).not.toHaveBeenCalled();
    expect(vi.mocked(terreno.actualizarTerreno).mock.calls[0][1].vertices).toEqual(rect(120, 88.5));
  });

  it("proyecto nuevo: Siguiente crea proyecto y terreno una sola vez aunque se pulse dos veces", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    let terminar: (v: unknown) => void = () => undefined;
    vi.mocked(proyectos.crearProyecto).mockImplementation(() => new Promise((r) => (terminar = r)) as never);
    vi.mocked(terreno.crearTerreno).mockResolvedValue(TERRENO(rect(120, 88)) as never);
    montar(<TerrenoPage />, "/generar", ["/generar"]);
    await listo();
    escribir(campo(/^Nombre del proyecto/), "Nuevo");
    escribir(campo(/^Cliente/), "9");
    escribir(campo(/^Ancho \(m\)/), "120");
    escribir(campo(/^Largo \(m\)/), "88");
    const siguiente = screen.getByText(/Siguiente/);
    await act(async () => {
      fireEvent.click(siguiente);
      fireEvent.click(siguiente);
    });
    await act(async () => terminar(PROYECTO));
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(proyectos.crearProyecto).toHaveBeenCalledOnce();
    expect(confirmar).not.toHaveBeenCalled();
    expect(vi.mocked(terreno.crearTerreno).mock.calls[0][1].vertices).toEqual(rect(120, 88));
  });

  it("con contorno no hay ancho, largo ni Actualizar plano: se muestran lados, perímetro y área", async () => {
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO([[0, 0], [50, 0], [60, 30], [0, 40]]) as never);
    existente();
    await listo();
    expect(screen.queryByLabelText(/^Ancho \(m\)/)).toBeNull();
    expect(screen.queryByLabelText(/^Largo \(m\)/)).toBeNull();
    expect(screen.queryByText("Actualizar plano")).toBeNull();
    expect(screen.getByText("Lados (4)")).toBeTruthy();
    // 50 + 31,62 + 60,83 + 40
    expect(screen.getByTestId("perimetro-terreno").textContent).toBe("182,45 m");
    expect(screen.getByTestId("area-terreno").textContent).toMatch(/^1\.950 m²/);
    expect(screen.getByText(/4 lados · 182,45 m de perímetro/)).toBeTruthy();
  });

  it("Crear rectángulo arma el contorno y desde ahí se editan los lados", async () => {
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(null as never);
    existente();
    await listo();
    fireEvent.click(screen.getByText("Crear rectángulo"));
    // Sin medidas, marca los dos campos
    expect(campo(/^Ancho \(m\)/).getAttribute("aria-invalid")).toBe("true");
    escribir(campo(/^Ancho \(m\)/), "80");
    escribir(campo(/^Largo \(m\)/), "45,5");
    fireEvent.click(screen.getByText("Crear rectángulo"));
    expect(screen.queryByLabelText(/^Ancho \(m\)/)).toBeNull();
    const lados = screen.getAllByLabelText(/^Largo del lado/).map((i) => (i as HTMLInputElement).value);
    expect(lados).toEqual(["80", "45.5", "80", "45.5"]);
  });

  it("en una L, cambiar un lado no arrastra el resto del terreno", async () => {
    const l: [number, number][] = [[0, 0], [60, 0], [60, 30], [30, 30], [30, 50], [0, 50]];
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO(l) as never);
    existente();
    await listo();
    // El lado 3 va de (60, 30) a (30, 30): de 30 a 40 m
    cambiarLado(3, "40");
    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(vi.mocked(terreno.actualizarTerreno).mock.calls[0][1].vertices).toEqual([
      [0, 0],
      [60, 0],
      [60, 30],
      [20, 30],
      [20, 50],
      [0, 50],
    ]);
  });

  it("Siguiente queda deshabilitado mientras se dibuja", async () => {
    existente();
    await listo();
    fireEvent.click(screen.getByText("Redibujar contorno"));
    expect((screen.getByText(/Siguiente/).closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
