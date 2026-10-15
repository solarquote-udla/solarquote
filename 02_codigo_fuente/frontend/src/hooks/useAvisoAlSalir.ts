import { useEffect } from "react";

/**
 * Mientras `activo` sea true, el navegador pide confirmación antes de
 * recargar o cerrar la pestaña (el texto lo pone el navegador).
 *
 * Cubre lo que los botones del asistente no pueden: recargar o cerrar.
 * Salir por el menú lateral todavía no se intercepta: requiere migrar a un
 * "data router" de React Router para usar `useBlocker` (pendiente).
 */
export function useAvisoAlSalir(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [activo]);
}
