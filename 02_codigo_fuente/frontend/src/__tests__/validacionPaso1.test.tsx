/**
 * Paso 1: cada error aparece junto a su campo, en rojo, y no se avanza
 * hasta corregirlo (revisión del 16 de noviembre).
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar/:proyectoId/terreno"]);
const nuevo = () => montar(<TerrenoPage />, "/generar", ["/generar"]);
const listo = () => screen.findByText("Actualizar plano");
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
    [/^Latitud/, "95", "Debe estar entre -90 y 90."],
    [/^Latitud/, "norte", "Debe ser un número en grados decimales (ej. 0.3517)."],
    [/^Longitud/, "-181", "Debe estar entre -180 y 180."],
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
    const latitud = campo(/^Latitud/);
    escribir(latitud, "200");
    expect(errorDe(latitud)).toBeNull();
    fireEvent.blur(latitud);
    expect(errorDe(latitud)).toBe("Debe estar entre -90 y 90.");
    escribir(latitud, "0,35");
    expect(errorDe(latitud)).toBeNull();
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
