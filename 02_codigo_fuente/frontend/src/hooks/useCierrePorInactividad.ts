import { useEffect, useRef } from "react";

/**
 * Cierre de sesión por inactividad — RF-11 y RNF-04 ("las sesiones
 * expiran tras 30 minutos de inactividad").
 *
 * El token del backend dura 8 horas como máximo absoluto; esto agrega el
 * corte por inactividad, que depende de lo que hace la persona frente a
 * la pantalla y por eso se resuelve en el navegador.
 *
 * - Cuenta como actividad: teclado, clic, rueda, toque y mover el mouse.
 * - La última actividad se comparte entre pestañas por localStorage:
 *   trabajar en una pestaña mantiene viva la sesión en las demás, igual
 *   que el token, que también es compartido.
 * - La escritura en localStorage se espacia (como mucho una cada 15 s)
 *   para no escribir en cada movimiento del mouse.
 * - Se revisa cada 30 s; el cierre ocurre a más tardar 30 s después del
 *   límite, que es suficiente para una sesión de trabajo.
 */

export const MINUTOS_INACTIVIDAD = 30;
const CLAVE_ACTIVIDAD = "solarquote_ultima_actividad";
const EVENTOS = ["keydown", "mousedown", "mousemove", "wheel", "touchstart", "scroll"] as const;
const INTERVALO_REVISION_MS = 30_000;
const INTERVALO_ESCRITURA_MS = 15_000;

function leerCompartida(): number {
  try {
    return Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || 0;
  } catch {
    return 0;
  }
}

function escribirCompartida(momento: number): void {
  try {
    localStorage.setItem(CLAVE_ACTIVIDAD, String(momento));
  } catch {
    // Sin storage, cada pestaña cuenta su propia inactividad
  }
}

export function useCierrePorInactividad(
  activo: boolean,
  alVencer: () => void,
  minutos: number = MINUTOS_INACTIVIDAD,
): void {
  const callback = useRef(alVencer);
  useEffect(() => {
    callback.current = alVencer;
  }, [alVencer]);

  useEffect(() => {
    if (!activo) return;
    const limite = minutos * 60_000;
    let ultima = Date.now();
    let ultimaEscrita = 0;
    escribirCompartida(ultima);

    const registrar = () => {
      ultima = Date.now();
      if (ultima - ultimaEscrita >= INTERVALO_ESCRITURA_MS) {
        ultimaEscrita = ultima;
        escribirCompartida(ultima);
      }
    };

    const revisar = () => {
      const referencia = Math.max(ultima, leerCompartida());
      if (Date.now() - referencia >= limite) callback.current();
    };

    EVENTOS.forEach((evento) => window.addEventListener(evento, registrar, { passive: true }));
    const intervalo = window.setInterval(revisar, INTERVALO_REVISION_MS);
    // Al volver a la pestaña después de un rato (el navegador frena los intervalos en segundo plano)
    document.addEventListener("visibilitychange", revisar);
    return () => {
      EVENTOS.forEach((evento) => window.removeEventListener(evento, registrar));
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [activo, minutos]);
}
