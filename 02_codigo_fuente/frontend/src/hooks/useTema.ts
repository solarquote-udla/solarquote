import { useContext } from "react";

import { TemaContext, type EstadoTema } from "@/context/TemaContext";

/**
 * Acceso al tema activo (claro/oscuro) y a cómo alternarlo.
 *
 * Lanza un error si se usa fuera de <TemaProvider>, igual que useAuth.
 */
export function useTema(): EstadoTema {
  const contexto = useContext(TemaContext);

  if (contexto === null) {
    throw new Error("useTema debe usarse dentro de <TemaProvider>");
  }

  return contexto;
}
