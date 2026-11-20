/**
 * Estado del formulario de condiciones de la proforma en la confirmación
 * (Paso 3 y boceto). Parte de los valores de la configuración; si no se
 * pueden cargar, la cotización se emite sin condiciones y el backend usa
 * esos mismos valores.
 */
import { useEffect, useMemo, useState } from "react";

import { obtenerCondicionesPorDefecto } from "@/services/condiciones";
import type { CondicionesProforma } from "@/types/api";
import { aCondiciones, desdeDefecto, erroresCondiciones, type FormularioCondiciones } from "@/utils/condiciones";

export interface EstadoCondiciones {
  /** null mientras carga o si no se pudo cargar */
  formulario: FormularioCondiciones | null;
  setFormulario: (f: FormularioCondiciones) => void;
  /** Valores de la configuración, para volver a ellos */
  porDefecto: FormularioCondiciones | null;
  errores: Record<string, string>;
  errorCarga: boolean;
  /** Lo que se manda al confirmar; undefined = las de la configuración */
  condiciones: CondicionesProforma | undefined;
}

export function useCondicionesProforma(): EstadoCondiciones {
  const [formulario, setFormulario] = useState<FormularioCondiciones | null>(null);
  const [porDefecto, setPorDefecto] = useState<FormularioCondiciones | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);

  useEffect(() => {
    let cancelado = false;
    obtenerCondicionesPorDefecto()
      .then((d) => {
        if (cancelado) return;
        const inicial = desdeDefecto(d);
        setPorDefecto(inicial);
        setFormulario(inicial);
      })
      .catch(() => {
        if (!cancelado) setErrorCarga(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const errores = useMemo(() => (formulario ? erroresCondiciones(formulario) : {}), [formulario]);
  const condiciones = formulario && Object.keys(errores).length === 0 ? aCondiciones(formulario) : undefined;

  return { formulario, setFormulario, porDefecto, errores, errorCarga, condiciones };
}
