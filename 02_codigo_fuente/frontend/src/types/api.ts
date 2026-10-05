/**
 * Tipos que reflejan los schemas Pydantic del backend.
 *
 * IMPORTANTE: si cambia un schema en `backend/app/schemas/`, hay que
 * actualizar el tipo correspondiente aquí. TypeScript no lo detecta solo.
 */

/** Espejo de `RolUsuario` en backend/app/models/usuario.py */
export const RolUsuario = {
  GERENTE_GENERAL: "gerente_general",
  PERSONAL_PRODUCCION: "personal_produccion",
} as const;

export type RolUsuario = (typeof RolUsuario)[keyof typeof RolUsuario];

/** Espejo de `UsuarioLeer` */
export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
}

/** Espejo de `LoginPeticion` */
export interface LoginPeticion {
  email: string;
  password: string;
}

/** Espejo de `Token` */
export interface RespuestaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  usuario: Usuario;
}

/** Forma de los errores que devuelve FastAPI */
export interface ErrorApi {
  detail: string | { msg: string; loc: (string | number)[] }[];
}

/** Etiquetas legibles para mostrar en la interfaz */
export const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  [RolUsuario.GERENTE_GENERAL]: "Gerente General",
  [RolUsuario.PERSONAL_PRODUCCION]: "Personal de Producción",
};

// ─── Clientes ───────────────────────────────────────────

/**
 * Lo que la gestión de proyectos consume de `GET /api/clientes` (RF-12).
 *
 * Es el contrato acordado con el módulo de clientes: solo se leen estos
 * campos. Si RF-12 agrega más, no rompe nada aquí.
 */
export interface ClienteListado {
  id: number;
  nombre: string;
  identificacion: string;
  activo?: boolean;
}

/** Espejo de `ClienteResumen` (backend/app/schemas/proyecto.py) */
export interface ClienteResumen {
  id: number;
  nombre: string;
  identificacion: string;
}

// ─── Proyectos ──────────────────────────────────────────

/** Espejo de `EstadoProyecto` en backend/app/models/proyecto.py */
export const EstadoProyecto = {
  BORRADOR: "borrador",
  EN_DISENO: "en_diseno",
  DISENADO: "disenado",
  COTIZADO: "cotizado",
} as const;

export type EstadoProyecto = (typeof EstadoProyecto)[keyof typeof EstadoProyecto];

export const ETIQUETAS_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  [EstadoProyecto.BORRADOR]: "Borrador",
  [EstadoProyecto.EN_DISENO]: "En diseño",
  [EstadoProyecto.DISENADO]: "Diseñado",
  [EstadoProyecto.COTIZADO]: "Cotizado",
};

/** Espejo de `ProyectoLeer` */
export interface Proyecto {
  id: number;
  nombre: string;
  cliente: ClienteResumen;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  estado: EstadoProyecto;
  notas: string | null;
  tiene_terreno: boolean;
  created_at: string;
  updated_at: string;
}

/** Espejo de `ProyectoCrear` */
export interface ProyectoCrear {
  nombre: string;
  cliente_id: number;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
}

// ─── Terreno (Módulo 1 — RF-01) ─────────────────────────

/** Un vértice [x, y] en metros, relativo al origen local del terreno. */
export type Punto = [number, number];

/** Espejo de `TipoCamino` en backend/app/models/terreno.py */
export const TipoCamino = {
  ACCESO: "acceso",
  INTERNO: "interno",
  MANTENIMIENTO: "mantenimiento",
} as const;

export type TipoCamino = (typeof TipoCamino)[keyof typeof TipoCamino];

export const ETIQUETAS_TIPO_CAMINO: Record<TipoCamino, string> = {
  [TipoCamino.ACCESO]: "Acceso",
  [TipoCamino.INTERNO]: "Interno",
  [TipoCamino.MANTENIMIENTO]: "Mantenimiento",
};

/** Espejo de `CaminoCrear` */
export interface CaminoCrear {
  nombre: string | null;
  tipo: TipoCamino;
  vertices: Punto[];
}

/** Espejo de `CaminoLeer` */
export interface Camino extends CaminoCrear {
  id: number;
  terreno_id: number;
  created_at: string;
}

/** Espejo de `AreasTerreno`. Metros cuadrados. */
export interface AreasTerreno {
  area_bruta: number;
  area_caminos: number;
  area_util: number;
}

/** Espejo de `TerrenoLeer` */
export interface Terreno {
  id: number;
  proyecto_id: number;
  vertices: Punto[];
  orientacion_norte: number | null;
  notas: string | null;
  caminos: Camino[];
  areas: AreasTerreno;
  created_at: string;
  updated_at: string;
}

/** Espejo de `TerrenoCrear` */
export interface TerrenoCrear {
  vertices: Punto[];
  orientacion_norte: number | null;
  notas: string | null;
  caminos: CaminoCrear[];
}

