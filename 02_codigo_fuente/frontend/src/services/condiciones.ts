/** Condiciones de la proforma de la configuración, para el formulario de la confirmación. */
import { api } from "@/services/api";
import type { CondicionesPorDefecto } from "@/utils/condiciones";

export async function obtenerCondicionesPorDefecto(): Promise<CondicionesPorDefecto> {
  const { data } = await api.get<CondicionesPorDefecto>("/api/proforma/condiciones");
  return data;
}
