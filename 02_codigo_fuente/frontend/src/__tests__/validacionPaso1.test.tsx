/**
 * Paso 1: cada error aparece junto a su campo, en rojo, y no se avanza
 * hasta corregirlo (revisión del 16 de noviembre).
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerrenoPage } from "@/pages/TerrenoPage";
import * as geocodificacion from "@/services/geocodificacion";
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
const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar/:proyectoId/terreno"]);
const nuevo = () => montar(<TerrenoPage />, "/generar", ["/generar"]);
const listo = () => screen.findByText("Actualizar plano");
const pestana = (nombre: "Mapa" | "Plano") => fireEvent.click(screen.getByRole("tab", { name: nombre }));
const siguiente = () => act(async () => fireEvent.click(screen.getByText(/Siguiente/)));

/** Mensaje de error asociado al campo, o null si no tiene. */
function errorDe(el: HTMLElement): string | null {
  if (el.getAttribute("aria-invalid") !== "true") return null;
  const id = el.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

beforeEach(() => {
  vi.mocked(proyectos.obtenerProyecto).mockResolvedValue(PROYECTO as never);
  vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
  vi.mocked(terreno.actualizarTerreno).mockResolvedValue(TERRENO(rect(1, 1)) as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Paso 1: errores junto al campo", () => {
  it("proyecto nuevo vacío: marca nombre, cliente, ancho y largo, y no guarda", async () => {
    nuevo();
    await listo();
    await siguiente();

    expect(errorDe(campo(/^Nombre del proyecto/))).toBe("Escribe el nombre del proyecto.");
    expect(campo(/^Cliente/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Elige el cliente del proyecto.")).toBeTruthy();
    expect(errorDe(campo(/^Ancho \(m\)/))).toBe("Ingresa el ancho o dibuja el contorno.");
    expect(errorDe(campo(/^Largo \(m\)/))).toBe("Ingresa el largo o dibuja el contorno.");
    expect(campo(/^Nombre del proyecto/).className).toMatch(/border-red-500/);
    expect(proyectos.crearProyecto).not.toHaveBeenCalled();
    // Sin mensaje general: cada error está en su campo
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [/^Ancho \(m\)/, "-5", "Debe ser mayor que cero."],
    [/^Ancho \(m\)/, "0", "Debe ser mayor que cero."],
    [/^Largo \(m\)/, "abc", "Debe ser un número en metros."],
    [/^Otro ángulo/, "360", "Debe estar entre 0 y 359,99 grados."],
    [/^Otro ángulo/, "-1", "Debe estar entre 0 y 359,99 grados."],
    [/^Nombre del proyecto/, "ab", "Debe tener al menos 3 caracteres."],
  ])("%s = %j: muestra «%s» y no guarda", async (etiqueta, valor, mensaje) => {
    existente();
    await listo();
    escribir(campo(etiqueta), valor);
    await siguiente();

    expect(errorDe(campo(etiqueta))).toBe(mensaje);
    expect(terreno.actualizarTerreno).not.toHaveBeenCalled();
    expect(proyectos.actualizarProyecto).not.toHaveBeenCalled();
  });

  it("el error aparece al dejar el campo, no mientras se escribe", async () => {
    existente();
    await listo();
    const ancho = campo(/^Ancho \(m\)/);
    escribir(ancho, "-3");
    expect(errorDe(ancho)).toBeNull();
    fireEvent.blur(ancho);
    expect(errorDe(ancho)).toBe("Debe ser mayor que cero.");
    escribir(ancho, "80,5");
    expect(errorDe(ancho)).toBeNull();
  });

  it("al corregir los campos avanza", async () => {
    existente();
    await listo();
    escribir(campo(/^Ancho \(m\)/), "-5");
    await siguiente();
    expect(terreno.actualizarTerreno).not.toHaveBeenCalled();

    escribir(campo(/^Ancho \(m\)/), "120");
    await siguiente();
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(vi.mocked(terreno.actualizarTerreno).mock.calls[0][1].vertices).toEqual(rect(120, 60));
  });

  it("los obligatorios llevan el asterisco rojo", async () => {
    nuevo();
    await listo();
    for (const etiqueta of [/^Nombre del proyecto/, /^Cliente/, /^Ancho \(m\)/, /^Largo \(m\)/]) {
      const marca = campo(etiqueta).closest("label")?.querySelector(".text-red-600");
      expect(marca?.textContent?.trim()).toBe("*");
    }
  });
});

describe("Paso 1: ubicación en el mapa", () => {
  it("no hay campos de latitud ni longitud", async () => {
    existente();
    await listo();
    expect(screen.queryByLabelText(/^Latitud/)).toBeNull();
    expect(screen.queryByLabelText(/^Longitud/)).toBeNull();
  });

  it("el punto marcado en el mapa se guarda como latitud y longitud del proyecto", async () => {
    vi.mocked(proyectos.actualizarProyecto).mockResolvedValue(PROYECTO as never);
    existente();
    await listo();
    pestana("Mapa");
    fireEvent.click(screen.getByText("CLIC EN EL MAPA"));
    expect(screen.getByTestId("coordenadas").textContent).toBe("-0,2298, -78,5249");
    await siguiente();
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(proyectos.actualizarProyecto).toHaveBeenCalledWith(5, { latitud: -0.2298, longitud: -78.5249 });
  });

  it("Quitar ubicación borra el punto y avisa que no habrá sombra", async () => {
    vi.mocked(proyectos.obtenerProyecto).mockResolvedValue({ ...PROYECTO, latitud: 0.35, longitud: -78.12 } as never);
    existente();
    await listo();
    pestana("Mapa");
    expect(screen.getByTestId("marcador").textContent).toBe("0.35,-78.12");
    fireEvent.click(screen.getByText("Quitar ubicación"));
    expect(screen.getByTestId("marcador").textContent).toBe("sin marcador");
    expect(screen.getByText(/Sin ubicación no se calcula la sombra/)).toBeTruthy();
  });

  it("un proyecto con solo latitud la conserva y pide marcar el punto", async () => {
    existente();
    await listo();
    expect(screen.getByText(/Tiene latitud 0,1900 pero falta el punto en el mapa/)).toBeTruthy();
  });

  it("un proyecto con terreno abre en el plano; uno nuevo, en el mapa", async () => {
    existente();
    await listo();
    expect(screen.getByRole("tab", { name: "Plano" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("CLIC EN EL MAPA")).toBeNull();
    cleanup();

    nuevo();
    await listo();
    expect(screen.getByRole("tab", { name: "Mapa" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("CLIC EN EL MAPA")).toBeTruthy();
  });

  it("cambiar de pestaña no cuenta como cambio sin guardar", async () => {
    existente();
    await listo();
    pestana("Mapa");
    pestana("Plano");
    await siguiente();
    expect(await screen.findByText("PASO 2")).toBeTruthy();
    expect(proyectos.actualizarProyecto).not.toHaveBeenCalled();
  });
});

describe("Paso 1: buscar la dirección", () => {
  const direccion = () => screen.getByLabelText("Dirección o lugar") as HTMLInputElement;

  it("busca, muestra los resultados y al elegir uno marca el punto y va al mapa", async () => {
    vi.mocked(geocodificacion.buscarDireccion).mockResolvedValue([
      { nombre: "Quito, Pichincha, Ecuador", latitud: -0.2201641, longitud: -78.5123274 },
      { nombre: "Quito, Esmeraldas, Ecuador", latitud: 0.9, longitud: -79.6 },
    ]);
    existente();
    await listo();
    escribir(direccion(), "Quito");
    await act(async () => fireEvent.click(screen.getByText("Buscar")));

    expect(geocodificacion.buscarDireccion).toHaveBeenCalledWith("Quito");
    const lista = screen.getByRole("list", { name: "Resultados de la búsqueda" });
    fireEvent.click(within(lista).getByText("Quito, Pichincha, Ecuador"));

    expect(screen.getByRole("tab", { name: "Mapa" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("marcador").textContent).toBe("-0.2201641,-78.5123274");
    expect(direccion().value).toBe("Quito, Pichincha, Ecuador");
    expect(screen.queryByRole("list", { name: "Resultados de la búsqueda" })).toBeNull();
  });

  it("Enter en el campo también busca", async () => {
    vi.mocked(geocodificacion.buscarDireccion).mockResolvedValue([]);
    existente();
    await listo();
    escribir(direccion(), "Ibarra");
    await act(async () => fireEvent.keyDown(direccion(), { key: "Enter" }));
    expect(geocodificacion.buscarDireccion).toHaveBeenCalledWith("Ibarra");
    expect(screen.getByText(/No se encontró esa dirección/)).toBeTruthy();
  });

  it("con menos de 3 letras no consulta el buscador", async () => {
    existente();
    await listo();
    escribir(direccion(), "Qu");
    await act(async () => fireEvent.click(screen.getByText("Buscar")));
    expect(geocodificacion.buscarDireccion).not.toHaveBeenCalled();
    expect(screen.getByText(/al menos 3 letras/)).toBeTruthy();
  });

  it("si el buscador falla, se puede marcar el punto a mano", async () => {
    vi.mocked(geocodificacion.buscarDireccion).mockRejectedValue(new Error("sin red"));
    existente();
    await listo();
    escribir(direccion(), "Cayambe");
    await act(async () => fireEvent.click(screen.getByText("Buscar")));
    expect(screen.getByText(/Marca el punto directamente en el mapa/)).toBeTruthy();
  });
});

describe("Paso 1: datos del proyecto", () => {
  it("no muestra el campo Proforma: el número se asigna al confirmar el layout", async () => {
    existente();
    await listo();
    expect(screen.queryByLabelText(/^Proforma/)).toBeNull();
    expect(screen.getByLabelText(/^Fecha/)).toBeTruthy();
  });
});
