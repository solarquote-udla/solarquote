/**
 * Validación de materiales: despacho en planta (RF-14), recepción en
 * terreno (RF-15) y seguimiento de la propuesta (RF-16).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DespachoPage } from "@/pages/DespachoPage";
import { RecepcionPage } from "@/pages/RecepcionPage";
import { SeguimientoPage } from "@/pages/SeguimientoPage";
import * as servicio from "@/services/validacion";
import type { Validacion } from "@/types/api";

import { montar } from "./utilidades";

const permisos = vi.hoisted(() => ({ lista: ["despacho", "recepcion", "historial"] }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Operario" },
    tienePermiso: (...pedidos: string[]) => pedidos.some((p) => permisos.lista.includes(p)),
  }),
}));
vi.mock("@/services/validacion", async (original) => ({
  ...(await original<typeof import("@/services/validacion")>()),
  listarPorDespachar: vi.fn(async () => [
    {
      cotizacion_id: 1,
      numero_proforma: "CT-024-2026",
      cliente_nombre: "Hacienda San Pablo",
      proyecto_nombre: "San Pablo",
      estado: "cotizada",
      created_at: "2026-10-20T10:00:00Z",
      fecha_despacho: null,
    },
  ]),
  listarPorRecibir: vi.fn(async () => [
    {
      cotizacion_id: 1,
      numero_proforma: "CT-024-2026",
      cliente_nombre: "Hacienda San Pablo",
      proyecto_nombre: "San Pablo",
      estado: "despachada",
      created_at: "2026-10-20T10:00:00Z",
      fecha_despacho: "2026-10-22T10:00:00Z",
    },
  ]),
  obtenerValidacion: vi.fn(),
  contarVarillas: vi.fn(),
  confirmarDespacho: vi.fn(),
  confirmarRecepcion: vi.fn(),
  marcarInstalada: vi.fn(),
  obtenerFoto: vi.fn(async () => new Blob(["png"])),
}));

const MATERIALES = [
  { material_id: 10, codigo: "VAR1650", nombre: "Varilla 1650 mm", unidad: "u", cantidad: 352 },
  { material_id: 11, codigo: "VAR1350", nombre: "Varilla 1350 mm", unidad: "u", cantidad: 374 },
  { material_id: 12, codigo: "LOG", nombre: "Logística", unidad: "servicio", cantidad: 1 },
];

const etapas = (alcanzadas: number) =>
  (["cotizada", "despachada", "recibida", "instalada"] as const).map((estado, i) => ({
    estado,
    alcanzado: i < alcanzadas,
    fecha: i < alcanzadas ? `2026-10-2${i}T10:00:00Z` : null,
    responsable: i < alcanzadas ? ["Santiago", "Jorge Vela", "Ing. Pérez", "Santiago"][i] : null,
  }));

const DESPACHO = {
  fabricado_por: "Carlos Pozo",
  soldado_por: "Luis Andrade",
  contado_por: "María Tapia",
  despachado_por: "Jorge Vela",
  destino: "San Pablo",
  justificacion: "Dos varillas con fallas",
  registrado_por: "Operario",
  created_at: "2026-10-21T10:00:00Z",
  items: [
    {
      material_id: 10,
      codigo: "VAR1650",
      nombre: "Varilla 1650 mm",
      cantidad_cotizada: 352,
      cantidad_despachada: 350,
      conteo_ia: 348,
      diferencia: -2,
    },
    {
      material_id: 11,
      codigo: "VAR1350",
      nombre: "Varilla 1350 mm",
      cantidad_cotizada: 374,
      cantidad_despachada: 374,
      conteo_ia: null,
      diferencia: 0,
    },
    {
      material_id: 12,
      codigo: "LOG",
      nombre: "Logística",
      cantidad_cotizada: 1,
      cantidad_despachada: 1,
      conteo_ia: null,
      diferencia: 0,
    },
  ],
  fotos: [{ id: 5, nombre_archivo: "lote.jpg", material_id: 10, conteo_ia: 348 }],
  con_diferencias: true,
};

const RECEPCION = {
  recibido_por: "Ing. Pérez",
  observaciones: "Reposición en el próximo despacho.",
  registrado_por: "Operario",
  created_at: "2026-10-22T10:00:00Z",
  fotos: [],
  revisados: 2,
  diferencias: 1,
  pendientes: 1,
  items: [
    {
      material_id: 10,
      codigo: "VAR1650",
      nombre: "Varilla 1650 mm",
      cantidad_esperada: 350,
      cantidad_recibida: 342,
      estado: "diferencia" as const,
      observacion: "8 dobladas",
      diferencia: -8,
    },
    {
      material_id: 11,
      codigo: "VAR1350",
      nombre: "Varilla 1350 mm",
      cantidad_esperada: 374,
      cantidad_recibida: 374,
      estado: "ok" as const,
      observacion: null,
      diferencia: 0,
    },
    {
      material_id: 12,
      codigo: "LOG",
      nombre: "Logística",
      cantidad_esperada: 1,
      cantidad_recibida: null,
      estado: "pendiente" as const,
      observacion: null,
      diferencia: null,
    },
  ],
};

const VALIDACION = (cambios: Partial<Validacion> = {}): Validacion => ({
  cotizacion_id: 1,
  numero_proforma: "CT-024-2026",
  cliente_nombre: "Hacienda San Pablo",
  cliente_empresa: null,
  proyecto_nombre: "San Pablo",
  estado: "cotizada",
  created_at: "2026-10-20T10:00:00Z",
  materiales: MATERIALES,
  despacho: null,
  recepcion: null,
  linea_tiempo: etapas(1),
  ...cambios,
});

const errorApi = (status: number, detail: string) =>
  new AxiosError(String(status), "ERR", undefined, undefined, {
    status,
    data: { detail },
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  permisos.lista = ["despacho", "recepcion", "historial"];
});

// ─── Despacho (RF-14) ───────────────────────────────────────────────

async function abrirDespacho(v = VALIDACION()) {
  vi.mocked(servicio.obtenerValidacion).mockResolvedValue(v);
  const montado = montar(<DespachoPage />, "/validacion/despacho/1", [
    "/validacion/despacho",
    "/validacion/despacho/:cotizacionId",
  ]);
  await screen.findByText("MATERIALES DEL LOTE");
  return montado;
}

const despachada = (codigo: string) => screen.getByLabelText(`Despachada ${codigo}`) as HTMLInputElement;
const botonDespachar = () => screen.getByText("Confirmar despacho") as HTMLButtonElement;

function completarTrazabilidad() {
  const nombres = screen.getAllByPlaceholderText("Nombre y apellido");
  ["Carlos Pozo", "Luis Andrade", "María Tapia", "Jorge Vela"].forEach((n, i) =>
    fireEvent.change(nombres[i], { target: { value: n } }),
  );
}

describe("Despacho en planta", () => {
  it("lista las cotizaciones por despachar y carga el lote con lo cotizado", async () => {
    await abrirDespacho();
    expect(screen.getAllByText("Hacienda San Pablo").length).toBeGreaterThan(0);
    expect(despachada("VAR1650").value).toBe("352");
    expect(despachada("LOG").value).toBe("1");
    // El destino se propone con el proyecto
    expect((screen.getByPlaceholderText("Proyecto o dirección de entrega") as HTMLInputElement).value).toBe(
      "San Pablo",
    );
    expect(botonDespachar().disabled).toBe(true);
    completarTrazabilidad();
    expect(botonDespachar().disabled).toBe(false);
  });

  it("una cantidad distinta a la cotizada exige justificación", async () => {
    await abrirDespacho();
    completarTrazabilidad();
    fireEvent.change(despachada("VAR1650"), { target: { value: "350" } });
    expect(botonDespachar().disabled).toBe(true);
    expect(screen.getByText(/escribe la justificación/)).toBeTruthy();
    expect(screen.getByText(/1 material difiere de lo cotizado: VAR1650/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Por qué sale una cantidad distinta/), {
      target: { value: "Dos con fallas" },
    });
    expect(botonDespachar().disabled).toBe(false);

    fireEvent.change(despachada("VAR1650"), { target: { value: "-3" } });
    expect(botonDespachar().disabled).toBe(true);
  });

  it("el conteo de la IA llena la cantidad despachada del material de la foto", async () => {
    vi.mocked(servicio.contarVarillas)
      .mockResolvedValueOnce({ cantidad: 200, confianza: 0.9, advertencias: [] })
      .mockResolvedValueOnce({ cantidad: 148, confianza: 0.6, advertencias: ["Esquina en sombra."] });
    await abrirDespacho();

    const foto = (nombre: string) => new File([new Uint8Array(10)], nombre, { type: "image/jpeg" });
    await act(async () =>
      fireEvent.change(screen.getByTestId("foto-lote"), { target: { files: [foto("lote-1.jpg")] } }),
    );
    await waitFor(() => expect(despachada("VAR1650").value).toBe("200"));
    await act(async () =>
      fireEvent.change(screen.getByTestId("foto-lote"), { target: { files: [foto("lote-2.jpg")] } }),
    );
    await waitFor(() => expect(despachada("VAR1650").value).toBe("348"));

    expect(screen.getByText("Esquina en sombra.")).toBeTruthy();
    expect(screen.getByText(/IA: 148 varillas · confianza 60 %/)).toBeTruthy();
    expect(vi.mocked(servicio.contarVarillas)).toHaveBeenCalledWith(1, expect.any(File));
    // 348 ≠ 352: la diferencia pide justificación
    completarTrazabilidad();
    expect(botonDespachar().disabled).toBe(true);
  });

  it("si la IA no está disponible la foto queda como evidencia y la cantidad no cambia", async () => {
    vi.mocked(servicio.contarVarillas).mockRejectedValue(errorApi(503, "El conteo con IA no está configurado."));
    await abrirDespacho();
    await act(async () =>
      fireEvent.change(screen.getByTestId("foto-lote"), {
        target: { files: [new File([new Uint8Array(10)], "lote.png")] },
      }),
    );
    expect(await screen.findByText(/no está configurado\. La foto queda como evidencia/)).toBeTruthy();
    expect(despachada("VAR1650").value).toBe("352");
  });

  it("rechaza archivos que no son fotos sin llamar a la IA", async () => {
    await abrirDespacho();
    fireEvent.change(screen.getByTestId("foto-lote"), { target: { files: [new File(["%PDF"], "lote.pdf")] } });
    expect(screen.getByRole("alert").textContent).toContain("JPG o PNG");
    expect(servicio.contarVarillas).not.toHaveBeenCalled();
  });

  it("confirma una sola vez con cantidades, trazabilidad y fotos, y abre el seguimiento", async () => {
    vi.mocked(servicio.contarVarillas).mockResolvedValue({ cantidad: 352, confianza: 0.9, advertencias: [] });
    vi.mocked(servicio.confirmarDespacho).mockResolvedValue(VALIDACION({ estado: "despachada" }));
    await abrirDespacho();
    const archivo = new File([new Uint8Array(10)], "lote.jpg");
    await act(async () => fireEvent.change(screen.getByTestId("foto-lote"), { target: { files: [archivo] } }));
    await waitFor(() => expect(screen.getByText(/IA: 352 varillas/)).toBeTruthy());
    completarTrazabilidad();

    await act(async () => {
      fireEvent.click(botonDespachar());
      fireEvent.click(botonDespachar());
    });

    expect(servicio.confirmarDespacho).toHaveBeenCalledOnce();
    const [id, datos, fotos] = vi.mocked(servicio.confirmarDespacho).mock.calls[0];
    expect(id).toBe(1);
    expect(datos).toMatchObject({
      fabricado_por: "Carlos Pozo",
      despachado_por: "Jorge Vela",
      destino: "San Pablo",
      justificacion: null,
    });
    expect(datos.items).toEqual([
      { material_id: 10, cantidad_despachada: 352, conteo_ia: 352 },
      { material_id: 11, cantidad_despachada: 374, conteo_ia: null },
      { material_id: 12, cantidad_despachada: 1, conteo_ia: null },
    ]);
    expect(datos.fotos).toEqual([{ material_id: 10, conteo_ia: 352 }]);
    expect(fotos).toEqual([archivo]);
    expect(await screen.findByText("SEGUIMIENTO")).toBeTruthy();
  });

  it("muestra el error del servidor y permite reintentar", async () => {
    vi.mocked(servicio.confirmarDespacho).mockRejectedValue(errorApi(409, "La propuesta ya está despachada."));
    await abrirDespacho();
    completarTrazabilidad();
    await act(async () => fireEvent.click(botonDespachar()));
    expect(screen.getByRole("alert").textContent).toContain("ya está despachada");
    expect(botonDespachar().disabled).toBe(false);
  });

  it("un lote ya despachado enlaza a su reporte en lugar del formulario", async () => {
    vi.mocked(servicio.obtenerValidacion).mockResolvedValue(VALIDACION({ estado: "despachada", despacho: DESPACHO }));
    montar(<DespachoPage />, "/validacion/despacho/1", ["/validacion/despacho/:cotizacionId"]);
    expect((await screen.findByText("Ver el reporte de despacho")).closest("a")?.getAttribute("href")).toBe(
      "/validacion/seguimiento/1",
    );
    expect(screen.queryByText("Confirmar despacho")).toBeNull();
  });
});

// ─── Recepción (RF-15) ──────────────────────────────────────────────

async function abrirRecepcion() {
  vi.mocked(servicio.obtenerValidacion).mockResolvedValue(
    VALIDACION({ estado: "despachada", despacho: DESPACHO, linea_tiempo: etapas(2) }),
  );
  montar(<RecepcionPage />, "/validacion/recepcion/1", ["/validacion/recepcion/:cotizacionId"]);
  await screen.findByText("Checklist de materiales");
}

const fila = (codigo: string) => screen.getByTestId(`fila-${codigo}`);
const botonRecibir = () => screen.getByText("Generar reporte de recepción") as HTMLButtonElement;

describe("Recepción en terreno", () => {
  it("espera lo despachado, no lo cotizado, y cuenta revisados y diferencias", async () => {
    await abrirRecepcion();
    expect(within(fila("VAR1650")).getByText("350")).toBeTruthy();
    expect(screen.getByText("0/3")).toBeTruthy();

    fireEvent.click(within(fila("VAR1350")).getByText("OK"));
    fireEvent.click(within(fila("VAR1650")).getByText("Diferencia"));
    expect(screen.getByText("2/3")).toBeTruthy();
    const diferencias = screen.getByText("Diferencias").parentElement as HTMLElement;
    expect(within(diferencias).getByText("1")).toBeTruthy();
  });

  it("una diferencia exige la cantidad recibida y la observación", async () => {
    await abrirRecepcion();
    fireEvent.change(screen.getByPlaceholderText(/Instalador u operario/), { target: { value: "Ing. Pérez" } });
    expect(botonRecibir().disabled).toBe(false);

    fireEvent.click(within(fila("VAR1650")).getByText("Diferencia"));
    expect(botonRecibir().disabled).toBe(true);
    expect(within(fila("VAR1650")).getByText("Indica cuántas llegaron.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Recibidas VAR1650"), { target: { value: "350" } });
    expect(within(fila("VAR1650")).getByText(/márcalo como OK/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Recibidas VAR1650"), { target: { value: "342" } });
    expect(within(fila("VAR1650")).getByText("-8")).toBeTruthy();
    expect(within(fila("VAR1650")).getByText("Explica la diferencia.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Observación VAR1650"), { target: { value: "8 dobladas" } });
    expect(botonRecibir().disabled).toBe(false);
  });

  it("confirma el checklist una sola vez y abre el seguimiento", async () => {
    vi.mocked(servicio.confirmarRecepcion).mockResolvedValue(VALIDACION({ estado: "recibida" }));
    await abrirRecepcion();
    fireEvent.change(screen.getByPlaceholderText(/Instalador u operario/), { target: { value: "Ing. Pérez" } });
    fireEvent.click(within(fila("VAR1350")).getByText("OK"));
    fireEvent.click(within(fila("VAR1650")).getByText("Diferencia"));
    fireEvent.change(screen.getByLabelText("Recibidas VAR1650"), { target: { value: "342" } });
    fireEvent.change(screen.getByLabelText("Observación VAR1650"), { target: { value: "8 dobladas" } });

    await act(async () => {
      fireEvent.click(botonRecibir());
      fireEvent.click(botonRecibir());
    });

    expect(servicio.confirmarRecepcion).toHaveBeenCalledOnce();
    const [, datos, fotos] = vi.mocked(servicio.confirmarRecepcion).mock.calls[0];
    expect(datos).toEqual({
      recibido_por: "Ing. Pérez",
      observaciones: null,
      items: [
        { material_id: 10, estado: "diferencia", cantidad_recibida: 342, observacion: "8 dobladas" },
        { material_id: 11, estado: "ok", cantidad_recibida: null, observacion: null },
        { material_id: 12, estado: "pendiente", cantidad_recibida: null, observacion: null },
      ],
    });
    expect(fotos).toEqual([]);
    expect(await screen.findByText("SEGUIMIENTO")).toBeTruthy();
  });

  it("Limpiar vuelve todo el checklist a pendiente", async () => {
    await abrirRecepcion();
    fireEvent.click(within(fila("VAR1350")).getByText("OK"));
    fireEvent.click(screen.getByText("Limpiar"));
    expect(screen.getByText("0/3")).toBeTruthy();
  });
});

// ─── Seguimiento (RF-16) ────────────────────────────────────────────

async function abrirSeguimiento(v: Validacion) {
  vi.mocked(servicio.obtenerValidacion).mockResolvedValue(v);
  montar(<SeguimientoPage />, "/validacion/seguimiento/1", ["/validacion/seguimiento/:cotizacionId"]);
  await screen.findByText("ESTADO DE LA PROPUESTA");
}

describe("Seguimiento de la propuesta", () => {
  it("muestra la línea de tiempo y los reportes de despacho y recepción", async () => {
    await abrirSeguimiento(
      VALIDACION({ estado: "recibida", despacho: DESPACHO, recepcion: RECEPCION, linea_tiempo: etapas(3) }),
    );
    const linea = screen.getByRole("list", { name: "Estado de la propuesta" });
    expect(within(linea).getByText("Ing. Pérez")).toBeTruthy();
    expect(within(linea).getByText("siguiente")).toBeTruthy();

    expect(screen.getByText("Reporte de despacho")).toBeTruthy();
    expect(screen.getByText("Dos varillas con fallas")).toBeTruthy();
    expect(screen.getByText("Reporte de recepción")).toBeTruthy();
    expect(screen.getByText("8 dobladas")).toBeTruthy();
    expect(screen.getByText(/2 de 3 materiales revisados · 1 con diferencia · 1 pendientes/)).toBeTruthy();
    await waitFor(() => expect(servicio.obtenerFoto).toHaveBeenCalledWith(1, 5));
  });

  it("marca la propuesta recibida como instalada tras confirmar", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(servicio.marcarInstalada).mockResolvedValue(
      VALIDACION({ estado: "instalada", despacho: DESPACHO, recepcion: RECEPCION, linea_tiempo: etapas(4) }),
    );
    await abrirSeguimiento(
      VALIDACION({ estado: "recibida", despacho: DESPACHO, recepcion: RECEPCION, linea_tiempo: etapas(3) }),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Marcar como instalada"));
      fireEvent.click(screen.getByText(/Marcar como instalada|Registrando/));
    });

    expect(servicio.marcarInstalada).toHaveBeenCalledOnce();
    expect(await screen.findAllByText("Instalada")).toBeTruthy();
    expect(screen.queryByText("Marcar como instalada")).toBeNull();
  });

  it("sin el permiso no ofrece marcarla como instalada", async () => {
    permisos.lista = ["despacho"];
    await abrirSeguimiento(
      VALIDACION({ estado: "recibida", despacho: DESPACHO, recepcion: RECEPCION, linea_tiempo: etapas(3) }),
    );
    expect(screen.queryByText("Marcar como instalada")).toBeNull();
  });

  it("sin despacho ofrece registrarlo a quien puede despachar", async () => {
    await abrirSeguimiento(VALIDACION());
    expect(screen.getByText("Registrar el despacho").closest("a")?.getAttribute("href")).toBe("/validacion/despacho/1");
  });
});
