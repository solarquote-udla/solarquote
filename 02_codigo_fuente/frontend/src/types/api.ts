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
