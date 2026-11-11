/**
 * Colores de inversor legibles en los dos temas (revisión del PR #45).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { colorInversor } from "@/utils/inversores";

describe("Colores de inversor", () => {
  it("cada color de texto tiene su variante para el tema claro", () => {
    for (let i = 0; i < 8; i++) {
      expect(colorInversor(i).texto).toMatch(/^text-[a-z]+-400 claro:text-[a-z]+-(700|800)$/);
    }
  });

  it("en el tema claro el texto no repite el tono del borde de su tarjeta (SQ-171)", () => {
    for (let i = 0; i < 8; i++) {
      const { texto, tarjeta } = colorInversor(i);
      const tonoTexto = texto.split("claro:text-")[1];
      const tonoBorde = tarjeta.replace("border-", "");
      expect(tonoTexto).not.toBe(tonoBorde);
    }
  });

  it("la variante claro está declarada en index.css", () => {
    const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");
    expect(css).toMatch(/@custom-variant claro \(&:where\(\[data-tema="claro"\], \[data-tema="claro"\] \*\)\);/);
  });
});
