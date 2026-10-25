/**
 * Indicadores del Dashboard (RF-13): visibilidad por permiso, los
 * cuatro indicadores con datos, el selector de periodo, y que el
 * gráfico de barras sea accesible (role, aria-label, <title> por barra).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GraficoBarras } from "@/components/graficos/GraficoBarras";
import { TableroIndicadores } from "@/components/TableroIndicadores";
import * as tableroServicio from "@/services/tablero";
import type { Tablero } from "@/types/api";
import { hoyISO, primerDiaHaceMeses } from "@/utils/fechas";

let permisos: string[] = ["historial"];

// Los accesos directos usan <Link>: hace falta un router alrededor.
function renderTablero() {
  return render(
    <MemoryRouter>
      <TableroIndicadores />
    </MemoryRouter>,
  );
}

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Gerente" },
    tienePermiso: (...pedidos: string[]) => pedidos.some((p) => permisos.includes(p)),
  }),
}));

const TABLERO_CON_DATOS: Tablero = {
  resumen: { total_cotizaciones: 3, monto_total: "300.00", paneles_cotizados: 48, potencia_total_kwp: "14.40", bocetos_procesados: 2, lotes_despachados: 1, lotes_recibidos: 0 },
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
};

const TABLERO_VACIO: Tablero = {
  resumen: { total_cotizaciones: 0, monto_total: "0", paneles_cotizados: 0, potencia_total_kwp: "0", bocetos_procesados: 0, lotes_despachados: 0, lotes_recibidos: 0 },
  cotizaciones_por_periodo: [
    { periodo: "2026-09", cantidad: 0, total: "0" },
    { periodo: "2026-10", cantidad: 0, total: "0" },
  ],
  cotizaciones_por_estado: [
    { estado: "cotizada", cantidad: 0 },
    { estado: "despachada", cantidad: 0 },
    { estado: "recibida", cantidad: 0 },
    { estado: "instalada", cantidad: 0 },
  ],
  clientes_frecuentes: [],
  materiales_mas_consumidos: [],
};

vi.mock("@/services/tablero", () => ({
  obtenerTablero: vi.fn(async () => TABLERO_CON_DATOS),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  permisos = ["historial"];
});

describe("TableroIndicadores", () => {
  it("no se muestra sin permiso de historial ni de generar layout", () => {
    permisos = ["clientes"];
    renderTablero();

    expect(screen.queryByText("Indicadores")).toBeNull();
    expect(tableroServicio.obtenerTablero).not.toHaveBeenCalled();
  });

  it("muestra los cuatro indicadores, las tarjetas numéricas y un aviso donde no hay datos", async () => {
    renderTablero();

    expect(await screen.findByText("Indicadores")).toBeTruthy();
    expect(screen.getByText("Cotizaciones por periodo")).toBeTruthy();
    expect(screen.getByText("Distribución por estado")).toBeTruthy();
    expect(screen.getByText("Clientes más frecuentes")).toBeTruthy();
    expect(screen.getByText("Materiales de mayor consumo")).toBeTruthy();
    // Tarjetas del resumen (RF-13): cotizaciones, monto, paneles, potencia y tiempo ahorrado.
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("$300.00")).toBeTruthy();
    expect(screen.getByText("48")).toBeTruthy();
    expect(screen.getByText("14.4 kWp")).toBeTruthy();
    expect(screen.getByText("Bocetos procesados").parentElement?.textContent).toBe("Bocetos procesados2");
    // 3 cotizaciones × 35 min (45 manual − 10 con el sistema, acordado con Joseph) = 105 min.
    expect(screen.getByText("1 h 45 min")).toBeTruthy();
    // materiales_mas_consumidos vino vacío del servicio simulado.
    expect(screen.getByText("Sin datos para este rango.")).toBeTruthy();
  });

  it("sin cotizaciones en el rango, un solo aviso reemplaza los gráficos de periodo y estado", async () => {
    vi.mocked(tableroServicio.obtenerTablero).mockResolvedValueOnce(TABLERO_VACIO);
    renderTablero();

    await screen.findByText("Indicadores");

    expect(screen.getByText("No hay cotizaciones registradas en este rango")).toBeTruthy();
    expect(screen.queryByText("Cotizaciones por periodo")).toBeNull();
    expect(screen.queryByText("Distribución por estado")).toBeNull();
    // Clientes y materiales siguen mostrando su propio aviso, sin cambios.
    expect(screen.getByText("Clientes más frecuentes")).toBeTruthy();
  });

  it("los accesos directos respetan el permiso de cada módulo", async () => {
    permisos = ["historial", "clientes"];
    renderTablero();
    await screen.findByText("Indicadores");

    expect(screen.getByText("Historial →")).toBeTruthy();
    expect(screen.getByText("Clientes →")).toBeTruthy();
    expect(screen.queryByText("Generar layout solar →")).toBeNull();
  });

  it("cambiar el periodo vuelve a pedir el tablero", async () => {
    renderTablero();
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

  it("recorta las etiquetas largas en barras horizontales, pero el <title> queda completo", () => {
    const nombre = "Constructora Hormigones del Pacífico SAS";
    const { container } = render(
      <GraficoBarras
        descripcion="Clientes"
        orientacion="horizontal"
        datos={[{ etiqueta: nombre, valor: 1 }]}
      />,
    );

    const texto = container.querySelector("text");
    expect(texto?.textContent).not.toBe(nombre);
    expect(texto?.textContent?.endsWith("…")).toBe(true);
    expect(container.querySelector("title")?.textContent).toContain(nombre);
  });
});
