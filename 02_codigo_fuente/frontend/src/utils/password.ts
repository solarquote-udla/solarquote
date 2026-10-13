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

/**
 * Contraseña temporal aleatoria que cumple la política: 10 caracteres con
 * letras y números, sin los que se confunden al dictarla (0/O, 1/l/I).
 * Usa crypto.getRandomValues, no Math.random.
 */
export function generarPasswordTemporal(longitud = 10): string {
  const letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "23456789";
  const todos = letras + digitos;
  const azar = new Uint32Array(longitud);
  crypto.getRandomValues(azar);
  const caracteres = Array.from(azar, (n) => todos[n % todos.length]);
  // Garantiza al menos una letra y un número
  caracteres[0] = letras[azar[0] % letras.length];
  caracteres[longitud - 1] = digitos[azar[longitud - 1] % digitos.length];
  return caracteres.join("");
}
