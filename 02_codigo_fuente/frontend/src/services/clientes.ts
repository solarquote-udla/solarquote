/**
 * Lectura del listado de clientes (RF-12, módulo de Esteban).
 *
 * La gestión de proyectos solo necesita elegir un cliente existente; el
 * alta y edición de clientes viven en su propio módulo. Ver el contrato
 * en 01_documentacion/arquitectura/MODELOS-COMPARTIDOS.md.
 */

import { api } from "@/services/api";
import type { ClienteListado } from "@/types/api";

export async function listarClientes(): Promise<ClienteListado[]> {
  const { data } = await api.get<ClienteListado[]>("/api/clientes");
  // `activo` es opcional en el contrato: si no viene, se asume activo.
  return data.filter((cliente) => cliente.activo !== false);
}
