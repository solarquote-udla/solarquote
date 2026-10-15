/**
 * El candado contra doble envío es por acción (y por fila): repite la
 * misma acción -> se ignora; acciones distintas -> siguen en paralelo.
 * Revisión del PR #36: un candado único por pantalla bloqueaba en silencio
 * reactivar al cliente B mientras se daba de baja al A.
 */
import { act, cleanup, fireEvent, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAccionUnica } from "@/hooks/useAccionUnica";
import { ClientesPage } from "@/pages/ClientesPage";
import { LayoutPage } from "@/pages/LayoutPage";
import { UsuariosPage } from "@/pages/UsuariosPage";
import * as clientes from "@/services/clientes";
import * as layout from "@/services/layout";
import * as seguridad from "@/services/seguridad";
import * as terreno from "@/services/terreno";

import { montar, TERRENO } from "./utilidades";

const GG = { id: 1, nombre: "Gerente General", es_sistema: true, acceso_total: true };
const PP = { id: 2, nombre: "Personal de Producción", es_sistema: true, acceso_total: false };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ usuario: { id: 1, nombre: "Admin", perfil: { id: 1, nombre: "Gerente General", es_sistema: true, acceso_total: true }, permisos: [] } }),
}));
vi.mock("@/services/clientes", () => ({
  buscarClientes: vi.fn(async () => [
    { id: 1, nombre: "Cliente A", tipo_identificacion: "ruc", identificacion: "1710034065001", empresa: null, email: null, telefono: null, direccion: null, activo: true, total_proyectos: 0 },
    { id: 2, nombre: "Cliente B", tipo_identificacion: "ruc", identificacion: "1710034065002", empresa: null, email: null, telefono: null, direccion: null, activo: false, total_proyectos: 0 },
  ]),
  darDeBajaCliente: vi.fn(),
  reactivarCliente: vi.fn(async () => ({})),
}));
vi.mock("@/services/seguridad", () => ({
  listarPerfiles: vi.fn(async () => [
    { id: 1, nombre: "Gerente General", es_sistema: true, acceso_total: true, descripcion: null, permisos: [], total_usuarios: 1 },
    { id: 2, nombre: "Personal de Producción", es_sistema: true, acceso_total: false, descripcion: null, permisos: ["despacho"], total_usuarios: 2 },
  ]),
  listarUsuarios: vi.fn(async () => [
    { id: 1, nombre: "Admin", email: "a@x.com", perfil: GG, activo: true, debe_cambiar_password: false, ultimo_acceso: null, created_at: "", estado: "activo", bloqueado: false },
    { id: 2, nombre: "Operario A", email: "oa@x.com", perfil: PP, activo: true, debe_cambiar_password: false, ultimo_acceso: null, created_at: "", estado: "activo", bloqueado: false },
    { id: 3, nombre: "Operario B", email: "ob@x.com", perfil: PP, activo: true, debe_cambiar_password: false, ultimo_acceso: null, created_at: "", estado: "activo", bloqueado: false },
  ]),
  restablecerPassword: vi.fn(),
  actualizarUsuario: vi.fn(async () => ({})),
}));
vi.mock("@/services/proyectos", async () => {
  const { PROYECTO } = await import("./utilidades");
  return { obtenerProyecto: vi.fn(async () => PROYECTO), actualizarProyecto: vi.fn() };
});
vi.mock("@/services/equipo", () => ({
  obtenerEquipo: vi.fn(async () => ({ proyecto_id: 5 })),
  guardarEquipo: vi.fn(),
  listarPanelesReferencia: vi.fn(async () => []),
}));
vi.mock("@/services/layout", () => ({ obtenerLayout: vi.fn(async () => null), generarLayout: vi.fn(), guardarBloques: vi.fn() }));
vi.mock("@/services/terreno", async () => {
  const { TERRENO: T } = await import("./utilidades");
  return {
    obtenerTerreno: vi.fn(async () => T([[0, 0], [100, 0], [100, 60], [0, 60]])),
    agregarCamino: vi.fn(async () => ({})),
    eliminarCamino: vi.fn(),
  };
});

