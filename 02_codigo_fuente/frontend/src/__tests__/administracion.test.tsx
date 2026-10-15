import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { ClientesPage } from "@/pages/ClientesPage";
import { PerfilesPage } from "@/pages/PerfilesPage";
import { UsuarioFormPage } from "@/pages/UsuarioFormPage";
import { UsuariosPage } from "@/pages/UsuariosPage";
import * as clientes from "@/services/clientes";
import * as seguridad from "@/services/seguridad";

import { montar } from "./utilidades";

const TODOS = ["generar_layout", "cargar_boceto", "historial", "despacho", "recepcion", "clientes", "inversores", "materiales", "precios", "perfiles", "usuarios"];
const GG = { id: 1, nombre: "Gerente General", es_sistema: true, acceso_total: true };
const PP = { id: 2, nombre: "Personal de Producción", es_sistema: true, acceso_total: false };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Admin", email: "a@x.com", perfil: GG, permisos: TODOS, activo: true },
    refrescarSesion: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/services/clientes", () => ({
  buscarClientes: vi.fn(async () => []),
  crearCliente: vi.fn(),
  actualizarCliente: vi.fn(),
  darDeBajaCliente: vi.fn(),
  reactivarCliente: vi.fn(),
}));
vi.mock("@/services/seguridad", () => ({
  listarPermisos: vi.fn(async () => [
    { codigo: "clientes", nombre: "Clientes", grupo: "OPERACIONES", descripcion: "" },
    { codigo: "despacho", nombre: "Despacho en planta", grupo: "OPERACIONES", descripcion: "" },
  ]),
  listarPerfiles: vi.fn(async () => [
    { ...GG, descripcion: null, permisos: TODOS, total_usuarios: 1 },
    { ...PP, descripcion: null, permisos: ["despacho"], total_usuarios: 1 },
  ]),
  crearPerfil: vi.fn(),
  actualizarPerfil: vi.fn(),
  eliminarPerfil: vi.fn(),
  listarUsuarios: vi.fn(async () => [
    { id: 1, nombre: "Admin", email: "a@x.com", perfil: GG, activo: true, debe_cambiar_password: false, ultimo_acceso: null, created_at: "", estado: "activo", bloqueado: false },
    { id: 2, nombre: "Operario", email: "o@x.com", perfil: PP, activo: true, debe_cambiar_password: false, ultimo_acceso: null, created_at: "", estado: "activo", bloqueado: false },
  ]),
  obtenerUsuario: vi.fn(),
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  restablecerPassword: vi.fn(async () => ({})),
}));

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function salirPorMenu() {
  await act(async () => fireEvent.click(screen.getByText("MENU HISTORIAL")));
}

describe("Clientes", () => {
  const pagina = () => montar(<ClientesPage />, "/clientes", ["/clientes"]);

  it("formulario con datos escritos: salir pregunta; cancelar el formulario deja de contar", async () => {
    pagina();
    fireEvent.click(await screen.findByText("Nuevo cliente"));
    expect(hayCambiosPendientes()).toBe(false);
    fireEvent.change(screen.getByLabelText(/Nombre o razón social/), { target: { value: "Solar SA" } });
    expect(hayCambiosPendientes()).toBe(true);
    await salirPorMenu();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(hayCambiosPendientes()).toBe(false);
  });

  it("doble clic en Registrar crea el cliente una sola vez", async () => {
    vi.mocked(clientes.crearCliente).mockResolvedValue({ id: 3, nombre: "Solar SA" } as never);
    pagina();
    fireEvent.click(await screen.findByText("Nuevo cliente"));
    fireEvent.change(screen.getByLabelText(/Nombre o razón social/), { target: { value: "Solar SA" } });
    fireEvent.change(screen.getByLabelText(/^Identificación/), { target: { value: "1710034065001" } });
    const registrar = screen.getByText("Registrar cliente");
    await act(async () => {
      fireEvent.click(registrar);
      fireEvent.click(registrar);
    });
    expect(clientes.crearCliente).toHaveBeenCalledOnce();
  });
});

