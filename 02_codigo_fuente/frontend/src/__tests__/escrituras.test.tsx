/**
 * Candado contra doble envío en TODAS las escrituras.
 *
 * Además de probar las pantallas que faltaban (Editar datos del
 * proyecto, login, cambio de contraseña y precios), hay una prueba de
 * inventario: cualquier pantalla o componente que importe una función que
 * escribe en el servidor debe usar `useAccionUnica`. Así una pantalla nueva
 * no puede olvidarlo sin que falle el CI (revisión del PR #36).
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EncabezadoProyecto } from "@/components/EncabezadoProyecto";
import { hayCambiosPendientes } from "@/hooks/useCambiosSinGuardar";
import { CambiarPasswordPage } from "@/pages/CambiarPasswordPage";
import { LoginPage } from "@/pages/LoginPage";
import { PreciosPage } from "@/pages/PreciosPage";
import * as materiales from "@/services/materiales";
import * as proyectos from "@/services/proyectos";

import { montar, PROYECTO } from "./utilidades";

const auth = vi.hoisted(() => ({
  iniciarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    autenticado: false,
    cargando: false,
    usuario: { id: 1, nombre: "Ana Pérez", debe_cambiar_password: true },
    iniciarSesion: auth.iniciarSesion,
    cambiarPassword: auth.cambiarPassword,
    cerrarSesion: vi.fn(),
  }),
}));
vi.mock("@/services/proyectos", () => ({ actualizarProyecto: vi.fn() }));
vi.mock("@/services/materiales", () => ({
  listarMateriales: vi.fn(async () => [
    { id: 1, codigo: "VAR1650", nombre: "Varilla 1650mm", unidad: "u", precio_vigente: "7.20", vigente_desde: "2026-01-01", activo: true },
    { id: 2, codigo: "VAR1350", nombre: "Varilla 1350mm", unidad: "u", precio_vigente: "6.20", vigente_desde: "2026-01-01", activo: true },
  ]),
  actualizarPrecio: vi.fn(),
  obtenerHistorialPrecios: vi.fn(async () => []),
}));

const pendiente = () => new Promise<never>(() => undefined);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function dobleClic(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.click(elemento);
    fireEvent.click(elemento);
  });
}

function enRouter(elemento: React.ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: elemento }, { path: "*", element: <p>OTRA</p> }]);
  return render(<RouterProvider router={router} />);
}

describe("Doble envío en las escrituras que faltaban", () => {
  it("'Editar datos' del proyecto (Pasos 2 y 3) guarda una sola vez", async () => {
    vi.mocked(proyectos.actualizarProyecto).mockImplementation(pendiente);
    enRouter(<EncabezadoProyecto paso={2} proyecto={PROYECTO as never} />);
    fireEvent.click(screen.getByText("Editar datos"));
    fireEvent.change(screen.getByDisplayValue("San Pablo"), { target: { value: "Otro nombre" } });
    await dobleClic(screen.getByText("Guardar"));
    expect(proyectos.actualizarProyecto).toHaveBeenCalledOnce();
  });

  it("Login: un doble envío es un solo intento (no suma dos al bloqueo)", async () => {
    auth.iniciarSesion.mockImplementation(pendiente);
    enRouter(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "Mala1234" } });
    await dobleClic(screen.getByText("Ingresar"));
    expect(auth.iniciarSesion).toHaveBeenCalledOnce();
  });

  it("Cambiar contraseña: un doble envío cambia una sola vez", async () => {
    auth.cambiarPassword.mockImplementation(pendiente);
    enRouter(<CambiarPasswordPage />);
    const [actual, nueva, repetida] = screen.getAllByDisplayValue("") as HTMLInputElement[];
    fireEvent.change(actual, { target: { value: "Temporal1" } });
    fireEvent.change(nueva, { target: { value: "NuevaClave9" } });
    fireEvent.change(repetida, { target: { value: "NuevaClave9" } });
    await dobleClic(screen.getByText("Guardar contraseña"));
    expect(auth.cambiarPassword).toHaveBeenCalledOnce();
  });
});

describe("Precios unitarios", () => {
  const pagina = () => montar(<PreciosPage />, "/configuracion/precios", ["/configuracion/precios"]);
  const fila = async (nombre: string) => (await screen.findByText(nombre)).closest("tr")!;

  it("doble clic en Guardar registra un solo precio", async () => {
    vi.mocked(materiales.actualizarPrecio).mockImplementation(pendiente);
    pagina();
    const a = await fila("Varilla 1650mm");
    fireEvent.click(within(a).getByText("Cambiar precio"));
    fireEvent.change(within(a).getByDisplayValue("7.20"), { target: { value: "7.50" } });
    await dobleClic(within(a).getByText("Guardar"));
    expect(materiales.actualizarPrecio).toHaveBeenCalledOnce();
  });

  it("un precio escrito sin guardar: salir o editar otro material pregunta", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    pagina();
    const a = await fila("Varilla 1650mm");
    fireEvent.click(within(a).getByText("Cambiar precio"));
    expect(hayCambiosPendientes()).toBe(false); // abrir sin tocar no cuenta
    fireEvent.change(within(a).getByDisplayValue("7.20"), { target: { value: "7.50" } });
    expect(hayCambiosPendientes()).toBe(true);

    fireEvent.click(within(await fila("Varilla 1350mm")).getByText("Cambiar precio"));
    expect(confirmar).toHaveBeenCalledOnce();
    expect(screen.getByDisplayValue("7.50")).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByText("MENU HISTORIAL")));
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });
});

describe("Inventario de escrituras", () => {
  // Vitest corre desde la carpeta del frontend (npm test)
  const SRC = join(process.cwd(), "src");
  const LECTURAS = /^(obtener|listar|buscar)/;

  /** Archivos .tsx de pantallas y componentes (las pruebas y el contexto no cuentan). */
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) return n === "__tests__" || n === "context" ? [] : archivos(ruta);
      return ruta.endsWith(".tsx") ? [ruta] : [];
    });
  }

  it("toda pantalla que escribe en el servidor usa el candado contra doble envío", () => {
    const sinCandado: string[] = [];
    for (const archivo of archivos(SRC)) {
      const codigo = readFileSync(archivo, "utf8");
      const importados = [...codigo.matchAll(/import \{([^}]+)\} from "@\/services\/(?!api")[^"]+"/g)]
        .flatMap((m) => m[1].split(","))
        .map((n) => n.trim().replace(/^type\s+/, ""))
        .filter((n) => n && !LECTURAS.test(n));
      const escribeVia = /\b(iniciarSesion|cambiarPassword)\b/.test(codigo) && /useAuth\(\)/.test(codigo);
      if ((importados.length > 0 || escribeVia) && !/useAccionUnica\(\)/.test(codigo)) {
        sinCandado.push(archivo.replace(SRC, "src"));
      }
    }
    expect(sinCandado).toEqual([]);
  });
});
