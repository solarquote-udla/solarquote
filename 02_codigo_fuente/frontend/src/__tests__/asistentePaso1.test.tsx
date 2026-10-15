import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { TerrenoPage } from "@/pages/TerrenoPage";
import * as proyectos from "@/services/proyectos";
import * as terreno from "@/services/terreno";

import { montar, PROYECTO, rect, TERRENO } from "./utilidades";

vi.mock("@/services/proyectos", () => ({ obtenerProyecto: vi.fn(), crearProyecto: vi.fn(), actualizarProyecto: vi.fn() }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn(), crearTerreno: vi.fn(), actualizarTerreno: vi.fn() }));
vi.mock("@/services/clientes", () => ({
  listarClientes: vi.fn().mockResolvedValue([{ id: 9, nombre: "Cliente", identificacion: "1", activo: true }]),
}));

const campo = (e: RegExp) => screen.getByLabelText(e) as HTMLInputElement;
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar", "/generar/:proyectoId/terreno"]);
const listo = () => screen.findByText("Actualizar plano");

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
    ["latitud", () => escribir(campo(/^Latitud/), "0,5")],
    ["ancho sin Actualizar plano", () => escribir(campo(/^Ancho \(m\)/), "120")],
    ["largo sin Actualizar plano", () => escribir(campo(/^Largo \(m\)/), "70")],
    ["orientación", () => fireEvent.click(screen.getByText(/^Este/))],
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

  it("aceptar la confirmación sí sale", async () => {
    existente();
    await listo();
    escribir(campo(/^Ancho \(m\)/), "120");
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
  it("Siguiente guarda las dimensiones escritas y avanza sin preguntar", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    existente();
    await listo();
    escribir(campo(/^Ancho \(m\)/), "120");
    escribir(campo(/^Largo \(m\)/), "88,5");
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

  it("Actualizar plano confirma antes de pisar un contorno irregular editado a mano", async () => {
    existente();
    await listo();
    fireEvent.click(screen.getByText(/Editar coordenadas/));
    escribir(screen.getByLabelText("Vértice 3, x"), "130");
    expect(campo(/^Ancho \(m\)/).value).toBe("130");
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText("Actualizar plano"));
    expect(confirmar).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Vértice 3, x") as HTMLInputElement).value).toBe("130");
  });

  it("contorno irregular con otras dimensiones: Siguiente bloquea con un mensaje", async () => {
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO([[0, 0], [50, 0], [60, 30], [0, 40]]) as never);
    existente();
    await listo();
    escribir(campo(/^Ancho \(m\)/), "70");
    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(screen.getByRole("alert").textContent).toMatch(/contorno irregular/);
    expect(terreno.actualizarTerreno).not.toHaveBeenCalled();
  });

  it("Siguiente queda deshabilitado mientras se dibuja", async () => {
    existente();
    await listo();
    fireEvent.click(screen.getByText("Redibujar contorno"));
    expect((screen.getByText(/Siguiente/).closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
