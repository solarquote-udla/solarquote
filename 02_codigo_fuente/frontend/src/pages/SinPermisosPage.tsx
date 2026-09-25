import { Link } from "react-router-dom";

export function SinPermisosPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-acero-50 px-4 text-center">
      <p className="text-5xl font-bold text-acero-300">403</p>
      <h1 className="text-xl font-semibold text-acero-800">No tienes permisos</h1>
      <p className="max-w-sm text-sm text-acero-500">
        Tu rol no tiene acceso a esta sección. Si crees que es un error, contacta al
        Gerente General.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-lg bg-solar-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-solar-600"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
