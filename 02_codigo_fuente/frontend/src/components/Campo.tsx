/**
 * Campo de formulario con su etiqueta, la marca de obligatorio y el error
 * junto al campo (revisión del 16 de noviembre).
 *
 * El error reemplaza a la ayuda mientras exista. El campo recibe
 * aria-invalid y queda descrito por el mensaje para los lectores de
 * pantalla.
 */
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function Obligatorio() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {" *"}
    </span>
  );
}

interface Props {
  etiqueta: ReactNode;
  obligatorio?: boolean;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Campo({ etiqueta, obligatorio, error, ayuda, className, children }: Props) {
  const id = useId();
  const idMensaje = `${id}-mensaje`;
  const hayMensaje = Boolean(error || ayuda);

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hayMensaje ? idMensaje : undefined,
      })
    : children;

  return (
    <label className={["block text-xs font-medium text-acero-600", className ?? ""].join(" ")}>
      {etiqueta}
      {obligatorio && <Obligatorio />}
      {control}
      {error ? (
        <span id={idMensaje} className="mt-1 block font-normal text-red-600">
          {error}
        </span>
      ) : (
        ayuda && (
          <span id={idMensaje} className="mt-1 block font-normal text-acero-400">
            {ayuda}
          </span>
        )
      )}
    </label>
  );
}
