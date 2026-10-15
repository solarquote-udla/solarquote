import { useCallback, useRef } from "react";

/**
 * Evita que una acción que escribe en el servidor se ejecute dos veces a
 * la vez (doble clic, Enter repetido, clic mientras la primera espera).
 *
 * El botón deshabilitado con `guardando` ya protege en casi todos los
 * casos, porque React aplica el estado antes del siguiente clic; este
 * candado lo garantiza también cuando la acción se dispara por otra vía.
 * Importa sobre todo en altas (crear proyecto, camino, usuario, perfil,
 * cliente) y al restablecer una contraseña, donde dos envíos generarían
 * dos contraseñas temporales distintas.
 *
 * Uso:  const unaVez = useAccionUnica();
 *       onClick={() => void unaVez(guardar)}
 */
export function useAccionUnica() {
  const enCurso = useRef(false);
  return useCallback(async <T,>(accion: () => Promise<T>): Promise<T | undefined> => {
    if (enCurso.current) return undefined;
    enCurso.current = true;
    try {
      return await accion();
    } finally {
      enCurso.current = false;
    }
  }, []);
}
