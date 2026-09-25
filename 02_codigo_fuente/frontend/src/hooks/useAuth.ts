import { useContext } from "react";

import { AuthContext, type EstadoAuth } from "@/context/AuthContext";

/**
 * Acceso al estado de autenticación.
 *
 * Lanza un error si se usa fuera de <AuthProvider>, para que el fallo
 * aparezca de inmediato y no como un `null` silencioso más adelante.
 */
export function useAuth(): EstadoAuth {
  const contexto = useContext(AuthContext);

  if (contexto === null) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }

  return contexto;
}
