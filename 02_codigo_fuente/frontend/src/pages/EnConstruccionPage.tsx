/**
 * Marcador temporal para los módulos que todavía no se desarrollan.
 * Se reemplaza por la pantalla real cuando le toque su sprint.
 */

interface Props {
  titulo: string;
  modulo: string;
  requerimientos: string;
  sprint: string;
}

export function EnConstruccionPage({ titulo, modulo, requerimientos, sprint }: Props) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-acero-900">{titulo}</h1>
      <p className="mt-1 text-sm text-acero-500">{modulo}</p>

      <div className="mt-8 rounded-xl border border-dashed border-acero-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-acero-700">En desarrollo</p>
        <p className="mt-2 text-sm text-acero-500">
          Cubre {requerimientos}. Planificado para el {sprint}.
        </p>
      </div>
    </div>
  );
}
