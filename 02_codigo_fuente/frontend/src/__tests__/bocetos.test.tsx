/**
 * Cargar boceto (RF-04) y su confirmación (RF-05).
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CargarBocetoPage } from "@/pages/CargarBocetoPage";
import { ConfirmacionBocetoPage } from "@/pages/ConfirmacionBocetoPage";
import { HistorialPage } from "@/pages/HistorialPage";
import * as bocetos from "@/services/bocetos";
import * as proyectos from "@/services/proyectos";

import { montar, PROYECTO } from "./utilidades";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ usuario: { id: 1, nombre: "Gerente" }, tienePermiso: () => true }),
}));
vi.mock("@/services/proyectos", async () => {
  const { PROYECTO: P } = await import("./utilidades");
  return {
    obtenerProyecto: vi.fn(async () => P),
    crearProyecto: vi.fn(async () => ({ ...P, id: 7, tiene_terreno: false, tiene_equipo: false })),
    listarProyectos: vi.fn(async () => [P]),
  };
});
vi.mock("@/services/clientes", () => ({
  listarClientes: vi.fn(async () => [{ id: 9, nombre: "Cliente", activo: true }]),
}));
vi.mock("@/services/cotizaciones", () => ({ listarCotizaciones: vi.fn() }));
vi.mock("@/services/bocetos", async (original) => ({
  ...(await original<typeof import("@/services/bocetos")>()),
  obtenerBoceto: vi.fn(async () => null),
  cargarBoceto: vi.fn(),
  guardarBloquesBoceto: vi.fn(),
  confirmarYCotizarBoceto: vi.fn(),
  obtenerArchivoBoceto: vi.fn(async () => new Blob(["%PDF"])),
}));

const PANEL = { largo_mm: 2278, ancho_mm: 1134, potencia_wp: null, origen: "referencia" as const };

const bloque = (L: number, A: number, B: number, etiqueta: string, en_proporcion: boolean, confianza: number | null = 0.9) => ({
  etiqueta, paneles_largo: L, paneles_ancho: A, repeticiones: B, orientacion: "vertical" as const, confianza,
  paneles: L * A * B, proporcion: (A * 1.134) / (L * 2.278), en_proporcion,
});

const BOCETO = (cambios: Record<string, unknown> = {}) => ({
  proyecto_id: 5, nombre_archivo: "Planta San Pablo.pdf", formato: "pdf" as const, tamano_bytes: 2_400_000, metodo: "ia" as const,
  advertencias: ["Dos bloques del borde sur están tapados por un rótulo."],
  bloques: [bloque(4, 24, 30, "A", true), bloque(4, 10, 2, "B", false, 0.55)],
  total_paneles: 2960, potencia_kwp: null, panel: PANEL, tolerancia_proporcion: 0.2, ediciones_manuales: 0,
  created_at: "2026-10-19T10:00:00Z", updated_at: "2026-10-19T10:00:00Z",
  ...cambios,
});

const errorApi = (status: number, detail: string) =>
  new AxiosError(String(status), "ERR", undefined, undefined, {
    status, data: { detail }, statusText: "", headers: {}, config: { headers: new AxiosHeaders() },
  });

const archivo = (nombre: string, bytes = 100) => new File([new Uint8Array(bytes)], nombre);

function elegirArchivo(f: File) {
  fireEvent.change(screen.getByTestId("archivo-boceto"), { target: { files: [f] } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ─── Cargar boceto ──────────────────────────────────────────────────

async function abrirCarga() {
  montar(<CargarBocetoPage />, "/bocetos", ["/bocetos"]);
  await screen.findByText("¿QUÉ DETECTA LA IA?");
}

function completarDatos() {
  fireEvent.change(screen.getByPlaceholderText(/San Pablo de Lago/), { target: { value: "San Pablo" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "9" } });
}

const botonProcesar = () => screen.getByText("Procesar boceto") as HTMLButtonElement;

describe("Cargar boceto", () => {
  it("rechaza DWG y formatos no admitidos sin llamar al backend", async () => {
    await abrirCarga();
    elegirArchivo(archivo("plano.dwg"));
    expect(screen.getByRole("alert").textContent).toContain("Guardar como > DXF");
    elegirArchivo(archivo("foto.gif"));
    expect(screen.getByRole("alert").textContent).toContain("Formato no admitido");
    elegirArchivo(archivo("grande.pdf", 10 * 1024 * 1024 + 1));
    expect(screen.getByRole("alert").textContent).toContain("10 MB");
    completarDatos();
    expect(botonProcesar().disabled).toBe(true);
  });

  it("crea el proyecto, sube el archivo una sola vez y abre la confirmación", async () => {
    vi.mocked(bocetos.cargarBoceto).mockResolvedValue(BOCETO() as never);
    await abrirCarga();
    elegirArchivo(archivo("planta.pdf"));
    expect(botonProcesar().disabled).toBe(true);
    completarDatos();
    expect(botonProcesar().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(botonProcesar());
      fireEvent.click(botonProcesar());
    });

    expect(proyectos.crearProyecto).toHaveBeenCalledOnce();
    expect(proyectos.crearProyecto).toHaveBeenCalledWith(expect.objectContaining({ nombre: "San Pablo", cliente_id: 9 }));
    expect(bocetos.cargarBoceto).toHaveBeenCalledOnce();
    expect(vi.mocked(bocetos.cargarBoceto).mock.calls[0][0]).toBe(7);
    expect(await screen.findByText("CONFIRMACION BOCETO")).toBeTruthy();
  });

  it("si la lectura falla muestra el error y el reintento usa el mismo proyecto", async () => {
    vi.mocked(bocetos.cargarBoceto)
      .mockRejectedValueOnce(errorApi(503, "El análisis con IA no está configurado todavía."))
      .mockResolvedValueOnce(BOCETO() as never);
    await abrirCarga();
    elegirArchivo(archivo("planta.pdf"));
    completarDatos();

    await act(async () => fireEvent.click(botonProcesar()));
    expect(screen.getByRole("alert").textContent).toContain("no está configurado");

    await act(async () => fireEvent.click(botonProcesar()));
    expect(proyectos.crearProyecto).toHaveBeenCalledOnce();
    expect(bocetos.cargarBoceto).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("CONFIRMACION BOCETO")).toBeTruthy();
  });

  it("muestra el avance y se puede cancelar", async () => {
    vi.mocked(bocetos.cargarBoceto).mockImplementation(
      (_id, _archivo, opciones) =>
        new Promise((_ok, falla) => {
          opciones?.onSubido?.();
          opciones?.signal?.addEventListener("abort", () => falla(new Error("cancelado")));
        }),
    );
    await abrirCarga();
    elegirArchivo(archivo("planta.dxf"));
    completarDatos();
    await act(async () => fireEvent.click(botonProcesar()));

    expect(screen.getByText("PROCESANDO BOCETO")).toBeTruthy();
    expect(screen.getByText("Leyendo la geometría del DXF")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Cancelar")));

    expect(screen.getByRole("status").textContent).toContain("Se canceló");
    expect(screen.queryByText("PROCESANDO BOCETO")).toBeNull();
  });

  it("en un proyecto existente avisa que reemplaza el boceto anterior", async () => {
    vi.mocked(bocetos.obtenerBoceto).mockResolvedValue(BOCETO() as never);
    montar(<CargarBocetoPage />, "/bocetos/5", ["/bocetos/:proyectoId"]);
    expect(await screen.findByText(/Cargar otro lo reemplaza/)).toBeTruthy();
    expect((screen.getByDisplayValue("Cliente") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// ─── Confirmación del boceto ────────────────────────────────────────

async function abrirConfirmacion(cambios: Record<string, unknown> = {}) {
  vi.mocked(bocetos.obtenerBoceto).mockResolvedValue(BOCETO(cambios) as never);
  montar(<ConfirmacionBocetoPage />, "/bocetos/5/confirmacion", ["/bocetos/:proyectoId/confirmacion"]);
  await screen.findByText("DETALLE DE BLOQUES");
}

const botonConfirmar = () => screen.getByText("Confirmar y generar cotización") as HTMLButtonElement;
const campo = (nombre: string) => screen.getByLabelText(nombre) as HTMLInputElement;

describe("Confirmación del boceto", () => {
  it("muestra los tipos detectados, la confianza y los avisos de la lectura", async () => {
    await abrirConfirmacion();
    expect(campo("A del tipo A").value).toBe("24");
    expect(campo("B del tipo A").value).toBe("30");
    expect(screen.getByText("IA 55 %")).toBeTruthy();
    expect(screen.getByText("2.960")).toBeTruthy();
    expect(screen.getByText(/tapados por un rótulo/)).toBeTruthy();
    expect(screen.getByText("Revisar")).toBeTruthy();
  });

  it("valida las correcciones en vivo y exige guardarlas antes de confirmar", async () => {
    vi.mocked(bocetos.guardarBloquesBoceto).mockResolvedValue(
      BOCETO({ bloques: [bloque(4, 24, 30, "A", true), bloque(4, 24, 2, "B", true, null)], ediciones_manuales: 1 }) as never,
    );
    await abrirConfirmacion();

    fireEvent.change(campo("L del tipo B"), { target: { value: "3" } });
    expect(screen.getByText(/L debe ser par/)).toBeTruthy();
    expect(botonConfirmar().disabled).toBe(true);

    fireEvent.change(campo("L del tipo B"), { target: { value: "4" } });
    fireEvent.change(campo("A del tipo B"), { target: { value: "24" } });
    expect(screen.queryByText("Revisar")).toBeNull(); // 4 × 24 ya queda en proporción
    expect(screen.getByText("Guarda los cambios antes de confirmar.")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByText("Guardar cambios")));
    expect(bocetos.guardarBloquesBoceto).toHaveBeenCalledWith(5, [
      { etiqueta: "A", paneles_largo: 4, paneles_ancho: 24, repeticiones: 30, orientacion: "vertical" },
      { etiqueta: "B", paneles_largo: 4, paneles_ancho: 24, repeticiones: 2, orientacion: "vertical" },
    ]);
    expect(botonConfirmar().disabled).toBe(false);
  });

  it("con bloques fuera de proporción exige aceptarlos y confirma una sola vez", async () => {
    vi.mocked(bocetos.confirmarYCotizarBoceto).mockResolvedValue({ id: 42, numero_proforma: "CT-001-2026", total: "10.00" });
    await abrirConfirmacion();
    expect(botonConfirmar().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Acepto bajo mi responsabilidad los 2 bloques/));

    await act(async () => {
      fireEvent.click(botonConfirmar());
      fireEvent.click(botonConfirmar());
    });
    expect(bocetos.confirmarYCotizarBoceto).toHaveBeenCalledOnce();
    expect(bocetos.confirmarYCotizarBoceto).toHaveBeenCalledWith(5, { acepta_fuera_de_proporcion: true });
    expect(await screen.findByText("DETALLE COTIZACION")).toBeTruthy();
  });

  it("agregar y quitar tipos", async () => {
    await abrirConfirmacion();
    fireEvent.click(screen.getByText("+ Agregar tipo"));
    expect(screen.getAllByRole("row")).toHaveLength(4);
    // El tipo nuevo, sin nombre, toma la primera letra libre
    expect(campo("A del tipo C").value).toBe("24");
    fireEvent.click(screen.getByLabelText("Quitar el tipo C"));
    fireEvent.click(screen.getByLabelText("Quitar el tipo A"));
    fireEvent.click(screen.getByLabelText("Quitar el tipo B"));
    expect(screen.getByText("Agrega al menos un tipo de bloque.")).toBeTruthy();
  });

  it("un proyecto cotizado queda de solo lectura y enlaza a su cotización", async () => {
    vi.mocked(proyectos.obtenerProyecto).mockResolvedValueOnce({
      ...PROYECTO, estado: "cotizado", cotizacion_id: 42, numero_proforma: "CT-001-2026",
    } as never);
    await abrirConfirmacion();
    expect(screen.queryByText("Confirmar y generar cotización")).toBeNull();
    expect(screen.queryByText("Guardar cambios")).toBeNull();
    expect(campo("A del tipo A").disabled).toBe(true);
    fireEvent.click(screen.getByText("Ver cotización"));
    expect(await screen.findByText("DETALLE COTIZACION")).toBeTruthy();
  });

  it("sin boceto ofrece cargarlo", async () => {
    vi.mocked(bocetos.obtenerBoceto).mockResolvedValue(null);
    montar(<ConfirmacionBocetoPage />, "/bocetos/5/confirmacion", ["/bocetos/:proyectoId/confirmacion"]);
    fireEvent.click(await screen.findByText("Cargar boceto"));
    expect(await screen.findByText("CARGAR BOCETO")).toBeTruthy();
  });

  it("muestra el error del backend al confirmar", async () => {
    vi.mocked(bocetos.confirmarYCotizarBoceto).mockRejectedValue(errorApi(422, "Falta el precio vigente de VAR1650."));
    await abrirConfirmacion({ bloques: [bloque(4, 24, 30, "A", true)] });
    await act(async () => fireEvent.click(botonConfirmar()));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("VAR1650"));
  });
});

describe("Historial", () => {
  it("un proyecto con boceto se retoma en su confirmación", async () => {
    vi.mocked(proyectos.listarProyectos).mockResolvedValue([{ ...PROYECTO, tiene_boceto: true }] as never);
    montar(<HistorialPage />, "/historial", ["/historial"]);
    fireEvent.click(await screen.findByText("Abrir confirmación del boceto"));
    expect(await screen.findByText("CONFIRMACION BOCETO")).toBeTruthy();
  });
});
