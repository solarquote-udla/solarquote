/**
 * Dónde retomar un proyecto del asistente. Lo usan el Historial y el
 * Dashboard.
 */
import type { NumeroPaso } from "@/components/asistente";
import type { Proyecto } from "@/types/api";

/**
 * Paso en el que conviene retomar el proyecto: el primero que falta.
 * No se usa el estado: "en diseño" no distingue si falta el equipo o el
 * layout (lo marca el backend en cuanto hay terreno o equipo).
 */
export function pasoParaRetomar(p: Proyecto): NumeroPaso {
  if (!p.tiene_terreno) return 1;
  if (!p.tiene_equipo) return 2;
  return 3;
}

export function etiquetaRetomar(p: Proyecto, paso: NumeroPaso): string {
  if (paso === 1) return "Continuar en Terreno";
  if (paso === 2) return "Continuar en Panel + Inversor";
  return p.tiene_layout ? "Abrir Caminos + Layout" : "Continuar en Caminos + Layout";
}
