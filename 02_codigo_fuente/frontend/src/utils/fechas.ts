/** Formatos de fecha para la interfaz, en español de Ecuador. */

const formatoFechaHora = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "13 oct 2026, 12:15", o el texto alternativo si no hay fecha. */
export function fechaHora(iso: string | null, siVacio = "—"): string {
  return iso ? formatoFechaHora.format(new Date(iso)) : siVacio;
}

/**
 * "AAAA-MM-DD" a partir de los campos locales (no `toISOString`, que
 * convierte a UTC y puede correr la fecha un día según la hora).
 */
function aISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Fecha de hoy, en el huso horario del navegador (Ecuador, en producción). */
export function hoyISO(): string {
  return aISO(new Date());
}

/** Primer día del mes de hace `meses - 1` meses (así el rango incluye el mes actual). */
export function primerDiaHaceMeses(meses: number): string {
  const ahora = new Date();
  return aISO(new Date(ahora.getFullYear(), ahora.getMonth() - (meses - 1), 1));
}
