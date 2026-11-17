/**
 * Longitud del mapa dentro de -180..180. Regresión de la vista previa del
 * mapa: al desplazarse varias vueltas al mundo, un clic dio -437,241544 y
 * el backend lo habría rechazado.
 */
import { describe, expect, it } from "vitest";

import { normalizarLongitud, redondearCoordenada } from "@/utils/coordenadas";

describe("normalizarLongitud", () => {
  it.each([
    [-78.5249, -78.5249],
    [-437.241544, -77.241544],
    [281.475, -78.525],
    [-180, 180],
    [180, 180],
    [540, 180],
    [0, 0],
  ])("%d -> %d", (entrada, esperada) => {
    expect(normalizarLongitud(entrada)).toBeCloseTo(esperada, 6);
  });

  it("redondea a 6 decimales", () => {
    expect(redondearCoordenada(-0.12345678)).toBe(-0.123457);
  });
});
