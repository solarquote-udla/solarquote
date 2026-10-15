/**
 * Pruebas de interfaz (Vitest + jsdom + Testing Library).
 *
 * Montan las páginas reales con los servicios simulados: verifican lo que
 * el usuario ve y hace (avisos, navegación, qué se envía al backend), no
 * los cálculos, que viven y se prueban en el backend.
 *
 *   npm test
 */
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.tsx"],
    },
  }),
);
