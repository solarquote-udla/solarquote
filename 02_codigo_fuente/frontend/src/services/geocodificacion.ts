/**
 * Búsqueda de direcciones para el mapa del Paso 1 (OpenStreetMap,
 * Nominatim). Es un servicio gratuito con reglas de uso: una búsqueda por
 * acción del usuario (no mientras escribe) y la atribución visible. La URL
 * se puede cambiar con VITE_GEOCODER_URL.
 */

export interface ResultadoDireccion {
  nombre: string;
  latitud: number;
  longitud: number;
}

const URL_BUSQUEDA = import.meta.env.VITE_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search";

/** Los proyectos de HEXtructure están en Ecuador: se busca solo ahí. */
const PAISES = "ec";

export async function buscarDireccion(texto: string, signal?: AbortSignal): Promise<ResultadoDireccion[]> {
  const parametros = new URLSearchParams({
    q: texto,
    format: "jsonv2",
    limit: "5",
    countrycodes: PAISES,
    "accept-language": "es",
  });
  const respuesta = await fetch(`${URL_BUSQUEDA}?${parametros}`, { signal, headers: { Accept: "application/json" } });
  if (!respuesta.ok) throw new Error(`El buscador respondió ${respuesta.status}`);
  const datos = (await respuesta.json()) as { display_name: string; lat: string; lon: string }[];
  return datos.map((d) => ({ nombre: d.display_name, latitud: Number(d.lat), longitud: Number(d.lon) }));
}
