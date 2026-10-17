import { ETIQUETAS_ESTADO_COTIZACION, EstadoCotizacion } from "@/types/api";

const ESTILOS: Record<EstadoCotizacion, string> = {
  [EstadoCotizacion.COTIZADA]: "bg-sky-100 text-sky-800",
  [EstadoCotizacion.DESPACHADA]: "bg-amber-100 text-amber-900",
  [EstadoCotizacion.RECIBIDA]: "bg-solar-100 text-solar-800",
  [EstadoCotizacion.INSTALADA]: "bg-green-100 text-green-800",
};

export function EstadoCotizacionBadge({ estado }: { estado: EstadoCotizacion }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILOS[estado]}`}>
      {ETIQUETAS_ESTADO_COTIZACION[estado]}
    </span>
  );
}
