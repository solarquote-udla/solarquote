/**
 * Validación de cédula, RUC, pasaporte y teléfono — RF-12.
 *
 * Copia fiel de backend/app/services/validaciones_identificacion.py. El
 * backend sigue siendo la autoridad; esta copia existe para avisar del
 * error mientras se llena el formulario, sin esperar al servidor.
 *
 * Si cambia una regla, se cambia en los dos archivos. Las reglas están
 * acordadas en 01_documentacion/arquitectura/CONTRATO-CLIENTES.md.
 */

import { TipoIdentificacion } from "@/types/api";

const PROVINCIAS_VALIDAS = new Set([...Array.from({ length: 24 }, (_, i) => i + 1), 30]);

/** Quita espacios y guiones: "17-1234-5678" → "1712345678". */
export function normalizarIdentificacion(valor: string): string {
  return valor.replace(/[\s-]/g, "");
}

export function esCedulaValida(valor: string): boolean {
  const v = normalizarIdentificacion(valor);
  if (!/^\d{10}$/.test(v)) return false;

  if (!PROVINCIAS_VALIDAS.has(Number(v.slice(0, 2)))) return false;
  if (Number(v[2]) >= 6) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    const producto = Number(v[i]) * coeficientes[i];
    suma += producto >= 10 ? producto - 9 : producto;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(v[9]);
}

export function esRucValido(valor: string): boolean {
  const v = normalizarIdentificacion(valor);
  if (!/^\d{13}$/.test(v)) return false;
  if (v.slice(10) === "000") return false;
  if (!PROVINCIAS_VALIDAS.has(Number(v.slice(0, 2)))) return false;

  const tercer = Number(v[2]);
  if (tercer <= 5) return esCedulaValida(v.slice(0, 10)); // persona natural
  return tercer === 6 || tercer === 9; // público o sociedad: sin módulo 11, ver contrato
}

export function esTelefonoValido(valor: string): boolean {
  if (!/^\+?[\d\s()-]+$/.test(valor)) return false;
  const digitos = valor.replace(/\D/g, "").length;
  return digitos >= 7 && digitos <= 15;
}

/**
 * Mensaje de error para la identificación, o null si es válida.
 * Mismos textos que el backend, para que el usuario vea lo mismo en
 * ambos lados.
 */
export function errorIdentificacion(tipo: TipoIdentificacion, valor: string): string | null {
  if (!valor.trim()) return "Ingresa la identificación.";

  switch (tipo) {
    case TipoIdentificacion.CEDULA:
      return esCedulaValida(valor) ? null : `'${valor}' no es una cédula válida`;
    case TipoIdentificacion.RUC:
      return esRucValido(valor) ? null : `'${valor}' no es un RUC válido`;
    case TipoIdentificacion.PASAPORTE:
      return /^[A-Za-z0-9]{5,20}$/.test(valor.trim())
        ? null
        : "El pasaporte debe tener entre 5 y 20 caracteres alfanuméricos";
  }
}

/** Ayuda contextual bajo el campo, según el tipo elegido. */
export const AYUDA_IDENTIFICACION: Record<TipoIdentificacion, string> = {
  [TipoIdentificacion.CEDULA]: "10 dígitos",
  [TipoIdentificacion.RUC]: "13 dígitos, termina en 001 o en otro establecimiento",
  [TipoIdentificacion.PASAPORTE]: "5 a 20 letras o números",
};
