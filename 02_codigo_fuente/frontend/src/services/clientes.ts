/**
 * Llamadas a los endpoints de clientes (RF-12).
 *
 * Contrato: 01_documentacion/arquitectura/CONTRATO-CLIENTES.md. El
 * backend es de Esteban; la pantalla de administración, de Joseph.
 */

import { api } from "@/services/api";
import type { Cliente, ClienteActualizar, ClienteCrear, ClienteListado } from "@/types/api";

/**
 * Clientes activos para el selector del alta de proyectos.
 *
 * Usa solo los campos del contrato mínimo (`ClienteListado`): el selector
 * no necesita el resto.
 */
export async function listarClientes(): Promise<ClienteListado[]> {
  const { data } = await api.get<ClienteListado[]>("/api/clientes");
  // `activo` es opcional en el contrato: si no viene, se asume activo.
  return data.filter((cliente) => cliente.activo !== false);
}

/** Listado completo para la administración, con búsqueda en el servidor. */
export async function buscarClientes(params: {
  buscar?: string;
  incluirInactivos?: boolean;
}): Promise<Cliente[]> {
  const { data } = await api.get<Cliente[]>("/api/clientes", {
    params: {
      buscar: params.buscar?.trim() || undefined,
      incluir_inactivos: params.incluirInactivos || undefined,
    },
  });
  return data;
}

export async function crearCliente(datos: ClienteCrear): Promise<Cliente> {
  const { data } = await api.post<Cliente>("/api/clientes", datos);
  return data;
}

export async function actualizarCliente(clienteId: number, datos: ClienteActualizar): Promise<Cliente> {
  const { data } = await api.patch<Cliente>(`/api/clientes/${clienteId}`, datos);
  return data;
}

/** Baja lógica: el cliente conserva sus proyectos y cotizaciones. */
export async function darDeBajaCliente(clienteId: number): Promise<void> {
  await api.delete(`/api/clientes/${clienteId}`);
}

export async function reactivarCliente(clienteId: number): Promise<Cliente> {
  return actualizarCliente(clienteId, { activo: true });
}
