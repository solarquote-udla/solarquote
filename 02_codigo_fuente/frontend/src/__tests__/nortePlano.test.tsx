/**
 * Paso 1: el norte solo se pregunta en el plano, con una flecha que gira
 * (revisión con Anita, 25 de noviembre: "Norte / Este / otro ángulo" no se
 * entendía). En el mapa el norte ya está arriba.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerrenoPage } from "@/pages/TerrenoPage";
import * as proyectos from "@/services/proyectos";
import * as terreno from "@/services/terreno";

import { montar, PROYECTO, rect, TERRENO } from "./utilidades";

vi.mock("@/services/proyectos", () => ({ obtenerProyecto: vi.fn(), crearProyecto: vi.fn(), actualizarProyecto: vi.fn() }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn(), crearTerreno: vi.fn(), actualizarTerreno: vi.fn() }));
vi.mock("@/components/MapaUbicacion", async () => ({ MapaUbicacion: (await import("./mapaFalso")).MapaFalso }));
vi.mock("@/services/geocodificacion", () => ({ buscarDireccion: vi.fn() }));
vi.mock("@/services/clientes", () => ({ listarClientes: vi.fn().mockResolvedValue([]) }));

const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar/:proyectoId/terreno"]);
const listo = () => screen.findByText("MEDIDAS DEL TERRENO");
const flecha = () => screen.getByRole("slider", { name: "Flecha del norte" });
const grados = () => (screen.getByLabelText(/^Grados/) as HTMLInputElement).value;
const PREGUNTA = "¿Hacia dónde apunta el norte en tu plano?";

function conNorte(orientacion: number | null) {
  vi.mocked(terreno.obtenerTerreno).mockResolvedValue({ ...TERRENO(rect(100, 60)), orientacion_norte: orientacion } as never);
}

beforeEach(() => {
  vi.mocked(proyectos.obtenerProyecto).mockResolvedValue(PROYECTO as never);
  vi.mocked(terreno.actualizarTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
  conNorte(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Paso 1: norte del plano", () => {
  it("en el plano hay una sola pregunta, sin los botones Norte y Este", async () => {
    existente();
    await listo();
    expect(screen.getByText(PREGUNTA)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Norte/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Este/ })).toBeNull();
    expect(screen.queryByText("ORIENTACIÓN NORTE")).toBeNull();
    // Sin definir: la flecha y la rosa del plano lo dicen
    expect(flecha().getAttribute("aria-valuetext")).toBe("Sin definir");
    expect(screen.getByTestId("norte-plano").textContent).toBe("N?");
  });

  it("en el mapa no se pregunta el norte", async () => {
    existente();
    await listo();
    fireEvent.click(screen.getByRole("tab", { name: "Mapa" }));
    expect(screen.queryByText(PREGUNTA)).toBeNull();
    expect(screen.queryByRole("slider", { name: "Flecha del norte" })).toBeNull();
  });

  it("un clic en el círculo apunta la flecha hacia ese lado", async () => {
    existente();
    await listo();
    // jsdom no tiene tamaños: el centro del círculo queda en (0, 0)
    fireEvent.click(flecha(), { clientX: 10, clientY: 0 });
    expect(grados()).toBe("90");
    fireEvent.click(flecha(), { clientX: -10, clientY: -10 });
    expect(grados()).toBe("315");
    expect(flecha().getAttribute("aria-valuetext")).toBe("315°");
    expect(screen.getByTestId("norte-plano").dataset.grados).toBe("315");
  });

  it("con el teclado gira de 5 en 5 y da la vuelta", async () => {
    conNorte(0);
    existente();
    await listo();
    fireEvent.keyDown(flecha(), { key: "ArrowLeft" });
    expect(grados()).toBe("355");
    fireEvent.keyDown(flecha(), { key: "ArrowRight" });
    fireEvent.keyDown(flecha(), { key: "ArrowRight" });
    expect(grados()).toBe("5");
  });

  it("escribir los grados mueve la flecha y se guarda", async () => {
    conNorte(0);
    existente();
    await listo();
    fireEvent.change(screen.getByLabelText(/^Grados/), { target: { value: "22,5" } });
    expect(flecha().getAttribute("aria-valuenow")).toBe("22.5");
    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(vi.mocked(terreno.actualizarTerreno).mock.calls[0][1].orientacion_norte).toBe(22.5);
  });
});
