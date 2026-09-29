import { ETIQUETAS_ESTADO_PROYECTO, EstadoProyecto } from "@/types/api";

const ESTILOS: Record<EstadoProyecto, string> = {
  [EstadoProyecto.BORRADOR]: "bg-acero-100 text-acero-600",
  [EstadoProyecto.EN_DISENO]: "bg-sky-100 text-sky-800",
  [EstadoProyecto.DISENADO]: "bg-solar-100 text-solar-800",
  [EstadoProyecto.COTIZADO]: "bg-green-100 text-green-800",
};

export function EstadoProyectoBadge({ estado }: { estado: EstadoProyecto }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILOS[estado]}`}
    >
      {ETIQUETAS_ESTADO_PROYECTO[estado]}
    </span>
  );
}
