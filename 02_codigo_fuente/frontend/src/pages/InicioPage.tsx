import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { api } from "@/services/api";

interface EstadoSalud {
  status: string;
  database: string;
}

export function InicioPage() {
  const { usuario } = useAuth();
  const [salud, setSalud] = useState<EstadoSalud | null>(null);

  // Comprobación visible de que el frontend habla con el backend
  useEffect(() => {
    api
      .get<EstadoSalud>("/health/db")
      .then(({ data }) => setSalud(data))
      .catch(() => setSalud({ status: "error", database: "sin conexión" }));
  }, []);

  const conectado = salud?.status === "ok";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-acero-900">
        Hola, {usuario?.nombre.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-acero-500">
        Sistema de gestión y cotización de estructuras fotovoltaicas
      </p>

      <div className="mt-8 rounded-xl border border-acero-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-acero-700">Estado del sistema</h2>

        <div className="mt-4 flex items-center gap-3">
          <span
            className={[
              "h-2.5 w-2.5 rounded-full",
              salud === null ? "bg-acero-300" : conectado ? "bg-green-500" : "bg-red-500",
            ].join(" ")}
          />
          <span className="text-sm text-acero-600">
            {salud === null
              ? "Comprobando conexión…"
              : conectado
                ? "Base de datos conectada"
                : "Sin conexión a la base de datos"}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-acero-300 bg-white p-6">
        <h2 className="text-sm font-semibold text-acero-700">Próximos módulos</h2>
        <p className="mt-2 text-sm text-acero-500">
          Las pantallas de cada módulo se irán habilitando conforme avancen los sprints.
          Puedes seguir el plan en <code className="rounded bg-acero-100 px-1.5 py-0.5 text-xs">docs/ROADMAP.md</code>.
        </p>
      </div>
    </div>
  );
}
