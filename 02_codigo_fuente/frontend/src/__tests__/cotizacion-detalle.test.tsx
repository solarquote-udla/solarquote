/**
 * Descarga de la proforma en Word y Excel (RF-07), desde el detalle de
 * la cotización.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CotizacionDetallePage } from "@/pages/CotizacionDetallePage";

import { montar } from "./utilidades";

const { obtenerCotizacion, obtenerProformaWord, obtenerProformaExcel } = vi.hoisted(() => {
  const cotizacion = {
    id: 7,
    numero_proforma: "CT-130-2026",
    estado: "cotizada",
    cliente_id: null,
    cliente_nombre: "SolarAndes Instalaciones",
    cliente_empresa: "SolarAndes S.A.",
    cliente_email: "proyectos@solarandes.ec",
    cliente_telefono: "099 123 4567",
    proyecto_id: null,
    proyecto_nombre: "Planta El Carmen",
    addendum_porcentaje: "5.00",
    subtotal: "440.00",
    addendum_monto: "22.00",
    iva_porcentaje: "15.00",
    iva_monto: "69.30",
    total: "531.30",
    created_at: "2026-10-26T15:00:00Z",
    updated_at: "2026-10-26T15:00:00Z",
    items: [{ paneles_largo: 4, paneles_ancho: 3, bloques: 2 }],
    materiales: [
      {
        material_id: 1,
        codigo: "TORNILLO_M8",
        nombre: "Tornillo M8",
        unidad: "unidad",
        cantidad: 400,
        precio_unitario: "0.35",
      },
    ],
  };
  return {
    obtenerCotizacion: vi.fn(async () => cotizacion),
    obtenerProformaWord: vi.fn(async () => new Blob(["word"])),
    obtenerProformaExcel: vi.fn(async () => new Blob(["excel"])),
  };
});

vi.mock("@/services/cotizaciones", async () => {
  const real = await vi.importActual<typeof import("@/services/cotizaciones")>("@/services/cotizaciones");
  return { ...real, obtenerCotizacion, obtenerProformaWord, obtenerProformaExcel };
});

/** Lo que un clic en el enlace de descarga habría guardado. */
function espiarDescargas(): string[] {
  const nombres: string[] = [];
  URL.createObjectURL = vi.fn(() => "blob:simulado");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function () {
    nombres.push(this.download);
  };
  return nombres;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Descarga de la proforma (RF-07)", () => {
  it("descarga el Word con el nombre de la proforma", async () => {
    const descargas = espiarDescargas();
    montar(<CotizacionDetallePage />, "/cotizaciones/7", ["/cotizaciones/:cotizacionId"]);
    await screen.findByText("SolarAndes Instalaciones");

    fireEvent.click(screen.getByText("Descargar Word"));

    await waitFor(() => expect(obtenerProformaWord).toHaveBeenCalledWith(7));
    await waitFor(() => expect(descargas).toEqual(["Proforma CT-130-2026.docx"]));
  });

  it("descarga el Excel con el nombre de la proforma", async () => {
    const descargas = espiarDescargas();
    montar(<CotizacionDetallePage />, "/cotizaciones/7", ["/cotizaciones/:cotizacionId"]);
    await screen.findByText("SolarAndes Instalaciones");

    fireEvent.click(screen.getByText("Descargar Excel"));

    await waitFor(() => expect(obtenerProformaExcel).toHaveBeenCalledWith(7));
    await waitFor(() => expect(descargas).toEqual(["Proforma CT-130-2026.xlsx"]));
  });

  it("si la descarga falla, muestra el error sin ocultar el resto de la cotización", async () => {
    espiarDescargas();
    obtenerProformaWord.mockRejectedValueOnce(new Error("falló"));
    montar(<CotizacionDetallePage />, "/cotizaciones/7", ["/cotizaciones/:cotizacionId"]);
    await screen.findByText("SolarAndes Instalaciones");

    fireEvent.click(screen.getByText("Descargar Word"));

    await screen.findByText("No se pudo descargar la proforma");
    // El resto del detalle sigue visible: el error de descarga no reemplaza la página.
    expect(screen.getByText("SolarAndes Instalaciones")).toBeTruthy();
    expect(screen.getByText("Planta El Carmen")).toBeTruthy();
  });
});
