import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";

interface EstadoUbicacion {
  destino?: string;
}

export function LoginPage() {
  const { autenticado, iniciarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [parametros] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sesionExpirada = parametros.get("expirado") === "1";
  const destino = (ubicacion.state as EstadoUbicacion | null)?.destino ?? "/";

  if (autenticado) {
    return <Navigate to={destino} replace />;
  }

  async function manejarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await iniciarSesion(email, password);
      void navegar(destino, { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo iniciar sesión"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-acero-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-acero-900">
            Solar<span className="text-solar-500">Quote</span>
          </h1>
          <p className="mt-2 text-sm text-acero-500">
            Gestión y cotización de estructuras fotovoltaicas
          </p>
        </div>

        <form
          onSubmit={(e) => void manejarEnvio(e)}
          className="rounded-xl border border-acero-200 bg-white p-8 shadow-sm"
        >
          <h2 className="mb-6 text-lg font-semibold text-acero-800">Iniciar sesión</h2>

          {sesionExpirada && !error && (
            <div className="mb-4 rounded-lg border border-solar-200 bg-solar-50 px-4 py-3 text-sm text-solar-800">
              Tu sesión expiró. Vuelve a iniciar sesión.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-acero-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              placeholder="usuario@hextructure.com"
              className="w-full rounded-lg border border-acero-300 px-3 py-2 text-sm outline-none transition focus:border-solar-500 focus:ring-2 focus:ring-solar-200"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-acero-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-acero-300 px-3 py-2 text-sm outline-none transition focus:border-solar-500 focus:ring-2 focus:ring-solar-200"
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-solar-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-solar-600 focus:ring-2 focus:ring-solar-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-acero-400">
          HEXtructure S.A.S. · Proyecto Capstone UDLA
        </p>
      </div>
    </div>
  );
}
