/**
 * Interruptor de encendido/apagado (toggle), como en la pantalla de
 * Perfiles del prototipo. Es un <button role="switch"> para que funcione
 * con teclado y lectores de pantalla.
 */

interface Props {
  activo: boolean;
  onCambiar?: (activo: boolean) => void;
  deshabilitado?: boolean;
  etiqueta: string;
}

export function Interruptor({ activo, onCambiar, deshabilitado = false, etiqueta }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambiar?.(!activo)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-solar-300",
        activo ? "bg-solar-500" : "bg-acero-300",
        deshabilitado ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 rounded-full bg-acero-900 shadow transition",
          activo ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
