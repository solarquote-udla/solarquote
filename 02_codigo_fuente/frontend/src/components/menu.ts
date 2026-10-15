/**
 * Menú de la aplicación, con la estructura del prototipo de Figma.
 *
 * Cada opción declara el permiso que la habilita (RF-11). El Dashboard no
 * lleva permiso: lo ve todo usuario. El mismo permiso protege la ruta en
 * App.tsx y el endpoint en el backend.
 */

import { Permiso } from "@/types/api";

export interface OpcionMenu {
  ruta: string;
  etiqueta: string;
  /** Basta con uno; debe coincidir con el de la ruta en App.tsx */
  permiso?: Permiso | Permiso[];
}

export interface GrupoMenu {
  titulo: string | null;
  /** Subtítulo opcional dentro del grupo (p. ej. "Parametrización") */
  secciones: { titulo: string | null; opciones: OpcionMenu[] }[];
}

export const MENU: GrupoMenu[] = [
  {
    titulo: null,
    secciones: [{ titulo: null, opciones: [{ ruta: "/", etiqueta: "Dashboard" }] }],
  },
  {
    titulo: "CÁLCULO",
    secciones: [
      {
        titulo: "Generación",
        opciones: [
          { ruta: "/generar", etiqueta: "Generar layout solar", permiso: Permiso.GENERAR_LAYOUT },
          { ruta: "/bocetos", etiqueta: "Cargar boceto", permiso: Permiso.CARGAR_BOCETO },
        ],
      },
      {
        titulo: null,
        // Mismos permisos que la ruta: quien genera layouts retoma sus proyectos desde aquí
        opciones: [{ ruta: "/historial", etiqueta: "Historial", permiso: [Permiso.HISTORIAL, Permiso.GENERAR_LAYOUT] }],
      },
    ],
  },
  {
    titulo: "OPERACIONES",
    secciones: [
      {
        titulo: "Validación materiales",
        opciones: [
          { ruta: "/validacion/despacho", etiqueta: "Despacho en planta", permiso: Permiso.DESPACHO },
          { ruta: "/validacion/recepcion", etiqueta: "Recepción en terreno", permiso: Permiso.RECEPCION },
        ],
      },
      {
        titulo: null,
        opciones: [{ ruta: "/clientes", etiqueta: "Clientes", permiso: Permiso.CLIENTES }],
      },
    ],
  },
  {
    titulo: "CONFIGURACIÓN",
    secciones: [
      {
        titulo: "Parametrización",
        opciones: [
          { ruta: "/configuracion/inversores", etiqueta: "Inversores", permiso: Permiso.INVERSORES },
          { ruta: "/configuracion/materiales", etiqueta: "Materiales", permiso: Permiso.MATERIALES },
          { ruta: "/configuracion/precios", etiqueta: "Precios unitarios", permiso: Permiso.PRECIOS },
        ],
      },
      {
        titulo: "Seguridad",
        opciones: [
          { ruta: "/seguridad/perfiles", etiqueta: "Perfiles", permiso: Permiso.PERFILES },
          { ruta: "/seguridad/usuarios", etiqueta: "Usuarios", permiso: Permiso.USUARIOS },
        ],
      },
    ],
  },
];

/** Menú recortado a lo que el perfil permite; sin grupos ni secciones vacíos. */
export function menuVisible(tienePermiso: (...p: Permiso[]) => boolean): GrupoMenu[] {
  return MENU.map((grupo) => ({
    ...grupo,
    secciones: grupo.secciones
      .map((seccion) => ({
        ...seccion,
        opciones: seccion.opciones.filter((o) => !o.permiso || tienePermiso(...([] as Permiso[]).concat(o.permiso))),
      }))
      .filter((seccion) => seccion.opciones.length > 0),
  })).filter((grupo) => grupo.secciones.length > 0);
}
