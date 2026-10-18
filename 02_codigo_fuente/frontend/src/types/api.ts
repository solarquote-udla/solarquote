/**
 * Tipos que reflejan los schemas Pydantic del backend.
 *
 * IMPORTANTE: si cambia un schema en `backend/app/schemas/`, hay que
 * actualizar el tipo correspondiente aquí. TypeScript no lo detecta solo.
 */

/**
 * Espejo de `Permiso` en backend/app/core/permisos.py (RF-11).
 * Cada permiso es una opción del menú; el Dashboard lo ve todo usuario.
 */
export const Permiso = {
  GENERAR_LAYOUT: "generar_layout",
  CARGAR_BOCETO: "cargar_boceto",
  HISTORIAL: "historial",
  DESPACHO: "despacho",
  RECEPCION: "recepcion",
  CLIENTES: "clientes",
  INVERSORES: "inversores",
  MATERIALES: "materiales",
  PRECIOS: "precios",
  PERFILES: "perfiles",
  USUARIOS: "usuarios",
} as const;

export type Permiso = (typeof Permiso)[keyof typeof Permiso];

/** Espejo de `PermisoLeer`: una opción del catálogo */
export interface PermisoCatalogo {
  codigo: Permiso;
  nombre: string;
  grupo: "CÁLCULO" | "OPERACIONES" | "CONFIGURACIÓN";
  descripcion: string;
}

/** Espejo de `PerfilResumen` */
export interface PerfilResumen {
  id: number;
  nombre: string;
  es_sistema: boolean;
  acceso_total: boolean;
}

/** Espejo de `PerfilLeer` */
export interface Perfil extends PerfilResumen {
  descripcion: string | null;
  permisos: Permiso[];
  total_usuarios: number;
}

/** Espejo de `PerfilCrear` / `PerfilActualizar` */
export interface PerfilGuardar {
  nombre?: string;
  descripcion?: string | null;
  permisos?: Permiso[];
}

/** "pendiente": todavía no cambia su contraseña temporal */
export type EstadoUsuario = "activo" | "pendiente" | "inactivo";

/** Espejo de `UsuarioLeer` */
export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  perfil: PerfilResumen;
  activo: boolean;
  debe_cambiar_password: boolean;
  ultimo_acceso: string | null;
  created_at: string;
  estado: EstadoUsuario;
  bloqueado: boolean;
}

/** Espejo de `UsuarioSesion`: el usuario autenticado con sus permisos */
export interface UsuarioSesion extends Usuario {
  permisos: Permiso[];
}

/** Espejo de `UsuarioCrear` */
export interface UsuarioCrear {
  nombre: string;
  email: string;
  password_temporal: string;
  perfil_id: number;
}

/** Espejo de `UsuarioActualizar` */
export interface UsuarioActualizar {
  nombre?: string;
  email?: string;
  perfil_id?: number;
  activo?: boolean;
}

/** Espejo de `CambioPassword` */
export interface CambioPassword {
  password_actual: string;
  password_nueva: string;
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
  usuario: UsuarioSesion;
}

/** Forma de los errores que devuelve FastAPI */
export interface ErrorApi {
  detail: string | { msg: string; loc: (string | number)[] }[];
}

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

/** Espejo de `TipoIdentificacion` en backend/app/models/cliente.py */
export const TipoIdentificacion = {
  CEDULA: "cedula",
  RUC: "ruc",
  PASAPORTE: "pasaporte",
} as const;

export type TipoIdentificacion = (typeof TipoIdentificacion)[keyof typeof TipoIdentificacion];

export const ETIQUETAS_TIPO_IDENTIFICACION: Record<TipoIdentificacion, string> = {
  [TipoIdentificacion.CEDULA]: "Cédula",
  [TipoIdentificacion.RUC]: "RUC",
  [TipoIdentificacion.PASAPORTE]: "Pasaporte",
};

