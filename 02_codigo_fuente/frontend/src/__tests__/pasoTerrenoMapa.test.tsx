/**
 * Paso 1 con el terreno dibujado sobre el mapa (Lenin, 16 de noviembre).
 * El mapa se simula (mapaFalso.tsx): sus botones hacen lo que harían los
 * clics sobre Leaflet.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerrenoPage } from "@/pages/TerrenoPage";
import * as proyectos from "@/services/proyectos";
import * as terreno from "@/services/terreno";

import { PUNTO_DEL_MAPA } from "./mapaFalso";
import { montar, PROYECTO, rect, TERRENO } from "./utilidades";

vi.mock("@/services/proyectos", () => ({ obtenerProyecto: vi.fn(), crearProyecto: vi.fn(), actualizarProyecto: vi.fn() }));
vi.mock("@/services/terreno", () => ({ obtenerTerreno: vi.fn(), crearTerreno: vi.fn(), actualizarTerreno: vi.fn() }));
vi.mock("@/components/MapaUbicacion", async () => ({ MapaUbicacion: (await import("./mapaFalso")).MapaFalso }));
vi.mock("@/services/geocodificacion", () => ({ buscarDireccion: vi.fn() }));
vi.mock("@/services/clientes", () => ({
  listarClientes: vi.fn().mockResolvedValue([{ id: 9, nombre: "Cliente", identificacion: "1", activo: true }]),
}));

const CON_UBICACION = { ...PROYECTO, latitud: PUNTO_DEL_MAPA.latitud, longitud: PUNTO_DEL_MAPA.longitud };

const listo = () => screen.findByText("MEDIDAS DEL TERRENO");
const boton = (texto: string | RegExp) => fireEvent.click(screen.getByRole("button", { name: texto }));
const valor = (etiqueta: RegExp) => (screen.getByLabelText(etiqueta) as HTMLInputElement).value;
const lados = () =>
  within(screen.getByRole("list", { name: "Medidas de los lados" }))
    .getAllByRole("textbox")
    .map((i) => (i as HTMLInputElement).value);
const existente = () => montar(<TerrenoPage />, "/generar/5/terreno", ["/generar/:proyectoId/terreno"]);
/** Con terreno, el paso abre en el plano. */
const verMapa = () => fireEvent.click(screen.getByRole("tab", { name: "Mapa" }));

beforeEach(() => {
  vi.mocked(proyectos.obtenerProyecto).mockResolvedValue(CON_UBICACION as never);
  vi.mocked(terreno.obtenerTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
  vi.mocked(terreno.actualizarTerreno).mockResolvedValue(TERRENO(rect(100, 60)) as never);
  vi.mocked(proyectos.actualizarProyecto).mockResolvedValue(CON_UBICACION as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Paso 1: terreno sobre el mapa", () => {
  it("proyecto nuevo: dibuja el rectángulo, ajusta a 90°, fija la ubicación y el norte", async () => {
    montar(<TerrenoPage />, "/generar", ["/generar"]);
    await listo();

    boton("Dibujar terreno en el mapa");
    expect(screen.getByTestId("dibujando-mapa").textContent).toBe("si");
    // No se cambia de pestaña a medio dibujo
    expect((screen.getByRole("tab", { name: "Plano" }) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 4; i++) boton("CLIC DIBUJO");
    boton("Cerrar contorno");

    // Sin ubicación previa, la primera esquina pasó a ser el punto
    expect(screen.getByTestId("marcador").textContent).toBe(`${PUNTO_DEL_MAPA.latitud},${PUNTO_DEL_MAPA.longitud}`);
    expect(screen.getByTestId("contorno-mapa").textContent).toBe("4");
    // La tercera esquina estaba a 89°: quedó en 90° y el rectángulo cierra exacto
    expect(screen.getByTestId("lados-mapa").textContent).toBe("100 m | 60 m | 100 m | 60 m");
    expect(screen.queryByLabelText(/^Ancho \(m\)/)).toBeNull();
    expect(lados()).toEqual(["100", "60", "100", "60"]);
    expect(screen.getAllByText("90°")).toHaveLength(4);
    // En el mapa el norte no se pregunta; en el plano queda en 0°, arriba
    expect(screen.queryByText("¿Hacia dónde apunta el norte en tu plano?")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Plano" }));
    expect(valor(/^Grados/)).toBe("0");
    expect(screen.getByTestId("norte-plano").dataset.grados).toBe("0");
  });

  it("sin ajuste a 90° el punto queda donde se marcó", async () => {
    montar(<TerrenoPage />, "/generar", ["/generar"]);
    await listo();

    fireEvent.click(screen.getByLabelText("Ajustar a 90°"));
    boton("Dibujar terreno en el mapa");
    for (let i = 0; i < 4; i++) boton("CLIC DIBUJO");
    boton("Cerrar contorno");

    expect(lados()[1]).toBe("60.02");
  });

  it("cancelar el dibujo no cambia el terreno", async () => {
    existente();
    await listo();
    verMapa();
    boton("Redibujar terreno en el mapa");
    boton("CLIC DIBUJO");
    boton("Cancelar dibujo");

    expect(screen.getByTestId("dibujando-mapa").textContent).toBe("no");
    expect(screen.getByTestId("lados-mapa").textContent).toBe("100 m | 60 m | 100 m | 60 m");
  });

  it("cambiar el largo de un lado estira el terreno y se guarda", async () => {
    existente();
    await listo();
    expect(lados()).toEqual(["100", "60", "100", "60"]);

    const lado1 = screen.getByLabelText("Largo del lado 1 (m)");
    fireEvent.change(lado1, { target: { value: "120,5" } });
    fireEvent.blur(lado1);

    expect(lados()).toEqual(["120.5", "60", "120.5", "60"]);
    verMapa();
    expect(screen.getByTestId("lados-mapa").textContent).toBe("120,5 m | 60 m | 120,5 m | 60 m");

    await act(async () => fireEvent.click(screen.getByText(/Siguiente/)));
    expect(vi.mocked(terreno.actualizarTerreno).mock.calls[0][1].vertices).toEqual([
      [0, 0],
      [120.5, 0],
      [120.5, 60],
      [0, 60],
    ]);
  });

  it("un largo inválido vuelve al anterior sin tocar el terreno", async () => {
    existente();
    await listo();
    const lado2 = screen.getByLabelText("Largo del lado 2 (m)");
    fireEvent.change(lado2, { target: { value: "-3" } });
    expect(lado2.className).toMatch(/border-red-500/);
    fireEvent.blur(lado2);

    expect(lados()).toEqual(["100", "60", "100", "60"]);
  });

  it("mover, agregar en la mitad y quitar vértices desde el mapa", async () => {
    existente();
    await listo();
    verMapa();

    boton("MOVER VERTICE 2");
    expect(lados()[0]).toBe("120");

    boton("MITAD LADO 1");
    expect(screen.getByTestId("contorno-mapa").textContent).toBe("5");
    expect(lados()).toHaveLength(5);

    boton("QUITAR VERTICE 1");
    expect(screen.getByTestId("contorno-mapa").textContent).toBe("4");
  });
});
