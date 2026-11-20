/**
 * Planta del proyecto en el detalle de la cotización (pedido de Santi, 17
 * de noviembre): plano de solo lectura con los bloques, aviso si cambió
 * después de cotizar y mensajes cuando no hay planta.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlantaCotizacion } from "@/components/PlantaCotizacion";
import * as servicio from "@/services/planta";
import type { PlantaCotizacion as Planta } from "@/services/planta";

import { rect, TERRENO } from "./utilidades";

let permisos: string[] = ["generar_layout", "historial"];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Gerente" },
    tienePermiso: (...pedidos: string[]) => pedidos.some((p) => permisos.includes(p)),
  }),
}));
vi.mock("@/services/planta", () => ({ obtenerPlanta: vi.fn() }));

const bloque = (x: number) => ({
  vertices: [[x, 0], [x + 9, 0], [x + 9, 14], [x, 14]],
  paneles_largo: 4,
  paneles_ancho: 12,
  paneles: 48,
  proporcion: 3,
  en_proporcion: true,
  tipo: "4 × 12",
  inversor: 0,
});

const PLANTA: Planta = {
  cotizacion_id: 7,
  proyecto_id: 5,
  terreno: TERRENO(rect(100, 60)) as never,
  layout: {
    bloques: [bloque(0), bloque(12)],
    inversores: [{}],
    total_paneles: 96,
    potencia_kwp: 62.4,
  } as never,
  cambio_despues_de_cotizar: false,
};

function abrir(planta: Planta | Error) {
  if (planta instanceof Error) vi.mocked(servicio.obtenerPlanta).mockRejectedValue(planta);
  else vi.mocked(servicio.obtenerPlanta).mockResolvedValue(planta);
  return render(
    <MemoryRouter>
      <PlantaCotizacion cotizacionId={7} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  permisos = ["generar_layout", "historial"];
});

describe("Planta del proyecto en el historial", () => {
  it("dibuja el terreno y los bloques con sus paneles, de solo lectura", async () => {
    const { container } = abrir(PLANTA);

    expect(await screen.findByText("96 (62,4 kWp)")).toBeTruthy();
    expect(servicio.obtenerPlanta).toHaveBeenCalledWith(7);
    expect(container.querySelectorAll('[data-testid="paneles-bloque"]')).toHaveLength(2);
    expect(screen.getByText("Bloques").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByRole("link", { name: "Abrir en el Paso 3" }).getAttribute("href")).toBe("/generar/5/layout");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sin permiso de generar layout no ofrece abrir el Paso 3", async () => {
    permisos = ["historial"];
    abrir(PLANTA);

    await screen.findByText("96 (62,4 kWp)");
    expect(screen.queryByRole("link", { name: "Abrir en el Paso 3" })).toBeNull();
  });

  it("avisa si el plano cambió después de cotizar", async () => {
    abrir({ ...PLANTA, cambio_despues_de_cotizar: true });

    expect((await screen.findByRole("status")).textContent).toMatch(/se modificaron después de emitir/);
  });

  it("proyecto con terreno pero sin layout", async () => {
    abrir({ ...PLANTA, layout: null });

    expect(await screen.findByText("El proyecto todavía no tiene layout generado.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Abrir en el Paso 3" })).toBeNull();
  });

  it("cotización de un boceto o sin proyecto: lo explica", async () => {
    abrir({ ...PLANTA, terreno: null, layout: null });
    expect(await screen.findByText(/se cotizó desde un boceto/)).toBeTruthy();
    cleanup();

    abrir({ ...PLANTA, proyecto_id: null, terreno: null, layout: null });
    expect(await screen.findByText(/no está asociada a un proyecto/)).toBeTruthy();
  });

  it("si falla, el resto del detalle sigue", async () => {
    abrir(new Error("red"));

    expect(await screen.findByText("No se pudo cargar la planta del proyecto.")).toBeTruthy();
  });
});
