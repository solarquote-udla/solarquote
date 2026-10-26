import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CotizacionDetallePage } from "@/pages/CotizacionDetallePage";
import { HistorialPage } from "@/pages/HistorialPage";
import * as cotizaciones from "@/services/cotizaciones";
import * as validacion from "@/services/validacion";

import { PROYECTO, montar } from "./utilidades";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Gerente" },
    tienePermiso: () => true,
  }),
}));
vi.mock("@/services/proyectos", () => ({
  listarProyectos: vi.fn(async () => [PROYECTO]),
}));
vi.mock("@/services/validacion", () => ({
  obtenerValidacion: vi.fn(async () => ({
    linea_tiempo: [
      { estado: "cotizada", alcanzado: true, fecha: "2026-10-17T10:00:00Z", responsable: "Santiago" },
      { estado: "despachada", alcanzado: true, fecha: "2026-10-20T10:00:00Z", responsable: "Jorge Vela" },
      { estado: "recibida", alcanzado: false, fecha: null, responsable: null },
      { estado: "instalada", alcanzado: false, fecha: null, responsable: null },
    ],
  })),
}));
vi.mock("@/services/cotizaciones", () => ({
  listarCotizaciones: vi.fn(async () => ({
    resultados: [
      {
        id: 1,
        numero_proforma: null,
        estado: "cotizada",
        cliente_nombre: "Constructora Andina",
        cliente_empresa: null,
        proyecto_id: null,
        proyecto_nombre: null,
        total: "436.77",
        created_at: "2026-10-17T10:00:00Z",
      },
    ],
    total: 1,
    pagina: 1,
    por_pagina: 20,
    total_paginas: 1,
  })),
  obtenerCotizacion: vi.fn(async () => ({
    id: 1,
    numero_proforma: "SQ-0001",
    estado: "cotizada",
    cliente_id: null,
    cliente_nombre: "Constructora Andina",
    cliente_empresa: "Andina SAS",
    cliente_email: "contacto@andina.com",
    cliente_telefono: "0999999999",
    proyecto_id: null,
    proyecto_nombre: null,
    addendum_porcentaje: "0.00",
    subtotal: "379.80",
    addendum_monto: "0.00",
    iva_porcentaje: "15.00",
    iva_monto: "56.97",
    total: "436.77",
    created_at: "2026-10-17T10:00:00Z",
    updated_at: "2026-10-17T10:00:00Z",
    items: [{ paneles_largo: 4, paneles_ancho: 3, bloques: 1 }],
    materiales: [
      { material_id: 1, codigo: "VAR1650", nombre: "Varilla 1650mm", unidad: "unidad", cantidad: 8, precio_unitario: "7.20" },
    ],
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("HistorialPage", () => {
  it("muestra proyectos sin cotizar en la pestaña 'En curso' por defecto", async () => {
    montar(<HistorialPage />, "/historial", ["/historial"]);

    expect(await screen.findByText("San Pablo")).toBeTruthy();
    expect(screen.queryByText("Constructora Andina")).toBeNull();
  });

  it("la pestaña 'Cotizaciones' lista el historial de cotizaciones emitidas", async () => {
    montar(<HistorialPage />, "/historial", ["/historial"]);

    await act(async () => fireEvent.click(screen.getByText("Cotizaciones")));

    expect(await screen.findByText("Constructora Andina")).toBeTruthy();
    expect(screen.getByText("$436.77")).toBeTruthy();
  });

  it("buscar por cliente o proforma pasa el texto al servicio y queda en la URL", async () => {
    const { router } = montar(<HistorialPage />, "/historial", ["/historial"]);
    await act(async () => fireEvent.click(screen.getByText("Cotizaciones")));
    await screen.findByText("Constructora Andina");

    fireEvent.change(screen.getByPlaceholderText("Cliente o proforma"), { target: { value: "andina" } });

    await waitFor(() => {
      const llamadas = vi.mocked(cotizaciones.listarCotizaciones).mock.calls;
      expect(llamadas.at(-1)?.[0]).toMatchObject({ buscar: "andina", pagina: 1 });
    });
    // No se pierde al volver del detalle (botón atrás) ni al recargar.
    expect(router.state.location.search).toContain("buscar=andina");
  });

  it("muestra la columna Proforma, con guion si la cotización no tiene número", async () => {
    montar(<HistorialPage />, "/historial", ["/historial"]);
    await act(async () => fireEvent.click(screen.getByText("Cotizaciones")));

    const fila = (await screen.findByText("Constructora Andina")).closest("tr") as HTMLElement;
    const primeraCelda = fila.querySelector("td");
    expect(primeraCelda?.textContent).toBe("—");
  });

  it("cada fila enlaza al detalle de su cotización", async () => {
    montar(<HistorialPage />, "/historial", ["/historial"]);
    await act(async () => fireEvent.click(screen.getByText("Cotizaciones")));

    const fila = (await screen.findByText("Constructora Andina")).closest("tr") as HTMLElement;
    expect(within(fila).getByText("Ver detalle").closest("a")?.getAttribute("href")).toBe("/cotizaciones/1");
  });
});

describe("CotizacionDetallePage", () => {
  it("muestra el cliente, los ítems, los materiales y los totales", async () => {
    montar(<CotizacionDetallePage />, "/cotizaciones/1", ["/cotizaciones/:cotizacionId"]);

    expect(await screen.findByText("Constructora Andina")).toBeTruthy();
    expect(screen.getByText("Andina SAS")).toBeTruthy();
    expect(screen.getByText("Proforma SQ-0001")).toBeTruthy();
    expect(screen.getByText("VAR1650")).toBeTruthy();
    expect(screen.getByText("$436.77")).toBeTruthy();
    expect(vi.mocked(cotizaciones.obtenerCotizacion)).toHaveBeenCalledWith(1);
  });

  it("muestra la línea de tiempo de la propuesta con el enlace al seguimiento (RF-16)", async () => {
    montar(<CotizacionDetallePage />, "/cotizaciones/1", ["/cotizaciones/:cotizacionId"]);

    const linea = await screen.findByRole("list", { name: "Estado de la propuesta" });
    expect(within(linea).getByText("Jorge Vela")).toBeTruthy();
    expect(within(linea).getByText("siguiente")).toBeTruthy();
    expect(screen.getByText("Ver despacho y recepción").closest("a")?.getAttribute("href")).toBe(
      "/validacion/seguimiento/1",
    );
    expect(vi.mocked(validacion.obtenerValidacion)).toHaveBeenCalledWith(1);
  });
});
