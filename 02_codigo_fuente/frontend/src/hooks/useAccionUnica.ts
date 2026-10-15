import { useCallback, useRef } from "react";

/**
 * Evita que la MISMA acción se ejecute dos veces a la vez (doble clic,
 * Enter repetido, clic mientras la primera espera la respuesta).
 *
 * Cada acción se identifica con una clave: un botón, o un botón de una
 * fila ("baja-12", "restablecer-3"). Solo se ignora el segundo intento de
 * la misma clave; acciones distintas (otra fila, otro botón) siguen
 * pudiendo ejecutarse en paralelo, como antes de existir el candado.
 * Un candado único para toda la pantalla bloqueaba en silencio, por
 * ejemplo, reactivar al cliente B mientras se daba de baja al A
 * (revisión del PR #36).
 *
 * Importa sobre todo en altas (proyecto, camino, usuario, perfil,
 * cliente) y al restablecer una contraseña, donde dos envíos generarían
 * dos contraseñas temporales distintas.
 *
 * Uso:  const unaVez = useAccionUnica();
 *       onClick={() => void unaVez(`baja-${c.id}`, () => darDeBaja(c))}
 */
export function useAccionUnica() {
  const enCurso = useRef(new Set<string>());
  return useCallback(async <T,>(clave: string, accion: () => Promise<T>): Promise<T | undefined> => {
    if (enCurso.current.has(clave)) return undefined;
    enCurso.current.add(clave);
    try {
      return await accion();
    } finally {
      enCurso.current.delete(clave);
    }
  }, []);
}
