import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "@/App";
import { menuVisible } from "@/components/menu";
import { Permiso } from "@/types/api";

afterEach(cleanup);

describe("Aplicación", () => {
  it("arranca con el data router y, sin sesión, lleva al login", async () => {
    window.history.pushState({}, "", "/generar");
    render(<App />);
    expect(await screen.findByText("Iniciar sesión")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });
});

describe("Menú", () => {
  const rutas = (permisos: Permiso[]) =>
    menuVisible((...p) => p.some((x) => permisos.includes(x))).flatMap((g) =>
      g.secciones.flatMap((s) => s.opciones.map((o) => o.ruta)),
    );

  it("Historial aparece con 'Generar layout' aunque falte 'Historial' (misma regla que la ruta)", () => {
    expect(rutas([Permiso.GENERAR_LAYOUT])).toContain("/historial");
    expect(rutas([Permiso.HISTORIAL])).toContain("/historial");
    expect(rutas([Permiso.DESPACHO])).not.toContain("/historial");
  });

  it("Personal de Producción ve solo Dashboard, Despacho y Recepción", () => {
    expect(rutas([Permiso.DESPACHO, Permiso.RECEPCION])).toEqual(["/", "/validacion/despacho", "/validacion/recepcion"]);
  });
});
