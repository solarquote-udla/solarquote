/**
 * Miniaturas de las fotos del despacho o de la recepción. Las fotos se
 * piden con el token (no son públicas), por eso se cargan como blob.
 */

import { useEffect, useState } from "react";

import { obtenerFoto } from "@/services/validacion";
import type { FotoValidacion } from "@/types/api";

interface Props {
  cotizacionId: number;
  fotos: FotoValidacion[];
  /** Código del material de cada foto del despacho */
  materialDe?: (materialId: number | null) => string | null;
}

export function FotosValidacion({ cotizacionId, fotos, materialDe }: Props) {
  const [urls, setUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelado = false;
    const creadas: string[] = [];
    Promise.all(
      fotos.map(async (f) => {
        try {
          const url = URL.createObjectURL(await obtenerFoto(cotizacionId, f.id));
          creadas.push(url);
          return [f.id, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((pares) => {
      if (!cancelado) setUrls(Object.fromEntries(pares.filter((p) => p !== null)));
    });
    return () => {
      cancelado = true;
      creadas.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [cotizacionId, fotos]);

  if (fotos.length === 0) return <p className="text-sm text-acero-500">Sin fotos.</p>;

  return (
    <ul className="flex flex-wrap gap-3">
      {fotos.map((f) => (
        <li key={f.id} className="w-36 overflow-hidden rounded-lg border border-acero-200 bg-acero-50 text-xs">
          {urls[f.id] ? (
            <a href={urls[f.id]} target="_blank" rel="noreferrer">
              <img src={urls[f.id]} alt={f.nombre_archivo} className="h-24 w-full object-cover" />
            </a>
          ) : (
            <div className="flex h-24 items-center justify-center text-acero-400">{f.nombre_archivo}</div>
          )}
          <div className="px-2 py-1 text-acero-600">
            <p className="truncate" title={f.nombre_archivo}>
              {f.nombre_archivo}
            </p>
            {materialDe && (
              <p className="text-acero-500">
                {materialDe(f.material_id) ?? "—"}
                {f.conteo_ia !== null && ` · IA: ${f.conteo_ia}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
