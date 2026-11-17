/**
 * Catálogo de inversores (RF-08): búsqueda por marca o modelo, alta/edición
 * con el error de cada dato junto a su campo (propios y los que vienen del
 * manejador de 422 del backend, con `loc`).
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InversoresPage } from "@/pages/InversoresPage";
import * as inversoresServicio from "@/services/inversores";

import { montar } from "./utilidades";

vi.mock("@/services/inversores", () => ({
  listarInversores: vi.fn(async () => [
    { id: 1, marca: "Huawei", modelo: "SUN2000-150K", potencia_kw: 150, vmax_v: 1100, vmin_v: 200, mppts: 6, strings_por_mppt: 2, activo: true },
    { id: 2, marca: "SMA", modelo: "Sunny Tripower 110", potencia_kw: 110, vmax_v: 1000, vmin_v: 180, mppts: 4, strings_por_mppt: 2, activo: true },
  ]),
  crearInversor: vi.fn(),
  actualizarInversor: vi.fn(),
}));

// Igual forma que el manejador_422 del backend (app/core/errores.py).
const errorValidacion = (detalle: { msg: string; loc: (string | number)[] }[]) =>
  new AxiosError("422", "ERR", undefined, undefined, {
    status: 422, data: { detail: detalle }, statusText: "", headers: {}, config: { headers: new AxiosHeaders() },
  });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Catálogo de inversores", () => {
  it("filtra por marca o modelo mientras se escribe", async () => {
    montar(<InversoresPage />, "/configuracion/inversores", ["/configuracion/inversores"]);
    expect(await screen.findByText("SUN2000-150K")).toBeTruthy();
    expect(screen.getByText("Sunny Tripower 110")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar inversores"), { target: { value: "tripower" } });
    expect(screen.queryByText("SUN2000-150K")).toBeNull();
    expect(screen.getByText("Sunny Tripower 110")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar inversores"), { target: { value: "huawei sun" } });
    expect(screen.getByText("SUN2000-150K")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar inversores"), { target: { value: "fronius" } });
    expect(screen.getByText("Ningún inversor coincide con la búsqueda.")).toBeTruthy();
  });
});

describe("Configuración, Inversores: alta con error por campo", () => {
  const abrir = async () => {
    montar(<InversoresPage />, "/configuracion/inversores", ["/configuracion/inversores"]);
    await screen.findByText("SUN2000-150K");
    fireEvent.click(screen.getByText("+ Nuevo inversor"));
  };
  const campo = (etiqueta: RegExp) => screen.getByLabelText(etiqueta) as HTMLInputElement;
  const escribir = (etiqueta: RegExp, valor: string) => fireEvent.change(campo(etiqueta), { target: { value: valor } });
  const errorDe = (etiqueta: RegExp) => {
    const el = campo(etiqueta);
    const id = el.getAttribute("aria-describedby");
    return el.getAttribute("aria-invalid") === "true" && id ? document.getElementById(id)?.textContent : null;
  };
  const llenarValido = () => {
    escribir(/^Marca/, "Growatt");
    escribir(/^Modelo/, "MID 25KTL3-X");
    escribir(/^Potencia \(kW\)/, "25");
  };

  it("formulario vacío: marca los obligatorios y no lo crea", async () => {
    await abrir();
    await act(async () => fireEvent.click(screen.getByText("Crear inversor")));

    expect(errorDe(/^Marca/)).toBe("Debe tener al menos 2 caracteres.");
    expect(errorDe(/^Modelo/)).toBe("El modelo es obligatorio.");
    expect(errorDe(/^Potencia \(kW\)/)).toBe("Debe ser un número mayor a cero.");
    expect(inversoresServicio.crearInversor).not.toHaveBeenCalled();
  });

  it("Vmax sin Vmin: pide los dos juntos", async () => {
    await abrir();
    llenarValido();
    escribir(/^Vmax/, "600");
    await act(async () => fireEvent.click(screen.getByText("Crear inversor")));

    expect(errorDe(/^Vmax/)).toBe("Ingresa Vmax y Vmin juntos, o deja los dos en blanco.");
    expect(inversoresServicio.crearInversor).not.toHaveBeenCalled();
  });

  it("error del backend por campo (422 con loc) se muestra junto al campo", async () => {
    vi.mocked(inversoresServicio.crearInversor).mockRejectedValue(
      errorValidacion([{ msg: "Debe ser un número entero mayor que 0.", loc: ["body", "mppts"] }]),
    );
    await abrir();
    llenarValido();
    escribir(/^MPPTs/, "4");
    await act(async () => fireEvent.click(screen.getByText("Crear inversor")));

    expect(errorDe(/^MPPTs/)).toBe("Debe ser un número entero mayor que 0.");
    expect(inversoresServicio.crearInversor).toHaveBeenCalled();
  });

  it("error del backend sin campo (model_validator, loc: [\"body\"]) se muestra como mensaje general", async () => {
    vi.mocked(inversoresServicio.crearInversor).mockRejectedValue(
      errorValidacion([{ msg: "Vmax debe ser mayor que Vmin.", loc: ["body"] }]),
    );
    await abrir();
    llenarValido();
    await act(async () => fireEvent.click(screen.getByText("Crear inversor")));

    expect(screen.getByText("Vmax debe ser mayor que Vmin.")).toBeTruthy();
  });

  it("con datos válidos lo crea y lo agrega a la lista", async () => {
    vi.mocked(inversoresServicio.crearInversor).mockResolvedValue({
      id: 9, marca: "Growatt", modelo: "MID 25KTL3-X", potencia_kw: 25, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null, activo: true,
    });
    await abrir();
    llenarValido();
    await act(async () => fireEvent.click(screen.getByText("Crear inversor")));

    expect(inversoresServicio.crearInversor).toHaveBeenCalledWith({
      marca: "Growatt", modelo: "MID 25KTL3-X", potencia_kw: 25, vmax_v: null, vmin_v: null, mppts: null, strings_por_mppt: null,
    });
    expect(screen.getByText("MID 25KTL3-X")).toBeTruthy();
  });
});
