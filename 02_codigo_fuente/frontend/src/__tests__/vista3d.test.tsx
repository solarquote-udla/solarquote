/**
 * Vista 3D del layout (revisión del 16 de noviembre, Lenin): geometría de
 * la estructura en casita (soportes en V y en A con el ángulo de montaje),
 * pestañas Plano y 3D, y aviso cuando el navegador no tiene WebGL (jsdom
 * tampoco lo tiene).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PestanasPlano3D } from "@/components/PestanasPlano3D";
import type { Punto } from "@/types/api";
import {
  ALTURA_V_M,
  ANGULO_DEFECTO,
  alturaSoporte,
  encuadre3D,
  geometriaBloque,
  producto,
  type Vector3,
} from "@/utils/escena3d";

afterEach(cleanup);

/** Bloque de 4 × 2 paneles: 9,2 m en la pendiente (x) y 2,3 m de ancho (y), como [SE, NE, NO, SO]. */
const BLOQUE = {
  vertices: [
    [9.2, 0],
    [9.2, 2.3],
    [0, 2.3],
    [0, 0],
  ] as Punto[],
  paneles_largo: 4,
  paneles_ancho: 2,
};

const punto = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("geometría de la estructura en casita", () => {
  const { paneles, soportes } = geometriaBloque(BLOQUE, 7.5);
  const subida = 2.3 * Math.tan((7.5 * Math.PI) / 180);

  it("un panel por cada L × A y un soporte en cada esquina compartida", () => {
    expect(paneles).toHaveLength(8);
    expect(soportes).toHaveLength(5 * 3);
  });

  it("los soportes alternan V abajo y A arriba, y el bloque empieza y termina en V", () => {
    const fila = soportes.filter((s) => s.z === 0);
    expect(fila.map((s) => s.tipo)).toEqual(["V", "A", "V", "A", "V"]);
    expect(fila[0].alto).toBeCloseTo(ALTURA_V_M);
    expect(fila[1].alto).toBeCloseTo(ALTURA_V_M + subida);
    expect(alturaSoporte(2, subida)).toBeCloseTo(ALTURA_V_M);
  });

  it("los paneles suben y bajan con el ángulo de montaje, con la cara hacia arriba", () => {
    const enLaPendiente = paneles.filter((_, k) => k % 2 === 0);
    const pendientes = enLaPendiente.map((p) => Math.sign(p.ejeLargo[1]));
    expect(pendientes).toEqual([1, -1, 1, -1]);
    for (const p of paneles) {
      expect(p.normal[1]).toBeGreaterThan(0.99);
      const inclinacion = (Math.asin(Math.abs(p.ejeLargo[1])) * 180) / Math.PI;
      expect(inclinacion).toBeCloseTo(7.5, 5);
      // Base derecha (largo × normal = ancho): Three.js no refleja el panel
      expect(punto(producto(p.ejeLargo, p.normal), p.ejeAncho)).toBeCloseTo(1, 6);
    }
  });

  it("cada panel mide su lado inclinado, con un pequeño hueco entre paneles", () => {
    const largoInclinado = Math.hypot(2.3, subida);
    expect(paneles[0].largo).toBeCloseTo(largoInclinado * 0.98, 6);
    expect(paneles[0].ancho).toBeCloseTo(1.15 * 0.98, 6);
    // Centro del primer panel: a 1/8 del largo y 1/4 del ancho; el plano y queda en −z
    expect(paneles[0].centro[0]).toBeCloseTo(1.15);
    expect(paneles[0].centro[2]).toBeCloseTo(-0.575);
    expect(paneles[0].centro[1]).toBeCloseTo(ALTURA_V_M + subida / 2);
  });

  it("sin ángulo usa el de las aletas de los soportes, y un bloque inválido no dibuja nada", () => {
    expect(ANGULO_DEFECTO).toBe(7.5);
    expect(geometriaBloque({ ...BLOQUE, paneles_largo: 0 })).toEqual({ paneles: [], soportes: [] });
    expect(geometriaBloque({ ...BLOQUE, vertices: [] })).toEqual({ paneles: [], soportes: [] });
  });

  it("la cámara se centra en el terreno", () => {
    expect(encuadre3D([[0, 0], [100, 0], [100, 60], [0, 60]])).toEqual({ centro: [50, 0, -30], tamano: 100 });
    expect(encuadre3D([]).tamano).toBe(50);
  });
});

describe("pestañas Plano y 3D", () => {
  const datos = { terreno: BLOQUE.vertices, caminos: [], bloques: [BLOQUE], anguloMontaje: 7.5, orientacionNorte: 0 };

  it("abre en el plano y el 3D se carga al pedirlo; sin WebGL lo dice", async () => {
    render(<PestanasPlano3D plano={<p>PLANO</p>} datos3d={datos} />);
    expect(screen.getByText("PLANO")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "3D" }));
    expect(await screen.findByText(/no permite la vista 3D/)).toBeTruthy();
    expect(screen.queryByText("PLANO")).toBeNull();
  });

  it("mientras se edita el layout el 3D no está disponible", () => {
    render(<PestanasPlano3D plano={<p>PLANO</p>} datos3d={datos} sin3D="Termina la edición para ver el 3D" />);
    const tab = screen.getByRole("tab", { name: "3D" }) as HTMLButtonElement;
    expect(tab.disabled).toBe(true);
    expect(tab.title).toBe("Termina la edición para ver el 3D");
  });
});
