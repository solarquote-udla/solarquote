/** Borde y foco de un campo de formulario, en rojo si tiene error. */
export function bordeCampo(error?: string): string {
  return error
    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
    : "border-acero-300 focus:border-solar-500 focus:ring-solar-500";
}
