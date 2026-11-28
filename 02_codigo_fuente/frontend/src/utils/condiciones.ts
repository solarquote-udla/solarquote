/**
 * Condiciones de la proforma en la confirmación (acuerdo con Santi del 17
 * de noviembre): plazo, validez, garantía, logística y forma de pago se
 * ingresan por cotización, porque cambian según el cliente y el lugar de
 * entrega. Mismas reglas que
 * `CondicionesProforma` en el backend.
 */
import type { CondicionesProforma } from "@/types/api";

export interface TramoFormulario {
  nombre: string;
  porcentaje: string;
}

export interface FormularioCondiciones {
  plazo: string;
  validez: string;
  garantia: string;
  /** Logística en USD: depende del lugar de entrega (Ibarra o en sitio), a veces 0 */
  logistica: string;
  pagos: TramoFormulario[];
}

/** Lo que devuelve GET /api/proforma/condiciones */
export interface CondicionesPorDefecto {
  plazo_dias: number;
  validez_dias: number;
  garantia_anios: number;
  /** Puede faltar si el backend es anterior al campo: se usa 0 */
  logistica_monto?: string | number;
  pagos: { nombre: string; porcentaje: string | number }[];
}

/** Formas de pago de las proformas reales (CT519 y CT521A). */
export const PLANTILLAS_PAGO: { etiqueta: string; pagos: TramoFormulario[] }[] = [
  {
    etiqueta: "40 / 60",
    pagos: [
      { nombre: "Anticipo", porcentaje: "40" },
      { nombre: "Entrega total", porcentaje: "60" },
    ],
  },
  {
    etiqueta: "30 / 25 / 25 / 20",
    pagos: [
      { nombre: "Anticipo", porcentaje: "30" },
      { nombre: "Entrega parcial 1", porcentaje: "25" },
      { nombre: "Entrega parcial 2", porcentaje: "25" },
      { nombre: "Entrega parcial 3", porcentaje: "20" },
    ],
  },
];

const texto = (n: number | string) => String(Number(n));

export function desdeDefecto(d: CondicionesPorDefecto): FormularioCondiciones {
  return {
    plazo: texto(d.plazo_dias),
    validez: texto(d.validez_dias),
    garantia: texto(d.garantia_anios),
    logistica: texto(d.logistica_monto ?? 0),
    pagos: d.pagos.map((t) => ({ nombre: t.nombre, porcentaje: texto(t.porcentaje) })),
  };
}

const numero = (v: string) => Number(v.trim().replace(",", "."));

/** Suma de los porcentajes válidos, redondeada al centésimo. */
export function sumaPagos(f: FormularioCondiciones): number {
  const suma = f.pagos.reduce((s, t) => s + (Number.isFinite(numero(t.porcentaje)) ? numero(t.porcentaje) : 0), 0);
  return Math.round(suma * 100) / 100;
}

function entero(valor: string, unidad: string): string | undefined {
  const v = numero(valor);
  if (valor.trim() === "") return `Ingresa ${unidad}.`;
  if (!Number.isInteger(v) || v < 1) return "Debe ser un número entero mayor que cero.";
  return undefined;
}

/**
 * Errores por campo. Claves: plazo, validez, garantia, pagos (la suma) y
 * `pagos.N.nombre` / `pagos.N.porcentaje`.
 */
export function erroresCondiciones(f: FormularioCondiciones): Record<string, string> {
  const errores: Record<string, string> = {};
  const poner = (clave: string, mensaje: string | undefined) => {
    if (mensaje) errores[clave] = mensaje;
  };
  poner("plazo", entero(f.plazo, "el plazo en días"));
  poner("validez", entero(f.validez, "la validez en días"));
  poner("garantia", entero(f.garantia, "la garantía en años"));
  const logistica = numero(f.logistica);
  if (f.logistica.trim() === "") errores.logistica = "Ingresa el monto (0 si no se cobra).";
  else if (!Number.isFinite(logistica) || logistica < 0) errores.logistica = "Debe ser un monto desde 0.";
  else if (Math.abs(logistica * 100 - Math.round(logistica * 100)) > 1e-6) errores.logistica = "Hasta dos decimales.";

  if (f.pagos.length === 0) errores.pagos = "Agrega al menos un tramo de pago.";
  f.pagos.forEach((t, i) => {
    const nombre = t.nombre.trim();
    if (!nombre) errores[`pagos.${i}.nombre`] = "Escribe la etapa.";
    else if (nombre.length > 100) errores[`pagos.${i}.nombre`] = "Máximo 100 caracteres.";
    const p = numero(t.porcentaje);
    if (t.porcentaje.trim() === "" || !Number.isFinite(p) || p <= 0 || p > 100) {
      errores[`pagos.${i}.porcentaje`] = "Entre 0 y 100.";
    } else if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) {
      errores[`pagos.${i}.porcentaje`] = "Hasta dos decimales.";
    }
  });
  if (f.pagos.length > 0 && !Object.keys(errores).some((k) => k.startsWith("pagos.")) && sumaPagos(f) !== 100) {
    errores.pagos = `Los porcentajes deben sumar 100 (ahora suman ${sumaPagos(f)}).`;
  }
  return errores;
}

/** Cuerpo para la API; supone un formulario sin errores. */
export function aCondiciones(f: FormularioCondiciones): CondicionesProforma {
  return {
    plazo_dias: numero(f.plazo),
    validez_dias: numero(f.validez),
    garantia_anios: numero(f.garantia),
    logistica_monto: numero(f.logistica),
    pagos: f.pagos.map((t) => ({ nombre: t.nombre.trim(), porcentaje: numero(t.porcentaje) })),
  };
}
