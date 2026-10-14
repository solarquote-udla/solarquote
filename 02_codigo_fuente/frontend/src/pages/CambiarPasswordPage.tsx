/**
 * Cambio de contraseña (RF-11).
 *
 * Dos casos:
 *   - Obligatorio: el usuario entró con la contraseña temporal que le
 *     asignó el administrador. Hasta cambiarla, el backend le niega todo
 *     lo demás, y RutaProtegida lo trae aquí.
 *   - Voluntario: desde el enlace "Cambiar contraseña" del encabezado.
 *
 * La política se valida también aquí (utils/password.ts) para avisar antes
 * de enviar, pero la que manda es la del backend.
 */

import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { mensajeDeError } from "@/services/api";
import { problemaDePassword } from "@/utils/password";

const claseCampo =
  "w-full rounded-lg border border-acero-300 px-3 py-2 text-sm outline-none transition focus:border-solar-500 focus:ring-2 focus:ring-solar-200";

export function CambiarPasswordPage() {
  const { usuario, cargando, cambiarPassword, cerrarSesion } = useAuth();
  const navegar = useNavigate();

  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (cargando) return null;
  if (usuario === null) return <Navigate to="/login" replace />;

  const obligatorio = usuario.debe_cambiar_password;
  const problema = nueva ? problemaDePassword(nueva) : null;
  const noCoinciden = confirmacion.length > 0 && confirmacion !== nueva;

  async function manejarEnvio(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    const motivo = problemaDePassword(nueva) ?? (nueva !== confirmacion ? "Las contraseñas no coinciden" : null);
    if (motivo) {
      setError(motivo);
      return;
    }

    setEnviando(true);
    try {
      await cambiarPassword({ password_actual: actual, password_nueva: nueva });
      void navegar("/", { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo cambiar la contraseña"));
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
        </div>

        <form
          onSubmit={(e) => void manejarEnvio(e)}
          className="rounded-xl border border-acero-200 bg-superficie p-8 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-acero-800">
            {obligatorio ? "Crea tu contraseña" : "Cambiar contraseña"}
          </h2>
          <p className="mt-1 mb-6 text-sm text-acero-500">
            {obligatorio
              ? `Hola, ${usuario.nombre.split(" ")[0]}. Ingresaste con una contraseña temporal; elige una nueva para continuar.`
              : "Al cambiarla se cierran tus sesiones abiertas en otros equipos."}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <label className="mb-4 block text-sm font-medium text-acero-700">
            {obligatorio ? "Contraseña temporal" : "Contraseña actual"}
            <input
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              autoComplete="current-password"
              autoFocus
              className={`mt-1.5 ${claseCampo}`}
            />
          </label>

          <label className="mb-4 block text-sm font-medium text-acero-700">
            Nueva contraseña
            <input
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              required
              autoComplete="new-password"
              className={`mt-1.5 ${claseCampo}`}
            />
            <span className={`mt-1 block text-xs font-normal ${problema ? "text-red-600" : "text-acero-500"}`}>
              {problema ?? "Mínimo 8 caracteres, con letras y números"}
            </span>
          </label>

          <label className="mb-6 block text-sm font-medium text-acero-700">
            Repite la nueva contraseña
            <input
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
              autoComplete="new-password"
              className={`mt-1.5 ${claseCampo}`}
            />
            {noCoinciden && (
              <span className="mt-1 block text-xs font-normal text-red-600">Las contraseñas no coinciden</span>
            )}
          </label>

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-solar-500 px-4 py-2.5 text-sm font-semibold text-acero-50 transition hover:bg-solar-600 focus:ring-2 focus:ring-solar-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Guardando…" : "Guardar contraseña"}
          </button>

          <div className="mt-4 text-center text-sm">
            {obligatorio ? (
              <button type="button" onClick={cerrarSesion} className="text-acero-500 hover:underline">
                Salir
              </button>
            ) : (
              <Link to="/" className="text-acero-500 hover:underline">
                Cancelar
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