describe("Perfiles", () => {
  const pagina = () => montar(<PerfilesPage />, "/seguridad/perfiles", ["/seguridad/perfiles"]);

  it("perfil nuevo sin tocar no cuenta; con nombre escrito, salir pregunta", async () => {
    pagina();
    fireEvent.click(await screen.findByText("+ Nuevo perfil"));
    expect(hayCambiosPendientes()).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Ej. Ventas"), { target: { value: "Ventas" } });
    await salirPorMenu();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });

  it("perfil nuevo con nombre escrito: cambiar a otro perfil también pregunta", async () => {
    pagina();
    fireEvent.click(await screen.findByText("+ Nuevo perfil"));
    fireEvent.change(screen.getByPlaceholderText("Ej. Ventas"), { target: { value: "Ventas" } });
    fireEvent.click(screen.getByText("Personal de Producción"));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect((screen.getByPlaceholderText("Ej. Ventas") as HTMLInputElement).value).toBe("Ventas");
  });

  it("permiso cambiado en un perfil existente: salir pregunta", async () => {
    pagina();
    fireEvent.click(await screen.findByText("Personal de Producción"));
    fireEvent.click(screen.getByRole("switch", { name: "Clientes" }));
    expect(hayCambiosPendientes()).toBe(true);
    await salirPorMenu();
    expect(window.confirm).toHaveBeenCalledOnce();
  });
});

describe("Nuevo usuario", () => {
  const pagina = () => montar(<UsuarioFormPage />, "/seguridad/usuarios/nuevo", ["/seguridad/usuarios/nuevo"]);

  it("con datos escritos, salir pregunta", async () => {
    pagina();
    const nombre = await screen.findByLabelText(/Nombre completo/);
    expect(hayCambiosPendientes()).toBe(false);
    fireEvent.change(nombre, { target: { value: "Ana" } });
    await salirPorMenu();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });

  it("crear con doble clic envía una vez y vuelve a la lista sin preguntar", async () => {
    vi.mocked(seguridad.crearUsuario).mockResolvedValue({ id: 3, nombre: "Ana Pérez" } as never);
    pagina();
    fireEvent.change(await screen.findByLabelText(/Nombre completo/), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByLabelText(/Correo institucional/), { target: { value: "ana@x.com" } });
    fireEvent.change(screen.getByLabelText(/Contraseña temporal/), { target: { value: "Temporal1" } });
    fireEvent.click(screen.getByLabelText(/Personal de Producción/));
    const crear = screen.getByText("Crear usuario");
    await act(async () => {
      fireEvent.click(crear);
      fireEvent.click(crear);
    });
    expect(await screen.findByText("LISTA USUARIOS")).toBeTruthy();
    expect(seguridad.crearUsuario).toHaveBeenCalledOnce();
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe("Usuarios: contraseña temporal", () => {
  const pagina = () => montar(<UsuariosPage />, "/seguridad/usuarios", ["/seguridad/usuarios"]);

  async function restablecerOperario() {
    pagina();
    await screen.findByText("Operario");
    fireEvent.click(screen.getAllByText("Restablecer contraseña")[0]);
    const restablecer = screen.getByText("Restablecer");
    await act(async () => {
      fireEvent.click(restablecer);
      fireEvent.click(restablecer);
    });
  }

  it("se restablece una sola vez y salir sin copiarla pregunta", async () => {
    await restablecerOperario();
    expect(seguridad.restablecerPassword).toHaveBeenCalledOnce();
    await salirPorMenu();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/no se volverá a mostrar/));
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });

  it("después de copiarla se sale sin preguntar", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
    await restablecerOperario();
    await act(async () => fireEvent.click(screen.getByText("Copiar")));
    await salirPorMenu();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(await screen.findByText("HISTORIAL")).toBeTruthy();
  });
});
