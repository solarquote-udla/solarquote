/**
 * Cierre de sesión por inactividad (RF-11, RNF-04: 30 minutos).
 * Origen: matriz de trazabilidad, 03_pruebas/trazabilidad.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MINUTOS_INACTIVIDAD, useCierrePorInactividad } from "@/hooks/useCierrePorInactividad";
import { LoginPage } from "@/pages/LoginPage";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ autenticado: false, iniciarSesion: vi.fn() }),
}));

const MINUTO = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Cierre por inactividad", () => {
  it("cierra la sesión a los 30 minutos sin actividad, no antes", () => {
    const alVencer = vi.fn();
    renderHook(() => useCierrePorInactividad(true, alVencer));
    expect(MINUTOS_INACTIVIDAD).toBe(30);

    act(() => void vi.advanceTimersByTime(29 * MINUTO));
    expect(alVencer).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1.5 * MINUTO));
    expect(alVencer).toHaveBeenCalled();
  });

  it("cualquier actividad reinicia la cuenta", () => {
    const alVencer = vi.fn();
    renderHook(() => useCierrePorInactividad(true, alVencer));

    act(() => void vi.advanceTimersByTime(25 * MINUTO));
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown")));
    act(() => void vi.advanceTimersByTime(25 * MINUTO));
    expect(alVencer).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(6 * MINUTO));
    expect(alVencer).toHaveBeenCalled();
  });

  it("la actividad en otra pestaña mantiene viva la sesión", () => {
    const alVencer = vi.fn();
    renderHook(() => useCierrePorInactividad(true, alVencer));

    act(() => void vi.advanceTimersByTime(25 * MINUTO));
    // Otra pestaña registró actividad
    localStorage.setItem("solarquote_ultima_actividad", String(Date.now()));
    act(() => void vi.advanceTimersByTime(25 * MINUTO));
    expect(alVencer).not.toHaveBeenCalled();
  });

  it("sin sesión no hace nada", () => {
    const alVencer = vi.fn();
    renderHook(() => useCierrePorInactividad(false, alVencer));
    act(() => void vi.advanceTimersByTime(120 * MINUTO));
    expect(alVencer).not.toHaveBeenCalled();
  });

  it("el login explica por qué se cerró la sesión", () => {
    vi.useRealTimers();
    const router = createMemoryRouter([{ path: "/login", element: <LoginPage /> }], {
      initialEntries: ["/login?inactividad=1"],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByText(/30 minutos sin actividad/)).toBeTruthy();
  });
});
