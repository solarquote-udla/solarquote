/**
 * Dashboard (revisión del 16 de noviembre): accesos según el perfil,
 * proyectos recientes con enlace para retomarlos y sin los bloques
 * "Estado del sistema" ni "Próximos módulos".
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InicioPage } from "@/pages/InicioPage";
import * as proyectosServicio from "@/services/proyectos";
import type { Proyecto } from "@/types/api";

import { montar, PROYECTO } from "./utilidades";

let permisos: string[] = [];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Santiago Guagalango" },
    tienePermiso: (...pedidos: string[]) => pedidos.some((p) => permisos.includes(p)),
  }),
}));

vi.mock("@/components/TableroIndicadores", () => ({ TableroIndicadores: () => <p>INDICADORES</p> }));

vi.mock("@/services/proyectos", () => ({ listarProyectos: vi.fn() }));

const proyecto = (id: number, nombre: string, dia: number, cambios: Partial<Proyecto> = {}): Proyecto =>
  ({
    ...PROYECTO,
    id,
    nombre,
    updated_at: `2026-11-${String(dia).padStart(2, "0")}T10:00:00Z`,
    ...cambios,
  }) as Proyecto;

function abrir() {
  return montar(<InicioPage />, "/", ["/"]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  permisos = [];
});

describe("Dashboard", () => {
  it("ya no muestra Estado del sistema ni Próximos módulos", async () => {
    permisos = ["generar_layout", "historial"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([]);
    abrir();

    expect(await screen.findByText(/Todavía no hay proyectos/)).toBeTruthy();
    expect(screen.queryByText("Estado del sistema")).toBeNull();
    expect(screen.queryByText("Próximos módulos")).toBeNull();
    expect(screen.getByText("INDICADORES")).toBeTruthy();
  });

  it("los accesos grandes dependen del perfil", async () => {
    permisos = ["despacho"];
    abrir();

    const accesos = screen.getByRole("navigation", { name: "Accesos rápidos" });
    const titulos = within(accesos)
      .getAllByRole("link")
      .map((a) => a.querySelector("p")?.textContent);
    expect(titulos).toEqual(["Despacho en planta"]);
    // Producción no ve proyectos: ni se piden
    expect(screen.queryByRole("region", { name: "Proyectos recientes" })).toBeNull();
    expect(proyectosServicio.listarProyectos).not.toHaveBeenCalled();
  });

  it("Nuevo proyecto es la acción principal, resaltada aunque no se pase el mouse", async () => {
    permisos = ["generar_layout", "cargar_boceto", "historial", "clientes"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([]);
    abrir();

    const accesos = screen.getByRole("navigation", { name: "Accesos rápidos" });
    const nuevoProyecto = within(accesos).getByRole("link", { name: /Nuevo proyecto/ });
    const historial = within(accesos).getByRole("link", { name: /Historial/ });

    expect(nuevoProyecto.className).toMatch(/bg-solar-500/);
    expect(historial.className).not.toMatch(/bg-solar-500/);
  });

  it("el gerente ve todos los accesos de cálculo y clientes", async () => {
    permisos = ["generar_layout", "cargar_boceto", "historial", "clientes"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([]);
    abrir();

    const accesos = screen.getByRole("navigation", { name: "Accesos rápidos" });
    for (const titulo of ["Nuevo proyecto", "Cargar boceto", "Historial", "Clientes"]) {
      expect(within(accesos).getByText(titulo)).toBeTruthy();
    }
    expect(within(accesos).queryByText("Despacho en planta")).toBeNull();
    await screen.findByText(/Todavía no hay proyectos/);
  });

  it("muestra los 6 proyectos más recientes, del más nuevo al más viejo", async () => {
    permisos = ["generar_layout"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => proyecto(n, `Proyecto ${n}`, n)),
    );
    abrir();

    const lista = await screen.findByRole("region", { name: "Proyectos recientes" });
    await within(lista).findByText("Proyecto 8");
    const nombres = within(lista)
      .getAllByRole("listitem")
      .map((li) => li.querySelector("a, span")?.textContent);
    expect(nombres).toEqual(["Proyecto 8", "Proyecto 7", "Proyecto 6", "Proyecto 5", "Proyecto 4", "Proyecto 3"]);
  });

  it("el nombre del proyecto lleva al paso en que quedó", async () => {
    permisos = ["generar_layout"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([
      proyecto(5, "San Pablo", 10, { tiene_terreno: true, tiene_equipo: false }),
    ]);
    abrir();

    expect(await screen.findByText("Continuar en Panel + Inversor")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "San Pablo" }));
    expect(await screen.findByText("PASO 2")).toBeTruthy();
  });

  it("un boceto se abre en su confirmación y uno cotizado en su cotización", async () => {
    permisos = ["generar_layout", "cargar_boceto"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([
      proyecto(7, "Boceto Envasur", 12, { tiene_boceto: true }),
      proyecto(8, "Cotizado", 11, { estado: "cotizado", cotizacion_id: 3 } as Partial<Proyecto>),
    ]);
    abrir();

    expect((await screen.findByRole("link", { name: "Boceto Envasur" })).getAttribute("href")).toBe(
      "/bocetos/7/confirmacion",
    );
    expect(screen.getByRole("link", { name: "Cotizado" }).getAttribute("href")).toBe("/cotizaciones/3");
  });

  it("sin permiso para abrirlo, el proyecto se lista sin enlace", async () => {
    permisos = ["historial"];
    vi.mocked(proyectosServicio.listarProyectos).mockResolvedValue([proyecto(5, "San Pablo", 10)]);
    abrir();

    const lista = await screen.findByRole("region", { name: "Proyectos recientes" });
    expect(await within(lista).findByText("San Pablo")).toBeTruthy();
    expect(within(lista).queryByRole("link", { name: "San Pablo" })).toBeNull();
  });

  it("si falla la carga lo dice", async () => {
    permisos = ["generar_layout"];
    vi.mocked(proyectosServicio.listarProyectos).mockRejectedValue(new Error("red"));
    abrir();

    expect(await screen.findByText("No se pudieron cargar los proyectos.")).toBeTruthy();
  });
});