/** Promesa que queda pendiente hasta que la prueba la resuelva. */
const pendiente = () => new Promise<never>(() => undefined);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("useAccionUnica", () => {
  it("ignora la misma clave mientras está en curso, deja pasar otras y la libera al terminar, aun con error", async () => {
    const { result } = renderHook(() => useAccionUnica());
    const unaVez = result.current;
    let terminarA: () => void = () => undefined;
    const a = vi
      .fn<() => Promise<void>>(async () => undefined)
      .mockImplementationOnce(() => new Promise<void>((r) => (terminarA = r)));
    const b = vi.fn(async () => undefined);

    const primera = unaVez("a", a);
    void unaVez("a", a); // repetida: se ignora
    await unaVez("b", b); // otra clave: corre en paralelo
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();

    terminarA();
    await primera;
    await unaVez("a", a); // liberada
    expect(a).toHaveBeenCalledTimes(2);

    await expect(unaVez("c", async () => Promise.reject(new Error("falla")))).rejects.toThrow("falla");
    await unaVez("c", b); // un error también libera la clave
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe("Acciones de filas distintas no se bloquean entre sí", () => {
  it("Clientes: reactivar a B mientras se da de baja a A", async () => {
    vi.mocked(clientes.darDeBajaCliente).mockImplementation(pendiente);
    montar(<ClientesPage />, "/clientes", ["/clientes"]);
    const filaA = (await screen.findByText("Cliente A")).closest("tr")!;
    fireEvent.click(within(filaA).getByText("Dar de baja"));
    await act(async () => fireEvent.click(within(filaA).getAllByText("Dar de baja").at(-1)!));
    const filaB = screen.getByText("Cliente B").closest("tr")!;
    await act(async () => fireEvent.click(within(filaB).getByText("Reactivar")));
    expect(clientes.darDeBajaCliente).toHaveBeenCalledOnce();
    expect(clientes.reactivarCliente).toHaveBeenCalledOnce();
  });

  it("Usuarios: desactivar a B mientras se restablece la contraseña de A", async () => {
    vi.mocked(seguridad.restablecerPassword).mockImplementation(pendiente);
    montar(<UsuariosPage />, "/seguridad/usuarios", ["/seguridad/usuarios"]);
    const filaA = (await screen.findByText("Operario A")).closest("tr")!;
    fireEvent.click(within(filaA).getByText("Restablecer contraseña"));
    await act(async () => fireEvent.click(within(filaA).getByText("Restablecer")));
    const filaB = screen.getByText("Operario B").closest("tr")!;
    await act(async () => fireEvent.click(within(filaB).getByText("Desactivar")));
    expect(seguridad.restablecerPassword).toHaveBeenCalledOnce();
    expect(seguridad.actualizarUsuario).toHaveBeenCalledWith(3, { activo: false });
  });

  it("Layout: agregar un camino mientras se genera el layout", async () => {
    vi.mocked(layout.generarLayout).mockImplementation(pendiente);
    montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
    await screen.findByText("+ Agregar");
    await act(async () => fireEvent.click(screen.getByText("Generar layout")));
    fireEvent.click(screen.getByText("+ Agregar"));
    await act(async () => fireEvent.click(screen.getByText("Agregar camino")));
    expect(layout.generarLayout).toHaveBeenCalledOnce();
    expect(terreno.agregarCamino).toHaveBeenCalledOnce();
  });
});

describe("Geometría vacía", () => {
  it("un terreno o camino sin vértices no rompe la pantalla del layout", async () => {
    vi.mocked(terreno.obtenerTerreno).mockResolvedValueOnce(
      TERRENO([], [{ id: 9, nombre: "Camino X", tipo: "acceso", vertices: [] }]) as never,
    );
    montar(<LayoutPage />, "/generar/5/layout", ["/generar/:proyectoId/layout"]);
    expect(await screen.findByText(/Sin geometría/)).toBeTruthy();
    fireEvent.click(screen.getByText("+ Agregar"));
    await act(async () => fireEvent.click(screen.getByText("Agregar camino")));
    expect(screen.getByText(/Define primero el contorno/)).toBeTruthy();
    expect(terreno.agregarCamino).not.toHaveBeenCalled();
  });
});

describe("Reemplazos dentro de la misma pantalla", () => {
  it("Clientes: editar otro cliente con el formulario a medio llenar pregunta", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(clientes.buscarClientes).mockResolvedValueOnce([
      { id: 1, nombre: "Cliente A", tipo_identificacion: "ruc", identificacion: "1710034065001", empresa: null, email: null, telefono: null, direccion: null, activo: true, total_proyectos: 0 },
      { id: 3, nombre: "Cliente C", tipo_identificacion: "ruc", identificacion: "1710034065001", empresa: null, email: null, telefono: null, direccion: null, activo: true, total_proyectos: 0 },
    ] as never);
    montar(<ClientesPage />, "/clientes", ["/clientes"]);
    const filaA = (await screen.findByText("Cliente A")).closest("tr")!;
    fireEvent.click(within(filaA).getByText("Editar"));
    fireEvent.change(screen.getByDisplayValue("Cliente A"), { target: { value: "Cliente A editado" } });
    const filaC = screen.getByText("Cliente C").closest("tr")!;
    fireEvent.click(within(filaC).getByText("Editar"));
    expect(confirmar).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue("Cliente A editado")).toBeTruthy();
  });

  it("Usuarios: restablecer a otro usuario sin haber copiado la contraseña anterior pregunta", async () => {
    vi.mocked(seguridad.restablecerPassword).mockResolvedValue({} as never);
    montar(<UsuariosPage />, "/seguridad/usuarios", ["/seguridad/usuarios"]);
    const filaA = (await screen.findByText("Operario A")).closest("tr")!;
    fireEvent.click(within(filaA).getByText("Restablecer contraseña"));
    await act(async () => fireEvent.click(within(filaA).getByText("Restablecer")));
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    const filaB = screen.getByText("Operario B").closest("tr")!;
    fireEvent.click(within(filaB).getByText("Restablecer contraseña"));
    expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/Operario A no se copió/));
    // Se canceló: la contraseña de A sigue en pantalla y no se abre el restablecimiento de B
    expect(screen.getByText(/Nueva contraseña temporal de/)).toBeTruthy();
    expect(within(filaB).queryByText("Restablecer")).toBeNull();
    fireEvent.click(screen.getByText("Ocultar"));
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Nueva contraseña temporal de/)).toBeTruthy();
  });
});
