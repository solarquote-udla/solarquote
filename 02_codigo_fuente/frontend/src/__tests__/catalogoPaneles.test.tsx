/**
 * Catálogo de paneles (RF-02): búsqueda y elección en el Paso 2, y la
 * pantalla de Configuración, Paneles, con el error de cada dato junto a su
 * campo.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EquipoPage } from "@/pages/EquipoPage";
import { PanelesPage } from "@/pages/PanelesPage";
import * as paneles from "@/services/paneles";
import type { PanelCatalogo } from "@/types/api";
import { filtrarPaneles } from "@/utils/buscarPanel";

import { montar } from "./utilidades";

vi.mock("@/services/proyectos", async () => {
  const { PROYECTO } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => PROYECTO), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({ obtenerEquipo: vi.fn(async () => null), guardarEquipo: vi.fn() }));
vi.mock("@/services/inversores", () => ({ listarInversores: vi.fn(async () => []) }));
vi.mock("@/services/paneles", () => ({ listarPaneles: vi.fn(), crearPanel: vi.fn(), actualizarPanel: vi.fn() }));

const panel = (id: number, marca: string, modelo: string, potencia_wp: number): PanelCatalogo => ({
  id, marca, modelo, potencia_wp, largo_mm: 2278, ancho_mm: 1134, voc_v: 52.31, vmp_v: 43.35, activo: true,
});
const CATALOGO = [
  panel(1, "Canadian Solar", "TOPBiHiKu6 CS6W-580TB-AG", 580),
  panel(2, "Jinko Solar", "Tiger Neo JKM580N-72HL4-V", 580),
  panel(3, "Jinko Solar", "Tiger Neo 3.0 JKM670N-66QL6-BDV", 670),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("filtrarPaneles", () => {
  it.each([
    ["", 3],
    ["580", 2],
    ["jinko", 2],
    ["jinko 580", 1],
    ["JINKO 670wp", 1],
    ["canadian 670", 0],
  ])("%j encuentra %i", (texto, cantidad) => {
    expect(filtrarPaneles(CATALOGO, texto)).toHaveLength(cantidad);
  });
});

describe("Paso 2: panel del catálogo", () => {
  const paso2 = () => montar(<EquipoPage />, "/generar/5/equipo", ["/generar/:proyectoId/equipo"]);
  const lista = () => screen.getByRole("list", { name: "Paneles del catálogo" });

  it("busca por potencia y llena el formulario con el panel elegido", async () => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    paso2();
    expect(await screen.findByText(/Tiger Neo 3.0/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar panel"), { target: { value: "670" } });
    expect(within(lista()).queryByText(/CS6W/)).toBeNull();
    fireEvent.click(within(lista()).getByText(/Tiger Neo 3.0/));

    // El panel es la primera sección del paso: sus campos van antes que los del inversor
    expect((screen.getAllByLabelText(/^Marca/)[0] as HTMLInputElement).value).toBe("Jinko Solar");
    expect((screen.getByLabelText(/^Potencia\(Wp\)/) as HTMLInputElement).value).toBe("670");
    expect(screen.getByText(/Datos del catálogo de paneles/)).toBeTruthy();
  });

  it("sin coincidencias, invita a ingresarlo manualmente", async () => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    paso2();
    await screen.findByText(/Tiger Neo 3.0/);
    fireEvent.change(screen.getByLabelText("Buscar panel"), { target: { value: "longi" } });
    expect(screen.getByText(/Ningún panel coincide/)).toBeTruthy();
    expect(screen.getByText("+ Ingresar manualmente")).toBeTruthy();
  });

  it("si el catálogo no carga, el paso sigue funcionando a mano", async () => {
    vi.mocked(paneles.listarPaneles).mockRejectedValue(new Error("caído"));
    paso2();
    expect(await screen.findByText(/No se pudo cargar el catálogo de paneles/)).toBeTruthy();
    expect(screen.getAllByLabelText(/^Marca/).length).toBeGreaterThan(0);
  });
});

describe("Configuración, Paneles", () => {
  const abrir = async () => {
    montar(<PanelesPage />, "/configuracion/paneles", ["/configuracion/paneles"]);
    await screen.findByText("TOPBiHiKu6 CS6W-580TB-AG");
  };
  const campo = (etiqueta: RegExp) => screen.getByLabelText(etiqueta) as HTMLInputElement;
  const escribir = (etiqueta: RegExp, valor: string) => fireEvent.change(campo(etiqueta), { target: { value: valor } });
  const errorDe = (etiqueta: RegExp) => {
    const el = campo(etiqueta);
    const id = el.getAttribute("aria-describedby");
    return el.getAttribute("aria-invalid") === "true" && id ? document.getElementById(id)?.textContent : null;
  };

  it("lista y busca por potencia", async () => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    await abrir();
    fireEvent.change(screen.getByLabelText("Buscar paneles"), { target: { value: "670" } });
    expect(screen.queryByText("TOPBiHiKu6 CS6W-580TB-AG")).toBeNull();
    expect(screen.getByText("Tiger Neo 3.0 JKM670N-66QL6-BDV")).toBeTruthy();
  });

  it("nuevo panel vacío: marca cada campo y no lo crea", async () => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    await abrir();
    fireEvent.click(screen.getByText("+ Nuevo panel"));
    await act(async () => fireEvent.click(screen.getByText("Crear panel")));

    expect(errorDe(/^Marca/)).toBe("Debe tener al menos 2 caracteres.");
    expect(errorDe(/^Modelo/)).toBe("Escribe el modelo.");
    expect(errorDe(/^Potencia/)).toBe("Obligatorio.");
    expect(paneles.crearPanel).not.toHaveBeenCalled();
  });

  it.each([
    [/^Potencia/, "-580", "Debe ser mayor que 0 y hasta 1500 Wp."],
    [/^Largo/, "1000", "El largo es el lado mayor: no puede ser menor que el ancho."],
    [/^Voc/, "40", "El Voc debe ser mayor que el Vmp."],
  ])("%s = %j: «%s»", async (etiqueta, valor, mensaje) => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    await abrir();
    fireEvent.click(screen.getByText("+ Nuevo panel"));
    for (const [e, v] of [[/^Marca/, "Longi"], [/^Modelo/, "Hi-MO 6"], [/^Potencia/, "580"], [/^Largo/, "2278"], [/^Ancho/, "1134"], [/^Voc/, "52"], [/^Vmp/, "43"]] as const) {
      escribir(e, v);
    }
    escribir(etiqueta, valor);
    await act(async () => fireEvent.click(screen.getByText("Crear panel")));
    expect(errorDe(etiqueta)).toBe(mensaje);
    expect(paneles.crearPanel).not.toHaveBeenCalled();
  });

  it("con datos válidos lo crea con números y lo agrega a la lista", async () => {
    vi.mocked(paneles.listarPaneles).mockResolvedValue(CATALOGO);
    vi.mocked(paneles.crearPanel).mockResolvedValue(panel(9, "Longi", "Hi-MO 6", 575));
    await abrir();
    fireEvent.click(screen.getByText("+ Nuevo panel"));
    for (const [e, v] of [[/^Marca/, "Longi"], [/^Modelo/, "Hi-MO 6"], [/^Potencia/, "575"], [/^Largo/, "2278"], [/^Ancho/, "1134"], [/^Voc/, "51,9"], [/^Vmp/, "43,6"]] as const) {
      escribir(e, v);
    }
    await act(async () => fireEvent.click(screen.getByText("Crear panel")));
    expect(paneles.crearPanel).toHaveBeenCalledWith({
      marca: "Longi", modelo: "Hi-MO 6", potencia_wp: 575, largo_mm: 2278, ancho_mm: 1134, voc_v: 51.9, vmp_v: 43.6,
    });
    expect(screen.getByText("Hi-MO 6")).toBeTruthy();
  });
});
