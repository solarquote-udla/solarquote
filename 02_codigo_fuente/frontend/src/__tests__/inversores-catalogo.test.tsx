/**
 * Catálogo de inversores (RF-08): búsqueda por marca o modelo.
 * Origen: revisión de la tesis contra el sistema (RF-08 pide buscar y filtrar).
 */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InversoresPage } from "@/pages/InversoresPage";

import { montar } from "./utilidades";

vi.mock("@/services/inversores", () => ({
  listarInversores: vi.fn(async () => [
    { id: 1, marca: "Huawei", modelo: "SUN2000-150K", potencia_kw: 150, vmax_v: 1100, vmin_v: 200, mppts: 6, strings_por_mppt: 2, activo: true },
    { id: 2, marca: "SMA", modelo: "Sunny Tripower 110", potencia_kw: 110, vmax_v: 1000, vmin_v: 180, mppts: 4, strings_por_mppt: 2, activo: true },
  ]),
  crearInversor: vi.fn(),
  actualizarInversor: vi.fn(),
}));

afterEach(cleanup);

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
