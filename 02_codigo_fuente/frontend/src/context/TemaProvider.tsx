/**
 * Proveedor de tema (claro/oscuro) — valor agregado sobre el prototipo.
 *
 * El prototipo de Figma define el diseño (pantallas, flujo); el modo de
 * color no es parte de eso, así que el oscuro sigue siendo el que ya
 * tenía la app (ver index.css) y el claro es la opción nueva.
 *
 * El tema se guarda en localStorage y se refleja en `<html data-tema>`:
 * `index.css` define los colores oscuros en `@theme` (sin atributo) y
 * los claros en `:root[data-tema="claro"]`, así que ningún componente
 * necesita saber qué tema está activo — solo usa `bg-acero-50`, etc.
 *
 * `index.html` tiene un script inline que lee el mismo valor antes de
 * que React monte, para que no haya un parpadeo oscuro→claro al cargar.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { TemaContext, type Tema } from "@/context/TemaContext";

const CLAVE_TEMA = "solarquote_tema";

function temaGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE_TEMA) === "claro" ? "claro" : "oscuro";
  } catch {
    // Storage bloqueado (p. ej. navegación privada en algunos navegadores)
    return "oscuro";
  }
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaGuardado);

  useEffect(() => {
    document.documentElement.setAttribute("data-tema", tema);
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
      // Sin storage, el tema no persiste entre recargas, pero la sesión actual sigue funcionando
    }
  }, [tema]);

  const alternarTema = useCallback(() => {
    setTema((actual) => (actual === "oscuro" ? "claro" : "oscuro"));
  }, []);

  const valor = useMemo<{ tema: Tema; alternarTema: () => void }>(
    () => ({ tema, alternarTema }),
    [tema, alternarTema],
  );

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}
