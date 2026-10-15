/**
 * Protección de cambios sin guardar.
 *
 * Mientras `hayCambios` sea true:
 *   - cualquier navegación dentro de la aplicación (menú lateral, barra de
 *     pasos, Anterior/Cancelar, atrás del navegador) pide confirmación;
 *   - recargar o cerrar la pestaña también (el texto lo pone el navegador);
 *   - "Salir" (cerrar sesión) pregunta antes, vía `hayCambiosPendientes()`.
 *
 * Usa `useBlocker`, que exige el "data router" de App.tsx. React Router
 * admite un solo bloqueador activo: solo las páginas lo usan; los
 * componentes internos (p. ej. el encabezado) avisan sus cambios a la
 * página.
 */

import { useCallback, useEffect, useRef } from "react";
import { useBlocker, useLocation } from "react-router-dom";

const MENSAJE = "Hay cambios sin guardar. Si sales ahora se pierden. ¿Salir de todas formas?";

// Cuántas pantallas montadas tienen cambios sin guardar (lo consulta "Salir")
let pendientes = 0;

export function hayCambiosPendientes(): boolean {
  return pendientes > 0;
}

/**
 * Devuelve `permitirSalida()`: llamarlo justo antes de navegar después de
 * guardar. Hace falta porque al navegar en la misma función que guardó,
 * React todavía no volvió a calcular `hayCambios` y la salida se bloquearía.
 */
export function useCambiosSinGuardar(hayCambios: boolean, mensaje = MENSAJE): () => void {
  const permitida = useRef(false);
  const { pathname } = useLocation();

  // Una salida permitida vale para una sola navegación
  useEffect(() => {
    permitida.current = false;
  }, [pathname]);

  const bloqueador = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hayCambios && !permitida.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (bloqueador.state !== "blocked") return;
    if (window.confirm(mensaje)) bloqueador.proceed();
    else bloqueador.reset();
  }, [bloqueador, mensaje]);

  useEffect(() => {
    if (!hayCambios) return;
    pendientes += 1;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => {
      pendientes -= 1;
      window.removeEventListener("beforeunload", avisar);
    };
  }, [hayCambios]);

  return useCallback(() => {
    permitida.current = true;
  }, []);
}
