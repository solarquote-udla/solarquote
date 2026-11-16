/**
 * Búsqueda del catálogo de paneles en el Paso 2: cada palabra escrita debe
 * aparecer en la marca, el modelo o la potencia. "jinko 580" encuentra el
 * Jinko de 580 Wp; "580" encuentra todos los de 580 Wp.
 */
import type { PanelCatalogo } from "@/types/api";

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filtrarPaneles(paneles: PanelCatalogo[], texto: string): PanelCatalogo[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return paneles;
  return paneles.filter((p) => {
    const campos = normalizar(`${p.marca} ${p.modelo} ${p.potencia_wp} ${p.potencia_wp}wp`);
    return palabras.every((palabra) => campos.includes(palabra));
  });
}
