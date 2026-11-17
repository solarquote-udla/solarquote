/**
 * Catálogo de materiales y precios unitarios (RF-09), con el error de cada
 * dato junto a su campo — mismo patrón que PanelesPage/InversoresPage.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialesPage } from "@/pages/MaterialesPage";
import { PreciosPage } from "@/pages/PreciosPage";
import type { Material } from "@/types/api";

import { montar } from "./utilidades";

vi.mock("@/services/materiales", () => ({
  listarMateriales: vi.fn(async () => [
    { id: 1, codigo: "VAR1650", nombre: "Varilla 1650mm", unidad: "u", precio_vigente: "7.20", vigente_desde: "2026-01-01", activo: true },
  ]),
  crearMaterial: vi.fn(),
  actualizarMaterial: vi.fn(),
  actualizarPrecio: vi.fn(),
  obtenerHistorialPrecios: vi.fn(async () => []),
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

const material = (cambios: Partial<Material> = {}): Material => ({
  id: 9, codigo: "VAR1350", nombre: "Varilla 1350mm", unidad: "u", precio_vigente: null, vigente_desde: null, activo: true,
  ...cambios,
});

describe("Configuración, Materiales: alta con error por campo", () => {
  const abrir = async () => {
    montar(<MaterialesPage />, "/configuracion/materiales", ["/configuracion/materiales"]);
    await screen.findByText("Varilla 1650mm");
    fireEvent.click(screen.getByText("+ Nuevo material"));
  };
  const campo = (etiqueta: RegExp) => screen.getByLabelText(etiqueta) as HTMLInputElement;
  const escribir = (etiqueta: RegExp, valor: string) => fireEvent.change(campo(etiqueta), { target: { value: valor } });
  const errorDe = (etiqueta: RegExp) => {
    const el = campo(etiqueta);
    const id = el.getAttribute("aria-describedby");
    return el.getAttribute("aria-invalid") === "true" && id ? document.getElementById(id)?.textContent : null;
  };

  it("formulario vacío: marca código y nombre, y no lo crea", async () => {
    const { crearMaterial } = await import("@/services/materiales");
    await abrir();
    await act(async () => fireEvent.click(screen.getByText("Crear material")));

    expect(errorDe(/^Código/)).toBe("Debe tener de 2 a 30 caracteres: solo letras, números y guion bajo.");
    expect(errorDe(/^Nombre/)).toBe("Debe tener al menos 2 caracteres.");
    expect(crearMaterial).not.toHaveBeenCalled();
  });

  it("error del backend por campo (422 con loc) se muestra junto al campo", async () => {
    const { crearMaterial } = await import("@/services/materiales");
    vi.mocked(crearMaterial).mockRejectedValue(
      errorValidacion([{ msg: "Ya existe un material con ese código.", loc: ["body", "codigo"], type: "value_error" }]),
    );
    await abrir();
    escribir(/^Código/, "VAR9999");
    escribir(/^Nombre/, "Varilla nueva");
    await act(async () => fireEvent.click(screen.getByText("Crear material")));

    expect(errorDe(/^Código/)).toBe("Ya existe un material con ese código.");
    expect(crearMaterial).toHaveBeenCalled();
  });

  it("con datos válidos lo crea y lo agrega a la lista", async () => {
    const { crearMaterial } = await import("@/services/materiales");
    vi.mocked(crearMaterial).mockResolvedValue(material({ codigo: "VAR9999", nombre: "Varilla nueva" }));
    await abrir();
    escribir(/^Código/, "var9999");
    escribir(/^Nombre/, "Varilla nueva");
    await act(async () => fireEvent.click(screen.getByText("Crear material")));

    expect(crearMaterial).toHaveBeenCalledWith({ codigo: "VAR9999", nombre: "Varilla nueva", unidad: "unidad" });
    expect(screen.getByText("Varilla nueva")).toBeTruthy();
  });
});

describe("Precios unitarios: error por campo", () => {
  const abrir = async () => {
    montar(<PreciosPage />, "/configuracion/precios", ["/configuracion/precios"]);
    await screen.findByText("Varilla 1650mm");
    fireEvent.click(screen.getByText("Cambiar precio"));
  };
  const campoPrecio = () => screen.getByLabelText(/^Precio/) as HTMLInputElement;
  const errorPrecio = () => {
    const el = campoPrecio();
    const id = el.getAttribute("aria-describedby");
    return el.getAttribute("aria-invalid") === "true" && id ? document.getElementById(id)?.textContent : null;
  };

  it("un precio inválido se marca junto al campo y no se guarda", async () => {
    const { actualizarPrecio } = await import("@/services/materiales");
    await abrir();
    fireEvent.change(campoPrecio(), { target: { value: "-5" } });
    await act(async () => fireEvent.click(screen.getByText("Guardar")));

    expect(errorPrecio()).toBe("Debe ser un número mayor o igual a cero, con hasta dos decimales.");
    expect(actualizarPrecio).not.toHaveBeenCalled();
  });

  it("error del backend por campo (422 con loc) se muestra junto al precio", async () => {
    const { actualizarPrecio } = await import("@/services/materiales");
    vi.mocked(actualizarPrecio).mockRejectedValue(
      errorValidacion([{ msg: "Debe ser mayor o igual a 0.", loc: ["body", "precio"], type: "greater_than_equal" }]),
    );
    await abrir();
    fireEvent.change(campoPrecio(), { target: { value: "8.50" } });
    await act(async () => fireEvent.click(screen.getByText("Guardar")));

    expect(errorPrecio()).toBe("Debe ser mayor o igual a 0.");
    expect(actualizarPrecio).toHaveBeenCalled();
  });
});
