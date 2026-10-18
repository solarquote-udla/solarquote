/**
 * Indicadores del Dashboard (RF-13): visibilidad por permiso, los
 * cuatro indicadores con datos, el selector de periodo, y que el
 * gráfico de barras sea accesible (role, aria-label, <title> por barra).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraficoBarras } from "@/components/graficos/GraficoBarras";
import { TableroIndicadores } from "@/components/TableroIndicadores";
import * as tableroServicio from "@/services/tablero";
import { hoyISO, primerDiaHaceMeses } from "@/utils/fechas";

let permisos: string[] = ["historial"];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Gerente" },
    tienePermiso: (...pedidos: string[]) => pedidos.some((p) => permisos.includes(p)),
  }),
}));

vi.mock("@/services/tablero", () => ({
  obtenerTablero: vi.fn(async () => ({
    cotizaciones_por_periodo: [
      { periodo: "2026-09", cantidad: 1, total: "100.00" },
      { periodo: "2026-10", cantidad: 2, total: "200.00" },
    ],
    cotizaciones_por_estado: [
      { estado: "cotizada", cantidad: 2 },
      { estado: "despachada", cantidad: 0 },
      { estado: "recibida", cantidad: 0 },
      { estado: "instalada", cantidad: 0 },
    ],
    clientes_frecuentes: [{ cliente_nombre: "Constructora Andina", cantidad: 2 }],
    materiales_mas_consumidos: [],
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  permisos = ["historial"];
});

describe("TableroIndicadores", () => {
  it("no se muestra sin permiso de historial ni de generar layout", () => {
    permisos = ["clientes"];
    render(<TableroIndicadores />);

    expect(screen.queryByText("Indicadores")).toBeNull();
    expect(tableroServicio.obtenerTablero).not.toHaveBeenCalled();
  });

  it("muestra los cuatro indicadores, y un aviso donde no hay datos", async () => {
    render(<TableroIndicadores />);

    expect(await screen.findByText("Indicadores")).toBeTruthy();
    expect(screen.getByText("Cotizaciones por periodo")).toBeTruthy();
    expect(screen.getByText("Distribución por estado")).toBeTruthy();
    expect(screen.getByText("Clientes más frecuentes")).toBeTruthy();
    expect(screen.getByText("Materiales de mayor consumo")).toBeTruthy();
    // materiales_mas_consumidos vino vacío del servicio simulado.
    expect(screen.getByText("Sin datos para este rango.")).toBeTruthy();
  });

  it("cambiar el periodo vuelve a pedir el tablero", async () => {
    render(<TableroIndicadores />);
    await screen.findByText("Indicadores");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 meses" })));

    await waitFor(() => {
      const llamadas = vi.mocked(tableroServicio.obtenerTablero).mock.calls;
      expect(llamadas.length).toBeGreaterThan(1);
      // Revisión propia: cubre primerDiaHaceMeses/hoyISO, no solo que se haya
      // vuelto a llamar — una regresión ahí (p. ej. usar UTC) no rompería nada más.
      const ultima = llamadas.at(-1)?.[0];
      expect(ultima?.desde).toBe(primerDiaHaceMeses(3));
      expect(ultima?.hasta).toBe(hoyISO());
    });
  });
});

describe("GraficoBarras", () => {
  it("tiene role=img, aria-label y un <title> por barra", () => {
    const { container } = render(
      <GraficoBarras
        descripcion="Gráfico de prueba"
        datos={[
          { etiqueta: "A", valor: 1 },
          { etiqueta: "B", valor: 2 },
        ]}
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Gráfico de prueba");
    expect(container.querySelectorAll("title")).toHaveLength(2);
  });

  it("muestra un aviso cuando no hay datos, en vez de un gráfico vacío", () => {
    const { container } = render(<GraficoBarras descripcion="Vacío" datos={[]} />);

    expect(screen.getByText("Sin datos para este rango.")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
