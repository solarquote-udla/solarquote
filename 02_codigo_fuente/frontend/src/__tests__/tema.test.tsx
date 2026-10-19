/**
 * Pruebas del tema claro/oscuro: valor agregado sobre el prototipo (ver
 * TemaProvider.tsx). Cubre el proveedor/hook en aislado y el botón del
 * encabezado que lo usa.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppLayout } from "@/components/AppLayout";
import { TemaProvider } from "@/context/TemaProvider";
import { useTema } from "@/hooks/useTema";

const CLAVE_TEMA = "solarquote_tema";

function Sonda() {
  const { tema, alternarTema } = useTema();
  return (
    <div>
      <p>tema: {tema}</p>
      <button type="button" onClick={alternarTema}>
        alternar
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-tema");
  vi.restoreAllMocks();
});

describe("useTema", () => {
  it("lanza un error si se usa fuera de TemaProvider", () => {
    expect(() => render(<Sonda />)).toThrow("useTema debe usarse dentro de <TemaProvider>");
  });

  it("por defecto arranca en oscuro y lo refleja en <html data-tema>", () => {
    render(
      <TemaProvider>
        <Sonda />
      </TemaProvider>,
    );

    expect(screen.getByText("tema: oscuro")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-tema")).toBe("oscuro");
  });

  it("si localStorage ya tiene 'claro' guardado, arranca en claro", () => {
    localStorage.setItem(CLAVE_TEMA, "claro");

    render(
      <TemaProvider>
        <Sonda />
      </TemaProvider>,
    );

    expect(screen.getByText("tema: claro")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
  });

  it("alternarTema cambia de oscuro a claro y viceversa, persistiendo en localStorage", () => {
    render(
      <TemaProvider>
        <Sonda />
      </TemaProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "alternar" }));
    expect(screen.getByText("tema: claro")).toBeTruthy();
    expect(localStorage.getItem(CLAVE_TEMA)).toBe("claro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");

    fireEvent.click(screen.getByRole("button", { name: "alternar" }));
    expect(screen.getByText("tema: oscuro")).toBeTruthy();
    expect(localStorage.getItem(CLAVE_TEMA)).toBe("oscuro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("oscuro");
  });

  it("sigue el cambio de tema hecho en otra pestaña (evento 'storage')", () => {
    render(
      <TemaProvider>
        <Sonda />
      </TemaProvider>,
    );

    fireEvent(window, new StorageEvent("storage", { key: CLAVE_TEMA, newValue: "claro" }));

    expect(screen.getByText("tema: claro")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
  });

  it("ignora eventos 'storage' de otras claves", () => {
    render(
      <TemaProvider>
        <Sonda />
      </TemaProvider>,
    );

    fireEvent(window, new StorageEvent("storage", { key: "otra_clave", newValue: "lo que sea" }));

    expect(screen.getByText("tema: oscuro")).toBeTruthy();
  });
});

// ─── El botón del encabezado ──────────────────────────────────────────

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Gerente General", perfil: { nombre: "Gerente General" } },
    cerrarSesion: vi.fn(),
    tienePermiso: () => false,
  }),
}));

function renderEncabezado() {
  return render(
    <MemoryRouter>
      <TemaProvider>
        <AppLayout />
      </TemaProvider>
    </MemoryRouter>,
  );
}

describe("Botón de tema en el encabezado", () => {
  it("alterna el tema al hacer clic y actualiza su etiqueta accesible", () => {
    renderEncabezado();

    const boton = screen.getByRole("button", { name: "Cambiar a modo claro" });
    expect(document.documentElement.getAttribute("data-tema")).toBe("oscuro");

    fireEvent.click(boton);

    expect(screen.getByRole("button", { name: "Cambiar a modo oscuro" })).toBeTruthy();
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
  });
});
