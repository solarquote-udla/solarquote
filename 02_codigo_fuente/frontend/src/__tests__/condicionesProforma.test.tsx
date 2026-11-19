/**
 * Condiciones de la proforma por cotización (acuerdo con Santi del 17 de
 * noviembre): reglas del formulario, formulario en la confirmación del
 * Paso 3 y condiciones en el detalle del historial.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CondicionesCotizacion } from "@/components/CondicionesCotizacion";
import { ConfirmacionPage } from "@/pages/ConfirmacionPage";
import * as condiciones from "@/services/condiciones";
import * as layout from "@/services/layout";
import type { CotizacionDetalle } from "@/types/api";
import {
  aCondiciones,
  desdeDefecto,
  erroresCondiciones,
  sumaPagos,
  type FormularioCondiciones,
} from "@/utils/condiciones";

import { montar, rect, TERRENO } from "./utilidades";

vi.mock("@/services/condiciones", () => ({ obtenerCondicionesPorDefecto: vi.fn() }));
vi.mock("@/services/proyectos", async () => {
  const { PROYECTO: P } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => P) };
});
vi.mock("@/services/equipo", () => ({ obtenerEquipo: vi.fn(async () => null) }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn() }));
vi.mock("@/services/layout", () => ({ obtenerLayout: vi.fn(), confirmarYCotizar: vi.fn() }));

const DEFECTO = {
  plazo_dias: 20,
  validez_dias: 90,
  garantia_anios: 10,
  pagos: [
    { nombre: "Anticipo", porcentaje: "30.00" },
    { nombre: "Entrega", porcentaje: "40.00" },
    { nombre: "A 60 días de la entrega", porcentaje: "30.00" },
  ],
};

const formulario = (cambios: Partial<FormularioCondiciones> = {}): FormularioCondiciones => ({
  ...desdeDefecto(DEFECTO),
  ...cambios,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("reglas del formulario de condiciones", () => {
  it("los valores de la configuración son válidos y se mandan como números", () => {
    const f = formulario();
    expect(f.pagos.map((t) => t.porcentaje)).toEqual(["30", "40", "30"]);
    expect(erroresCondiciones(f)).toEqual({});
    expect(aCondiciones(f)).toEqual({
      plazo_dias: 20,
      validez_dias: 90,
      garantia_anios: 10,
      pagos: [
        { nombre: "Anticipo", porcentaje: 30 },
        { nombre: "Entrega", porcentaje: 40 },
        { nombre: "A 60 días de la entrega", porcentaje: 30 },
      ],
    });
  });

  it("plazo, validez y garantía son enteros mayores que cero", () => {
    const errores = erroresCondiciones(formulario({ plazo: "", validez: "2.5", garantia: "0" }));
    expect(errores.plazo).toBe("Ingresa el plazo en días.");
    expect(errores.validez).toBe("Debe ser un número entero mayor que cero.");
    expect(errores.garantia).toBe("Debe ser un número entero mayor que cero.");
  });

  it("cada tramo necesita etapa y un porcentaje de 0 a 100 con hasta dos decimales", () => {
    const errores = erroresCondiciones(
      formulario({
        pagos: [
          { nombre: "", porcentaje: "50" },
          { nombre: "Entrega", porcentaje: "0" },
          { nombre: "Saldo", porcentaje: "33.333" },
        ],
      }),
    );
    expect(errores["pagos.0.nombre"]).toBe("Escribe la etapa.");
    expect(errores["pagos.1.porcentaje"]).toBe("Entre 0 y 100.");
    expect(errores["pagos.2.porcentaje"]).toBe("Hasta dos decimales.");
  });

  it("los tramos deben sumar 100, también con decimales y coma", () => {
    expect(erroresCondiciones(formulario({ pagos: [{ nombre: "Anticipo", porcentaje: "40" }, { nombre: "Entrega", porcentaje: "50" }] })).pagos).toBe(
      "Los porcentajes deben sumar 100 (ahora suman 90).",
    );
    const tercios = formulario({
      pagos: [
        { nombre: "A", porcentaje: "33,33" },
        { nombre: "B", porcentaje: "33.33" },
        { nombre: "C", porcentaje: "33.34" },
      ],
    });
    expect(sumaPagos(tercios)).toBe(100);
    expect(erroresCondiciones(tercios)).toEqual({});
  });
});

describe("Confirmación del Paso 3 con las condiciones", () => {
  const LAYOUT = {
    proyecto_id: 5,
    parametros: { tolerancia_proporcion: 0.2 },
    bloques: [],
    tipos: [{ tipo: "A", paneles_largo: 4, paneles_ancho: 12, repeticiones: 2, paneles: 96, proporcion: 3, en_proporcion: true }],
    total_paneles: 96,
    potencia_kwp: 62.4,
    inversores: [],
    desactualizado: false,
  };

  beforeEach(async () => {
    const terreno = await import("@/services/terreno");
    vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
    vi.mocked(layout.obtenerLayout).mockResolvedValue(LAYOUT as never);
    vi.mocked(layout.confirmarYCotizar).mockResolvedValue({ id: 12, numero_proforma: "CT-1-2026", total: "1.00" } as never);
  });

  async function abrir() {
    montar(<ConfirmacionPage />, "/generar/5/confirmacion", ["/generar/:proyectoId/confirmacion"]);
    return screen.findByRole("region", { name: "Condiciones de la proforma" });
  }
  const confirmar = () => screen.getByText("Confirmar y generar cotización") as HTMLButtonElement;
  const tramos = (seccion: HTMLElement) =>
    within(within(seccion).getByRole("list", { name: "Tramos de pago" }))
      .getAllByRole("listitem")
      .map((li) => Array.from(li.querySelectorAll("input")).map((i) => i.value));

  it("parte de la configuración, aplica la forma de pago 40 / 60 y la manda al confirmar", async () => {
    vi.mocked(condiciones.obtenerCondicionesPorDefecto).mockResolvedValue(DEFECTO);
    const seccion = await abrir();
    expect((within(seccion).getByLabelText(/^Plazo/) as HTMLInputElement).value).toBe("20");
    expect(tramos(seccion)).toHaveLength(3);

    fireEvent.click(within(seccion).getByRole("button", { name: "40 / 60" }));
    fireEvent.change(within(seccion).getByLabelText(/^Validez/), { target: { value: "2" } });
    expect(tramos(seccion)).toEqual([
      ["Anticipo", "40"],
      ["Entrega total", "60"],
    ]);
    expect(screen.getByTestId("suma-pagos").textContent).toBe("Suma: 100 %");

    await act(async () => fireEvent.click(confirmar()));
    expect(layout.confirmarYCotizar).toHaveBeenCalledWith(5, {
      acepta_fuera_de_proporcion: false,
      condiciones: {
        plazo_dias: 20,
        validez_dias: 2,
        garantia_anios: 10,
        pagos: [
          { nombre: "Anticipo", porcentaje: 40 },
          { nombre: "Entrega total", porcentaje: 60 },
        ],
      },
    });
  });

  it("si los tramos no suman 100 no deja confirmar y lo dice", async () => {
    vi.mocked(condiciones.obtenerCondicionesPorDefecto).mockResolvedValue(DEFECTO);
    const seccion = await abrir();

    fireEvent.click(within(seccion).getByRole("button", { name: "Quitar el tramo 3" }));
    expect(within(seccion).getByText("Los porcentajes deben sumar 100 (ahora suman 70).")).toBeTruthy();
    expect(confirmar().disabled).toBe(true);
    expect(screen.getByText("Revisa las condiciones de la proforma.")).toBeTruthy();

    fireEvent.click(within(seccion).getByRole("button", { name: "+ Agregar tramo" }));
    const nuevo = within(seccion).getAllByRole("listitem")[2];
    const [etapa, porcentaje] = Array.from(nuevo.querySelectorAll("input"));
    fireEvent.change(etapa, { target: { value: "Saldo" } });
    fireEvent.change(porcentaje, { target: { value: "30" } });
    expect(confirmar().disabled).toBe(false);
  });

  it("si no se cargan las condiciones, confirma con las de la configuración", async () => {
    vi.mocked(condiciones.obtenerCondicionesPorDefecto).mockRejectedValue(new Error("red"));
    montar(<ConfirmacionPage />, "/generar/5/confirmacion", ["/generar/:proyectoId/confirmacion"]);
    expect(await screen.findByText(/se usarán las de la configuración/)).toBeTruthy();

    await act(async () => fireEvent.click(confirmar()));
    await waitFor(() =>
      expect(layout.confirmarYCotizar).toHaveBeenCalledWith(5, { acepta_fuera_de_proporcion: false, condiciones: undefined }),
    );
  });
});

describe("Condiciones en el detalle de la cotización", () => {
  const COTIZACION = {
    subtotal: "34639.35",
    plazo_dias: 25,
    validez_dias: 2,
    garantia_anios: 10,
    precio_wp: "0.0390",
    pagos: [
      { nombre: "Anticipo", porcentaje: "40.00" },
      { nombre: "Entrega total", porcentaje: "60.00" },
    ],
  } as unknown as CotizacionDetalle;

  it("muestra plazo, validez, garantía, precio por Wp y los pagos sin IVA (CT519)", () => {
    render(<CondicionesCotizacion cotizacion={COTIZACION} />);

    expect(screen.getByText("25 días")).toBeTruthy();
    expect(screen.getByText("2 días")).toBeTruthy();
    expect(screen.getByText("10 años")).toBeTruthy();
    expect(screen.getByText("$ 0,0390 USD/Wp")).toBeTruthy();
    expect(screen.getByText("$13,855.74")).toBeTruthy();
    expect(screen.getByText("$20,783.61")).toBeTruthy();
    expect(screen.getByText("$34,639.35")).toBeTruthy();
  });

  it("una cotización anterior a las condiciones lo explica", () => {
    render(
      <CondicionesCotizacion
        cotizacion={{ ...COTIZACION, plazo_dias: null, validez_dias: null, garantia_anios: null, precio_wp: null, pagos: [] }}
      />,
    );
    expect(screen.getByText(/Emitida antes de que las condiciones/)).toBeTruthy();
  });
});