/** Espejo de `TerrenoActualizar`. Todo opcional: PATCH parcial. */
export interface TerrenoActualizar {
  vertices?: Punto[];
  orientacion_norte?: number | null;
  notas?: string | null;
}

// ─── Equipo (Módulo 1 — RF-02) ──────────────────────────

/** Espejo de `Panel` (backend/app/schemas/equipo.py). Valores en STC. */
export interface Panel {
  marca: string;
  modelo: string;
  potencia_wp: number;
  largo_mm: number;
  ancho_mm: number;
  voc_v: number;
  vmp_v: number;
}

/** Espejo de `Inversor`. Los datos eléctricos son opcionales. */
export interface Inversor {
  marca: string;
  modelo: string;
  potencia_kw: number;
  vmax_v: number | null;
  vmin_v: number | null;
  mppts: number | null;
  strings_por_mppt: number | null;
}

/** Espejo de `ConfiguracionEquipoGuardar` */
export interface ConfiguracionEquipoGuardar {
  panel: Panel;
  angulo_montaje: number;
  inversor: Inversor;
}

/** Espejo de `SeparacionFilas`. Metros, para un panel en vertical. */
export interface SeparacionFilas {
  elevacion_solar_grados: number;
  altura_m: number;
  proyeccion_m: number;
  sombra_m: number;
  paso_minimo_m: number;
  factor_sombra: number;
}

/** Espejo de `LimitesStringLeer` */
export interface LimitesString {
  paneles_min: number;
  paneles_max: number;
  compatible: boolean;
  motivo: string | null;
}

/** Espejo de `CalculosEquipo` */
export interface CalculosEquipo {
  area_panel_m2: number;
  separacion: SeparacionFilas | null;
  strings: LimitesString | null;
  advertencias: string[];
}

/** Espejo de `ConfiguracionEquipoLeer` */
export interface ConfiguracionEquipo extends ConfiguracionEquipoGuardar {
  proyecto_id: number;
  calculos: CalculosEquipo;
  created_at: string;
  updated_at: string;
}

/** Espejo de `PanelReferenciaLeer` */
export interface PanelReferencia extends Panel {
  clave: string;
  fuente: string;
}

// ─── Layout (Módulo 1 — RF-03) ──────────────────────────

/** Espejo de `LayoutGenerar` (backend/app/schemas/layout.py) */
export interface LayoutGenerar {
  /** L: paneles en la dirección de la pendiente. Siempre par. */
  paneles_largo: number;
  pasillo_m: number;
  /** 0.2 = ±20 % respecto a ancho = 3 × largo */
  tolerancia_proporcion: number;
  capacidad_deseada_kwp: number | null;
}

/** Espejo de `BloqueLeer`. Vértices en metros, coordenadas del terreno. */
export interface BloqueLayout {
  vertices: Punto[];
  paneles_largo: number;
  paneles_ancho: number;
  paneles: number;
  proporcion: number;
  en_proporcion: boolean;
  tipo: string;
}

/** Espejo de `TipoBloqueLeer`: notación "Bloque A × N" */
export interface TipoBloque {
  tipo: string;
  paneles_largo: number;
  paneles_ancho: number;
  repeticiones: number;
  paneles: number;
  proporcion: number;
  en_proporcion: boolean;
}

/** Espejo de `CapacidadLeer` */
export interface CapacidadLayout {
  deseada_kwp: number;
  paneles_necesarios: number;
  cabe: boolean;
  maxima_kwp: number;
  instalada_kwp: number;
  remanente_kwp: number;
}

/** Espejo de `ElectricaLeer`. Nulos cuando faltan datos del inversor. */
export interface ElectricaLayout {
  paneles_por_string_min: number | null;
  paneles_por_string_max: number | null;
  paneles_por_string: number | null;
  strings_totales: number | null;
  paneles_sin_string: number | null;
  inversores: number;
  strings_por_mppt: number | null;
  compatible: boolean | null;
  motivo: string | null;
}

/** Espejo de `LayoutLeer` */
export interface Layout {
  proyecto_id: number;
  parametros: LayoutGenerar;
  bloques: BloqueLayout[];
  tipos: TipoBloque[];
  total_paneles: number;
  potencia_kwp: number;
  paneles_ancho_ideal: number;
  largo_bloque_m: number;
  ancho_bloque_m: number;
  separacion_este_oeste_m: number;
  separacion_norte_sur_m: number;
  area_util_m2: number;
  area_ocupada_m2: number;
  capacidad: CapacidadLayout | null;
  electrica: ElectricaLayout;
  advertencias: string[];
  /** Terreno, caminos, equipo o latitud cambiaron después de generar */
  desactualizado: boolean;
  created_at: string;
  updated_at: string;
}
