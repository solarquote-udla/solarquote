/**
 * Pendientes de la revisión del 16 de noviembre (Anita y Lenin):
 *   - Paso 1: registrar el cliente sin salir del asistente (backend SQ-208).
 *   - Paso 2: cada error junto a su campo, también los del servidor, y la
 *     potencia objetivo aparte de los inversores (kWp de paneles, no kW).
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EquipoPage } from "@/pages/EquipoPage";
import { TerrenoPage } from "@/pages/TerrenoPage";
import * as clientes from "@/services/clientes";
import * as equipo from "@/services/equipo";
import * as proyectos from "@/services/proyectos";

import { montar, PROYECTO, rect, TERRENO } from "./utilidades";

vi.mock("@/components/MapaUbicacion", async () => ({ MapaUbicacion: (await import("./mapaFalso")).MapaFalso }));
vi.mock("@/services/geocodificacion", () => ({ buscarDireccion: vi.fn() }));
vi.mock("@/services/proyectos", () => ({ obtenerProyecto: vi.fn(), crearProyecto: vi.fn(), actualizarProyecto: vi.fn() }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn(), crearTerreno: vi.fn(), actualizarTerreno: vi.fn() }));
vi.mock("@/services/clientes", () => ({
  listarClientes: vi.fn(async () => [{ id: 9, nombre: "Cliente", identificacion: "1", activo: true }]),
  crearCliente: vi.fn(),
  actualizarCliente: vi.fn(),
}));
vi.mock("@/services/equipo", () => ({ obtenerEquipo: vi.fn(async () => null), guardarEquipo: vi.fn() }));
vi.mock("@/services/inversores", () => ({ listarInversores: vi.fn(async () => []) }));
vi.mock("@/services/paneles", () => ({ listarPaneles: vi.fn(async () => []) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe("Paso 1: nuevo cliente sin salir del asistente", () => {
  it("registra el cliente, lo agrega a la lista y lo deja elegido", async () => {
    vi.mocked(clientes.crearCliente).mockResolvedValue({
      id: 31, nombre: "Agrícola Imbabura", tipo_identificacion: "cedula", identificacion: "1710034065",
      empresa: null, email: null, telefono: null, direccion: null, activo: true, total_proyectos: 0,
      created_at: "2026-11-17T10:00:00Z", updated_at: "2026-11-17T10:00:00Z",
    } as never);
    montar(<TerrenoPage />, "/generar", ["/generar"]);
    fireEvent.click(await screen.findByText("+ Nuevo cliente"));

    const dialogo = screen.getByRole("dialog", { name: "Nuevo cliente" });
    escribir(within(dialogo).getByLabelText(/^Nombre o razón social/), "Agrícola Imbabura");
    escribir(within(dialogo).getByLabelText(/^Tipo de identificación/), "cedula");
    escribir(within(dialogo).getByLabelText(/^Identificación/), "1710034065");
    escribir(within(dialogo).getByLabelText(/^Correo/), "agricola@example.com");
    escribir(within(dialogo).getByLabelText(/^Teléfono/), "0991234567");
    await act(async () => fireEvent.click(within(dialogo).getByText("Registrar cliente")));

    expect(clientes.crearCliente).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    const select = screen.getByLabelText(/^Cliente/) as HTMLSelectElement;
    expect(select.value).toBe("31");
    expect(within(select).getByText("Agrícola Imbabura")).toBeTruthy();
  });

  it("cancelar cierra sin crear nada", async () => {
    montar(<TerrenoPage />, "/generar", ["/generar"]);
    fireEvent.click(await screen.findByText("+ Nuevo cliente"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Cancelar"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(clientes.crearCliente).not.toHaveBeenCalled();
  });

  it("un proyecto existente conserva su cliente: no ofrece crear otro", async () => {
    vi.mocked(proyectos.obtenerProyecto).mockResolvedValue(PROYECTO as never);
    const { obtenerTerreno } = await import("@/services/terreno");
    vi.mocked(obtenerTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
    montar(<TerrenoPage />, "/generar/5/terreno", ["/generar/:proyectoId/terreno"]);
    await screen.findByText("Actualizar plano");
    expect(screen.queryByText("+ Nuevo cliente")).toBeNull();
  });
});

describe("Paso 2: errores junto al campo", () => {
  const paso2 = async () => {
    montar(<EquipoPage />, "/generar/5/equipo", ["/generar/:proyectoId/equipo"]);
    await screen.findByText("Panel solar");
  };
  /** Campos del panel (la tarjeta de inversores repite etiquetas como Marca); la potencia objetivo va aparte. */
  const campo = (etiqueta: RegExp) => {
    if (String(etiqueta).includes("objetivo")) return screen.getByLabelText(etiqueta) as HTMLInputElement;
    const panel = screen.getByRole("heading", { name: "Panel solar" }).closest("section") as HTMLElement;
    return within(panel).getByLabelText(etiqueta) as HTMLInputElement;
  };
  const errorDe = (el: HTMLElement) => {
    const id = el.getAttribute("aria-describedby");
    return el.getAttribute("aria-invalid") === "true" && id ? document.getElementById(id)?.textContent : null;
  };
  const guardar = () => act(async () => fireEvent.click(screen.getByText("Guardar y calcular")));
  /** Panel e inversor válidos, para luego romper uno solo. */
  function llenarTodo() {
    escribir(campo(/^Marca/), "Jinko");
    escribir(campo(/^Modelo/), "Tiger");
    escribir(campo(/^Potencia\(Wp\)/), "580");
    escribir(campo(/^Largo/), "2278");
    escribir(campo(/^Ancho/), "1134");
    escribir(campo(/^Voc/), "52");
    escribir(campo(/^Vmp/), "43");
    escribir(campo(/^Ángulo de montaje/), "15");
    const inversor = within(screen.getByRole("listitem", { name: "Inversor 1" }));
    escribir(inversor.getByLabelText(/^Marca/), "Huawei");
    escribir(inversor.getByLabelText(/^Modelo/), "SUN2000");
    escribir(inversor.getByLabelText(/^Potencia\(kW\)/), "100");
  }

  it("vacío: marca cada campo obligatorio y no guarda", async () => {
    await paso2();
    await guardar();
    expect(errorDe(campo(/^Marca/))).toBe("Escribe la marca.");
    expect(errorDe(campo(/^Potencia\(Wp\)/))).toBe("Obligatorio.");
    expect(errorDe(campo(/^Ángulo de montaje/))).toBe("Obligatorio.");
    expect(screen.getByText("Revisa los campos marcados en rojo.")).toBeTruthy();
    expect(equipo.guardarEquipo).not.toHaveBeenCalled();
  });

  it.each([
    [/^Vmp/, "60", "El Vmp debe ser menor que el Voc. Revisa que no estén intercambiados."],
    [/^Ancho/, "3000", "El ancho no puede ser mayor que el largo: el largo es el lado mayor del panel."],
    [/^Ángulo de montaje/, "95", "Debe estar entre 0 y 90°."],
    [/^Potencia\(Wp\)/, "-5", "Debe ser mayor que 0 y hasta 1500 Wp."],
    [/^Potencia objetivo/, "0", "Debe ser un número mayor que 0, o dejarse vacío."],
  ])("%s = %j: «%s»", async (etiqueta, valor, mensaje) => {
    await paso2();
    llenarTodo();
    escribir(campo(etiqueta), valor);
    await guardar();
    expect(errorDe(campo(etiqueta))).toBe(mensaje);
    expect(equipo.guardarEquipo).not.toHaveBeenCalled();
  });

  it("el error del servidor cae junto a su campo y se quita al corregirlo", async () => {
    const respuesta = {
      status: 422,
      statusText: "Unprocessable Entity",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { detail: [{ loc: ["body", "panel", "voc_v"], msg: "Debe ser como máximo 200.", type: "less_than_equal" }] },
    };
    vi.mocked(equipo.guardarEquipo).mockRejectedValue(new AxiosError("422", "ERR", undefined, undefined, respuesta as never));
    await paso2();
    llenarTodo();
    await guardar();
    expect(errorDe(campo(/^Voc/))).toBe("Debe ser como máximo 200.");
    escribir(campo(/^Voc/), "51");
    expect(errorDe(campo(/^Voc/))).toBeNull();
  });

  it("la potencia objetivo está aparte, fuera de la tarjeta de inversores", async () => {
    await paso2();
    const objetivo = campo(/^Potencia objetivo/);
    const inversores = screen.getByRole("heading", { name: "Inversores" }).closest("section") as HTMLElement;
    expect(inversores.contains(objetivo)).toBe(false);
    expect(screen.getByText(/Los inversores se miden aparte, en kW/)).toBeTruthy();
  });
});
