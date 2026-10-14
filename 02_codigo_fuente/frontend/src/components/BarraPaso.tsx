/**
 * Pie de cada paso del asistente: volver a la izquierda, un resumen en el
 * centro y avanzar a la derecha (prototipo: "Anterior · resumen · Siguiente").
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface Accion {
  etiqueta: string;
  /** Navega sin guardar */
  a?: string;
  onClick?: () => void;
  deshabilitado?: boolean;
  titulo?: string;
}

interface Props {
  atras: Accion;
  adelante: Accion;
  resumen?: ReactNode;
}

const BASE = "rounded-lg px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50";
const SECUNDARIO = `${BASE} border border-acero-300 text-acero-700 hover:bg-acero-100`;
const PRIMARIO = `${BASE} bg-solar-500 font-semibold text-acero-50 hover:bg-solar-600`;

function Boton({ accion, clase }: { accion: Accion; clase: string }) {
  if (accion.a && !accion.deshabilitado) {
    return (
      <Link to={accion.a} className={clase} title={accion.titulo}>
        {accion.etiqueta}
      </Link>
    );
  }
  return (
    <button type="button" className={clase} onClick={accion.onClick} disabled={accion.deshabilitado} title={accion.titulo}>
      {accion.etiqueta}
    </button>
  );
}

export function BarraPaso({ atras, adelante, resumen }: Props) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-acero-200 bg-superficie px-5 py-4">
      <Boton accion={atras} clase={SECUNDARIO} />
      <div className="min-w-0 flex-1 text-center text-sm text-acero-500">{resumen}</div>
      <Boton accion={adelante} clase={PRIMARIO} />
    </div>
  );
}
