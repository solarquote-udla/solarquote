import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hoyISO, primerDiaHaceMeses } from "@/utils/fechas";

describe("fechas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hoyISO usa los campos locales, no toISOString (que corre la fecha en UTC-5)", () => {
    // 23:30 del 17 de octubre en Ecuador (UTC-5) es ya 18 de octubre en UTC:
    // toISOString() diría "2026-10-18", que sería la fecha equivocada acá.
    vi.setSystemTime(new Date(2026, 9, 17, 23, 30));

    expect(hoyISO()).toBe("2026-10-17");
  });

  it("primerDiaHaceMeses(1) es el primer día del mes actual", () => {
    vi.setSystemTime(new Date(2026, 9, 17));

    expect(primerDiaHaceMeses(1)).toBe("2026-10-01");
  });

  it("primerDiaHaceMeses(6) incluye el mes actual más los 5 anteriores", () => {
    vi.setSystemTime(new Date(2026, 9, 17));

    expect(primerDiaHaceMeses(6)).toBe("2026-05-01");
  });

  it("primerDiaHaceMeses cruza el cambio de año", () => {
    vi.setSystemTime(new Date(2026, 1, 15)); // 15 de febrero de 2026

    expect(primerDiaHaceMeses(6)).toBe("2025-09-01");
  });
});
