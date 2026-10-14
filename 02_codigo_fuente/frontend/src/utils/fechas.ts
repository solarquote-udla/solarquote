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
