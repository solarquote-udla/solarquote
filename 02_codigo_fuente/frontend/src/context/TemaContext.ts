/**
 * Definición del contexto de tema (claro/oscuro).
 *
 * Va separado del proveedor (TemaProvider.tsx) por la misma razón que
 * AuthContext/AuthProvider: Fast Refresh de Vite exige que un archivo de
 * componentes exporte solo componentes.
 */

import { createContext } from "react";

export type Tema = "oscuro" | "claro";

export interface EstadoTema {
  tema: Tema;
  alternarTema: () => void;
}

export const TemaContext = createContext<EstadoTema | null>(null);