/** Espejo de `ClienteLeer` (backend/app/schemas/cliente.py). Ver CONTRATO-CLIENTES.md */
export interface Cliente {
  id: number;
  nombre: string;
  tipo_identificacion: TipoIdentificacion;
  identificacion: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  /** Calculado con un COUNT en el backend */
  total_proyectos: number;
  created_at: string;
  updated_at: string;
}

/** Espejo de `ClienteCrear` */
export interface ClienteCrear {
  nombre: string;
  tipo_identificacion: TipoIdentificacion;
  identificacion: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
}

/** Espejo de `ClienteActualizar`: PATCH parcial, más la reactivación */
export type ClienteActualizar = Partial<ClienteCrear> & { activo?: boolean };

/** Espejo de `ClienteResumen` (backend/app/schemas/proyecto.py) */
export interface ClienteResumen {
  id: number;
  nombre: string;
  identificacion: string;
}

// ─── Materiales y precios (RF-09) ───────────────────────

/** Espejo de `MaterialLeer` (backend/app/schemas/material.py) */
export interface Material {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  activo: boolean;
  /** null si el material todavía no tiene un precio registrado */
  precio_vigente: string | null;
  vigente_desde: string | null;
}

/** Espejo de `PrecioMaterialLeer`: una fila del historial de un material */
export interface PrecioMaterial {
  id: number;
  precio: string;
  vigente_desde: string;
  /** null mientras este precio siga vigente */
  vigente_hasta: string | null;
  created_at: string;
}

// ─── Catálogo de inversores (RF-08) ─────────────────────
// No confundir con `Inversor` (snapshot que guarda ConfiguracionEquipo,
// más abajo): este es el catálogo administrable en Configuración.

