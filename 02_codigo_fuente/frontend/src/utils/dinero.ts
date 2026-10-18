/** Formato de moneda para la interfaz, compartido entre Historial y el detalle de cotización. */

// en-US y no es-EC: con es-EC el separador decimal es coma ("$436,77"),
// distinto del "$436.77" que ya usan Precios y Materiales — en-US agrega
// separador de miles sin cambiar cómo se ve el punto decimal.
const formatoIntl = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$436.77", o "—" si no hay valor. */
export function formatoMoneda(valor: string | number | null, siVacio = "—"): string {
  return valor === null ? siVacio : formatoIntl.format(Number(valor));
}
