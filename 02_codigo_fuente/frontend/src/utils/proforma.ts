import type { CotizacionDetalle } from "@/types/api";

/** Nombre del archivo, igual al que arma el backend (`app/services/documentos.py`). */
export function nombreArchivoProforma(cotizacion: CotizacionDetalle, extension: "docx" | "xlsx"): string {
  const base = cotizacion.numero_proforma ?? `cotizacion-${cotizacion.id}`;
  return `Proforma ${base}.${extension}`;
}

function numeroProforma(cotizacion: CotizacionDetalle): string {
  return cotizacion.numero_proforma ?? `#${cotizacion.id}`;
}

function mensajeEnvio(cotizacion: CotizacionDetalle): string {
  return (
    `Hola ${cotizacion.cliente_nombre}, te comparto la cotización ${numeroProforma(cotizacion)} de HEXtructure. ` +
    "Adjunto el documento."
  );
}

/**
 * `mailto:` con destinatario, asunto y cuerpo prellenados. El documento no
 * se adjunta solo (los navegadores no lo permiten vía mailto): hay que
 * descargarlo con "Descargar Word/Excel" y adjuntarlo a mano antes de
 * enviar. `null` si el cliente no tiene correo (clientes de antes de que
 * fuera obligatorio).
 */
export function enlaceCorreoProforma(cotizacion: CotizacionDetalle): string | null {
  if (!cotizacion.cliente_email) return null;
  const asunto = `Cotización ${numeroProforma(cotizacion)} - HEXtructure`;
  const parametros = new URLSearchParams({ subject: asunto, body: mensajeEnvio(cotizacion) });
  return `mailto:${cotizacion.cliente_email}?${parametros.toString().replace(/\+/g, "%20")}`;
}

/**
 * Número en formato internacional para `wa.me`: solo dígitos, y si
 * empieza en 0 (como se escriben los celulares en Ecuador) se asume que
 * falta el código de país y se reemplaza por 593. Un número que ya venga
 * con código de país (sin el 0 inicial) se deja tal cual.
 */
function telefonoWhatsapp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.startsWith("0") ? `593${digitos.slice(1)}` : digitos;
}

/**
 * Enlace de WhatsApp con el mensaje prellenado. Igual que el correo, el
 * documento no viaja adjunto: hay que descargarlo aparte y mandarlo por
 * el chat. `null` si el cliente no tiene teléfono.
 */
export function enlaceWhatsappProforma(cotizacion: CotizacionDetalle): string | null {
  if (!cotizacion.cliente_telefono) return null;
  const numero = telefonoWhatsapp(cotizacion.cliente_telefono);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeEnvio(cotizacion))}`;
}