/** Espejo de `InversorLeer` (backend/app/schemas/inversor.py) */
export interface InversorCatalogo {
  id: number;
  marca: string;
  modelo: string;
  potencia_kw: number;
  vmax_v: number | null;
  vmin_v: number | null;
  mppts: number | null;
  strings_por_mppt: number | null;
  activo: boolean;
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
  /** Panel e inversor guardados (RF-02) */
  tiene_equipo: boolean;
  /** Layout generado (RF-03) */
  tiene_layout: boolean;
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

/**
 * Espejo de `ProyectoActualizar` (PATCH parcial). Omitir un campo lo deja
 * igual; enviarlo en null lo borra. Cliente y estado no se editan.
 */
export interface ProyectoActualizar {
  nombre?: string;
  ubicacion?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  notas?: string | null;
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

/** Espejo de `MAX_INVERSORES` (backend/app/schemas/equipo.py) */
export const MAX_INVERSORES = 50;

/** Espejo de `ConfiguracionEquipoGuardar` */
export interface ConfiguracionEquipoGuardar {
  panel: Panel;
  angulo_montaje: number;
  /** En orden: el primero es el Inversor 1 */
  inversores: Inversor[];
  /** Potencia que pide el cliente; con ella se sugiere cuántos inversores usar */
  potencia_objetivo_kwp: number | null;
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

/** Espejo de `SugerenciaLeer`: la "Sugerencia automática" del Paso 2 */
export interface SugerenciaInversores {
  paneles: number;
  potencia_kwp: number;
  inversores: number;
  paneles_por_inversor: number;
  kwp_por_inversor: number;
}

/** Espejo de `CalculosEquipo` */
export interface CalculosEquipo {
  area_panel_m2: number;
  separacion: SeparacionFilas | null;
  /** Uno por inversor, en el mismo orden; null si le faltan los voltajes */
  strings: (LimitesString | null)[];
  sugerencia: SugerenciaInversores | null;
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
  /** Inversor al que va conectado: 0 = Inversor 1 */
  inversor: number;
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

/**
 * Espejo de `InversorLayoutLeer`: un inversor con sus bloques y strings.
 * Los campos eléctricos son nulos cuando faltan datos del inversor.
 */
export interface InversorLayout {
  /** 1 = Inversor 1 */
  numero: number;
  marca: string;
  modelo: string;
  potencia_kw: number;
  bloques: number;
  paneles: number;
  potencia_kwp: number;
  relacion_dc_ac: number | null;
  paneles_por_string_min: number | null;
  paneles_por_string_max: number | null;
  paneles_por_string: number | null;
  strings: number | null;
  paneles_sin_string: number | null;
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
  inversores: InversorLayout[];
  /** Regla de HEXtructure: ~400 paneles por inversor */
  inversores_sugeridos: number;
  advertencias: string[];
  /** Grados del norte usados al generar; la edición arma los bloques con este ángulo */
  angulo_norte: number;
  /** Lo que suma cada panel de A al bloque, en metros */
  lado_menor_m: number;
  /** Cambios hechos a mano desde la última generación (SQ-64) */
  ediciones_manuales: number;
  /** Terreno, caminos, equipo o latitud cambiaron después de generar */
  desactualizado: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Cotizaciones (RF-10 y RF-13) ───────────────────────

/** Espejo de `EstadoCotizacion` en backend/app/models/cotizacion.py */
export const EstadoCotizacion = {
  COTIZADA: "cotizada",
  DESPACHADA: "despachada",
  RECIBIDA: "recibida",
  INSTALADA: "instalada",
} as const;

export type EstadoCotizacion = (typeof EstadoCotizacion)[keyof typeof EstadoCotizacion];

export const ETIQUETAS_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  [EstadoCotizacion.COTIZADA]: "Cotizada",
  [EstadoCotizacion.DESPACHADA]: "Despachada",
  [EstadoCotizacion.RECIBIDA]: "Recibida",
  [EstadoCotizacion.INSTALADA]: "Instalada",
};

/** Espejo de `CotizacionResumenLeer`: una fila del historial */
export interface CotizacionResumen {
  id: number;
  numero_proforma: string | null;
  estado: EstadoCotizacion;
  cliente_nombre: string;
  cliente_empresa: string | null;
  proyecto_id: number | null;
  proyecto_nombre: string | null;
  total: string | null;
  created_at: string;
}

/** Espejo de `CotizacionesPaginaLeer` */
export interface CotizacionesPagina {
  resultados: CotizacionResumen[];
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
}

/** Espejo de `ItemCotizacionLeer` */
export interface ItemCotizacion {
  paneles_largo: number;
  paneles_ancho: number;
  bloques: number;
}

/** Espejo de `MaterialCotizadoLeer`: tal como se emitió, no el catálogo actual */
export interface MaterialCotizado {
  material_id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: string;
}

/** Espejo de `CotizacionDetalleLeer` */
export interface CotizacionDetalle {
  id: number;
  numero_proforma: string | null;
  estado: EstadoCotizacion;

  cliente_id: number | null;
  cliente_nombre: string;
  cliente_empresa: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;

  proyecto_id: number | null;
  proyecto_nombre: string | null;

  addendum_porcentaje: string;
  subtotal: string | null;
  addendum_monto: string | null;
  iva_porcentaje: string | null;
  iva_monto: string | null;
  total: string | null;

  created_at: string;
  updated_at: string;

  items: ItemCotizacion[];
  materiales: MaterialCotizado[];
}

export interface CotizacionesPorPeriodo {
  periodo: string; // "AAAA-MM", en hora de Ecuador
  cantidad: number;
  total: string;
}

export interface CotizacionesPorEstado {
  estado: EstadoCotizacion;
  cantidad: number;
}

export interface ClienteFrecuente {
  cliente_nombre: string;
  cantidad: number;
}

export interface MaterialConsumido {
  material_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
}

export interface ResumenTablero {
  total_cotizaciones: number;
  monto_total: string;
  paneles_cotizados: number;
}

export interface Tablero {
  resumen: ResumenTablero;
  cotizaciones_por_periodo: CotizacionesPorPeriodo[];
  cotizaciones_por_estado: CotizacionesPorEstado[];
  clientes_frecuentes: ClienteFrecuente[];
  materiales_mas_consumidos: MaterialConsumido[];
}
