/**
 * Política de contraseñas (RF-11). Copia de `_validar_politica` en
 * backend/app/schemas/usuario.py: aquí solo sirve para avisar antes de
 * enviar; la que manda es la del backend.
 */
export function problemaDePassword(password: string): string | null {
  if (password.length < 8) return "Debe tener al menos 8 caracteres";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Debe tener al menos una letra y un número";
  if (password.trim() !== password) return "No puede empezar ni terminar con espacios";
  return null;
}
