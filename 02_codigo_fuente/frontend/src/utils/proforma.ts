import type { CotizacionDetalle } from "@/types/api";

/** Nombre del archivo, igual al que arma el backend (`app/services/documentos.py`). */
export function nombreArchivoProforma(cotizacion: CotizacionDetalle, extension: "docx" | "xlsx"): string {
  const base = cotizacion.numero_proforma ?? `cotizacion-${cotizacion.id}`;
  return `Proforma ${base}.${extension}`;
}
