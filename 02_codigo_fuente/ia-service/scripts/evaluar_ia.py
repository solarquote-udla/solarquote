"""
Evaluación de la IA con casos reales de HEXtructure — RNF-01 y RNF-03.

Mide lo que las pruebas automatizadas no pueden medir: qué tan bien lee
la IA los bocetos reales (y los planos DXF) y qué tan bien cuenta las
varillas en fotos reales. Cada caso tiene su respuesta correcta, que da
HEXtructure: para un boceto, los bloques L, A y B de la proforma que se
emitió con él; para una foto, las varillas contadas a mano.

Uso (desde 02_codigo_fuente/ia-service, con el venv activado y la clave
de Anthropic en el .env; los DXF no necesitan clave):

    python -m scripts.evaluar_ia bocetos  ruta/a/carpeta_bocetos  [--repeticiones 3]
    python -m scripts.evaluar_ia conteo   ruta/a/carpeta_fotos    [--repeticiones 3]

Cada carpeta lleva los archivos y un `esperado.json` (formato en
03_pruebas/aceptacion/PROTOCOLO-ACEPTACION.md). El resultado se imprime y
se guarda en la misma carpeta: `resultados_<modo>.csv` (una fila por
ejecución) y `resultados_<modo>.json` (con lo que devolvió la IA, para
revisar los errores uno por uno).

El script llama a las mismas funciones que el endpoint, sin pasar por
HTTP: mide la lectura de la IA, no la red. Cada ejecución con PDF, imagen
o foto consume créditos de la API de Anthropic.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.services.conteo import contar_varillas  # noqa: E402
from app.services.dxf import interpretar_dxf  # noqa: E402
from app.services.formato import detectar_formato  # noqa: E402
from app.services.ia import interpretar_con_ia  # noqa: E402

# Criterios de la especificación (sección 2.1.3 del documento)
META_DETECCION = 0.90  # RNF-01: detección correcta de bloques >= 90 %
LIMITE_SEGUNDOS = 30.0  # RNF-03: boceto procesado en <= 30 s

# Precio de lista del modelo, en USD por millón de tokens. Se puede
# cambiar con --precio-entrada y --precio-salida si cambia la tarifa.
PRECIO_ENTRADA = 2.0
PRECIO_SALIDA = 10.0


class CasoInvalido(ValueError):
    """El esperado.json no tiene el formato acordado."""


# ─── Comparación de un boceto ─────────────────────────────────────────


@dataclass
class ComparacionBoceto:
    bloques_esperados: int
    bloques_correctos: int
    bloques_sobrantes: int
    tipos_esperados: int
    tipos_correctos: int
    orientaciones_correctas: int
    paneles_esperados: int
    paneles_detectados: int
    exacto: bool
    diferencias: list[str] = field(default_factory=list)

    @property
    def error_paneles(self) -> float:
        if not self.paneles_esperados:
            return 0.0
        return abs(self.paneles_detectados - self.paneles_esperados) / self.paneles_esperados


def _agrupar(bloques: list[dict]) -> dict[tuple[int, int], dict]:
    """
    Suma las repeticiones de los bloques con el mismo L y A: si la IA
    parte un tipo en dos filas (4×24 ×5 y 4×24 ×3), para los materiales es
    lo mismo que 4×24 ×8, porque las fórmulas solo dependen de L, A y B.
    """
    grupos: dict[tuple[int, int], dict] = {}
    for b in bloques:
        clave = (int(b["L"]), int(b["A"]))
        g = grupos.setdefault(clave, {"B": 0, "orientaciones": set()})
        g["B"] += int(b["B"])
        if b.get("orientacion"):
            g["orientaciones"].add(b["orientacion"])
    return grupos


def comparar_boceto(esperados: list[dict], detectados: list[dict]) -> ComparacionBoceto:
    """
    Un bloque es correcto si la IA encontró su tipo (mismo L y A) y lo
    contó: con B esperados y B' detectados del mismo tipo, son correctos
    min(B, B'). Los que sobran (B' > B o tipos que no existen) se reportan
    aparte, porque inflan los materiales. Es la tasa del RNF-01.
    """
    esp, det = _agrupar(esperados), _agrupar(detectados)
    diferencias = []
    bloques_correctos = tipos_correctos = orientaciones = 0
    sobrantes = 0

    for (L, A), e in sorted(esp.items()):
        d = det.get((L, A))
        if d is None:
            diferencias.append(f"Falta el tipo {L}×{A} (B={e['B']})")
            continue
        bloques_correctos += min(e["B"], d["B"])
        sobrantes += max(0, d["B"] - e["B"])
        if d["B"] == e["B"]:
            tipos_correctos += 1
            # Orientación: cuenta si la IA dio la misma que el caso (o el caso no la fija)
            if not e["orientaciones"] or e["orientaciones"] == d["orientaciones"]:
                orientaciones += 1
            else:
                diferencias.append(
                    f"Tipo {L}×{A}: orientación {', '.join(sorted(d['orientaciones']))} "
                    f"en vez de {', '.join(sorted(e['orientaciones']))}"
                )
        else:
            diferencias.append(f"Tipo {L}×{A}: B={d['B']} en vez de {e['B']}")

    for (L, A), d in sorted(det.items()):
        if (L, A) not in esp:
            sobrantes += d["B"]
            diferencias.append(f"Sobra el tipo {L}×{A} (B={d['B']})")

    def paneles(grupos: dict[tuple[int, int], dict]) -> int:
        return sum(L * A * g["B"] for (L, A), g in grupos.items())

    return ComparacionBoceto(
        bloques_esperados=sum(g["B"] for g in esp.values()),
        bloques_correctos=bloques_correctos,
        bloques_sobrantes=sobrantes,
        tipos_esperados=len(esp),
        tipos_correctos=tipos_correctos,
        orientaciones_correctas=orientaciones,
        paneles_esperados=paneles(esp),
        paneles_detectados=paneles(det),
        exacto=not diferencias,
        diferencias=diferencias,
    )


# ─── Comparación de una foto ──────────────────────────────────────────


@dataclass
class ComparacionConteo:
    esperado: int
    detectado: int

    @property
    def error(self) -> int:
        return self.detectado - self.esperado

    @property
    def error_relativo(self) -> float:
        return abs(self.error) / self.esperado if self.esperado else float(self.detectado > 0)


# ─── Casos ────────────────────────────────────────────────────────────


def cargar_casos(carpeta: Path, modo: str) -> list[dict]:
    ruta = carpeta / "esperado.json"
    if not ruta.exists():
        raise CasoInvalido(f"No existe {ruta}. Copia la plantilla de 03_pruebas/aceptacion/plantillas.")
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    clave = "bocetos" if modo == "bocetos" else "fotos"
    casos = datos.get(clave)
    if not isinstance(casos, list) or not casos:
        raise CasoInvalido(f'esperado.json debe tener una lista "{clave}" con al menos un caso.')

    for n, caso in enumerate(casos, start=1):
        archivo = caso.get("archivo")
        if not archivo or not (carpeta / archivo).exists():
            raise CasoInvalido(f"Caso {n}: no existe el archivo {archivo!r} en {carpeta}.")
        if modo == "bocetos":
            bloques = caso.get("bloques")
            if not isinstance(bloques, list) or not bloques:
                raise CasoInvalido(f"Caso {n} ({archivo}): falta la lista de bloques esperados.")
            for b in bloques:
                if not all(isinstance(b.get(k), int) and b[k] >= 1 for k in ("L", "A", "B")):
                    raise CasoInvalido(f"Caso {n} ({archivo}): cada bloque necesita L, A y B enteros >= 1.")
                if b.get("orientacion") not in (None, "vertical", "horizontal"):
                    raise CasoInvalido(f"Caso {n} ({archivo}): orientación debe ser vertical u horizontal.")
        else:
            if not isinstance(caso.get("cantidad"), int) or caso["cantidad"] < 0:
                raise CasoInvalido(f"Caso {n} ({archivo}): falta la cantidad contada a mano.")
    return casos


# ─── Ejecución ────────────────────────────────────────────────────────


class _MedidorDeTokens:
    """Envuelve httpx.post para sumar los tokens que informa la API (no cambia la llamada)."""

    def __init__(self) -> None:
        self.entrada = 0
        self.salida = 0
        self._original = httpx.post

    def __enter__(self) -> "_MedidorDeTokens":
        def post(*args, **kwargs):
            respuesta = self._original(*args, **kwargs)
            try:
                uso = respuesta.json().get("usage", {})
                self.entrada += int(uso.get("input_tokens", 0))
                self.salida += int(uso.get("output_tokens", 0))
            except Exception:  # noqa: BLE001 — medir nunca debe romper la evaluación
                pass
            return respuesta

        httpx.post = post
        return self

    def __exit__(self, *_exc) -> None:
        httpx.post = self._original


def _a_dict(bloque) -> dict:
    return {
        "L": bloque.paneles_largo,
        "A": bloque.paneles_ancho,
        "B": bloque.repeticiones,
        "orientacion": bloque.orientacion,
        "confianza": bloque.confianza,
    }


def evaluar_bocetos(carpeta: Path, repeticiones: int) -> list[dict]:
    filas = []
    for caso in cargar_casos(carpeta, "bocetos"):
        contenido = (carpeta / caso["archivo"]).read_bytes()
        formato = detectar_formato(contenido)
        for corrida in range(1, repeticiones + 1):
            with _MedidorDeTokens() as tokens:
                inicio = time.perf_counter()
                try:
                    resultado = interpretar_dxf(contenido) if formato == "dxf" else interpretar_con_ia(contenido, formato)
                    error = None
                except Exception as exc:  # noqa: BLE001 — un caso fallido se registra y se sigue
                    resultado, error = None, f"{type(exc).__name__}: {exc}"
                segundos = time.perf_counter() - inicio
            detectados = [_a_dict(b) for b in resultado.bloques] if resultado else []
            comp = comparar_boceto(caso["bloques"], detectados)
            filas.append(
                {
                    "archivo": caso["archivo"],
                    "formato": formato,
                    "corrida": corrida,
                    "segundos": round(segundos, 2),
                    "error": error,
                    "tokens_entrada": tokens.entrada,
                    "tokens_salida": tokens.salida,
                    "detectados": detectados,
                    "advertencias": resultado.advertencias if resultado else [],
                    **{k: v for k, v in asdict(comp).items()},
                    "error_paneles": round(comp.error_paneles, 4),
                }
            )
    return filas


def evaluar_conteo(carpeta: Path, repeticiones: int) -> list[dict]:
    filas = []
    for caso in cargar_casos(carpeta, "conteo"):
        contenido = (carpeta / caso["archivo"]).read_bytes()
        formato = detectar_formato(contenido)
        for corrida in range(1, repeticiones + 1):
            with _MedidorDeTokens() as tokens:
                inicio = time.perf_counter()
                try:
                    resultado = contar_varillas(contenido, formato)
                    error = None
                except Exception as exc:  # noqa: BLE001
                    resultado, error = None, f"{type(exc).__name__}: {exc}"
                segundos = time.perf_counter() - inicio
            detectado = resultado.cantidad if resultado else 0
            comp = ComparacionConteo(esperado=caso["cantidad"], detectado=detectado)
            filas.append(
                {
                    "archivo": caso["archivo"],
                    "corrida": corrida,
                    "segundos": round(segundos, 2),
                    "error": error,
                    "tokens_entrada": tokens.entrada,
                    "tokens_salida": tokens.salida,
                    "esperado": comp.esperado,
                    "detectado": detectado,
                    "diferencia": comp.error,
                    "error_relativo": round(comp.error_relativo, 4),
                    "confianza": resultado.confianza if resultado else None,
                    "advertencias": resultado.advertencias if resultado else [],
                }
            )
    return filas


# ─── Resumen ──────────────────────────────────────────────────────────


def _costo(filas: list[dict], precio_entrada: float, precio_salida: float) -> float:
    return sum(f["tokens_entrada"] * precio_entrada + f["tokens_salida"] * precio_salida for f in filas) / 1_000_000


def resumen_bocetos(filas: list[dict], precio_entrada: float = PRECIO_ENTRADA, precio_salida: float = PRECIO_SALIDA) -> dict:
    validas = [f for f in filas if not f["error"]]
    esperados = sum(f["bloques_esperados"] for f in filas)
    tiempos = [f["segundos"] for f in validas]
    tasa = sum(f["bloques_correctos"] for f in filas) / esperados if esperados else 0.0
    return {
        "ejecuciones": len(filas),
        "fallidas": len(filas) - len(validas),
        "tasa_deteccion": tasa,
        "cumple_rnf01": tasa >= META_DETECCION,
        "bloques_sobrantes": sum(f["bloques_sobrantes"] for f in filas),
        "bocetos_exactos": sum(f["exacto"] for f in filas) / len(filas) if filas else 0.0,
        "tipos_correctos": sum(f["tipos_correctos"] for f in filas) / max(1, sum(f["tipos_esperados"] for f in filas)),
        "error_paneles_medio": statistics.mean(f["error_paneles"] for f in filas) if filas else 0.0,
        "segundos_medio": statistics.mean(tiempos) if tiempos else 0.0,
        "segundos_maximo": max(tiempos) if tiempos else 0.0,
        "dentro_de_30_s": sum(t <= LIMITE_SEGUNDOS for t in tiempos) / len(tiempos) if tiempos else 0.0,
        "costo_usd": _costo(filas, precio_entrada, precio_salida),
    }


def resumen_conteo(filas: list[dict], precio_entrada: float = PRECIO_ENTRADA, precio_salida: float = PRECIO_SALIDA) -> dict:
    validas = [f for f in filas if not f["error"]]
    tiempos = [f["segundos"] for f in validas]
    return {
        "ejecuciones": len(filas),
        "fallidas": len(filas) - len(validas),
        "exactas": sum(f["diferencia"] == 0 for f in validas) / len(validas) if validas else 0.0,
        "dentro_de_2_por_ciento": sum(f["error_relativo"] <= 0.02 for f in validas) / len(validas) if validas else 0.0,
        "error_absoluto_medio": statistics.mean(abs(f["diferencia"]) for f in validas) if validas else 0.0,
        "error_relativo_medio": statistics.mean(f["error_relativo"] for f in validas) if validas else 0.0,
        "segundos_medio": statistics.mean(tiempos) if tiempos else 0.0,
        "segundos_maximo": max(tiempos) if tiempos else 0.0,
        "costo_usd": _costo(filas, precio_entrada, precio_salida),
    }


def _pct(x: float) -> str:
    return f"{x * 100:.1f} %"


def imprimir(modo: str, filas: list[dict], resumen: dict) -> None:
    print()
    if modo == "bocetos":
        print(f"{'Archivo':40} {'Corr.':>5} {'Bloques':>9} {'Paneles':>15} {'Seg.':>6}  Diferencias")
        for f in filas:
            bloques = f"{f['bloques_correctos']}/{f['bloques_esperados']}"
            paneles = f"{f['paneles_detectados']}/{f['paneles_esperados']}"
            detalle = f["error"] or ("exacto" if f["exacto"] else "; ".join(f["diferencias"]))
            print(f"{f['archivo'][:40]:40} {f['corrida']:>5} {bloques:>9} {paneles:>15} {f['segundos']:>6.1f}  {detalle}")
        print()
        print(f"Tasa de detección de bloques (RNF-01, meta >= 90 %): {_pct(resumen['tasa_deteccion'])}"
              f"  -> {'CUMPLE' if resumen['cumple_rnf01'] else 'NO CUMPLE'}")
        print(f"Bloques sobrantes (inflan materiales):                {resumen['bloques_sobrantes']}")
        print(f"Bocetos leídos sin ninguna diferencia:                {_pct(resumen['bocetos_exactos'])}")
        print(f"Error medio en el total de paneles:                   {_pct(resumen['error_paneles_medio'])}")
        print(f"Tiempo medio / máximo (RNF-03, <= 30 s):              {resumen['segundos_medio']:.1f} s / "
              f"{resumen['segundos_maximo']:.1f} s ({_pct(resumen['dentro_de_30_s'])} dentro del límite)")
    else:
        print(f"{'Archivo':40} {'Corr.':>5} {'Esperado':>9} {'IA':>7} {'Dif.':>6} {'Seg.':>6}")
        for f in filas:
            print(f"{f['archivo'][:40]:40} {f['corrida']:>5} {f['esperado']:>9} {f['detectado']:>7} "
                  f"{f['diferencia']:>+6} {f['segundos']:>6.1f}  {f['error'] or ''}")
        print()
        print(f"Conteos exactos:                    {_pct(resumen['exactas'])}")
        print(f"Conteos con error <= 2 %:           {_pct(resumen['dentro_de_2_por_ciento'])}")
        print(f"Error absoluto medio:               {resumen['error_absoluto_medio']:.1f} varillas")
        print(f"Error relativo medio:               {_pct(resumen['error_relativo_medio'])}")
        print(f"Tiempo medio / máximo:              {resumen['segundos_medio']:.1f} s / {resumen['segundos_maximo']:.1f} s")
    print(f"Ejecuciones: {resumen['ejecuciones']} ({resumen['fallidas']} con error). "
          f"Costo estimado de la API: USD {resumen['costo_usd']:.4f}")


def guardar(carpeta: Path, modo: str, filas: list[dict], resumen: dict) -> None:
    (carpeta / f"resultados_{modo}.json").write_text(
        json.dumps({"resumen": resumen, "ejecuciones": filas}, ensure_ascii=False, indent=2, default=list),
        encoding="utf-8",
    )
    columnas = [k for k in filas[0] if k not in ("detectados", "advertencias", "diferencias")]
    with open(carpeta / f"resultados_{modo}.csv", "w", newline="", encoding="utf-8") as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=columnas + ["detalle"], extrasaction="ignore")
        escritor.writeheader()
        for f in filas:
            detalle = "; ".join(f.get("diferencias", [])) or "; ".join(f.get("advertencias", []))
            escritor.writerow({**f, "detalle": detalle})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evalúa la IA con casos reales (RNF-01 y RNF-03).")
    parser.add_argument("modo", choices=["bocetos", "conteo"])
    parser.add_argument("carpeta", type=Path)
    parser.add_argument("--repeticiones", type=int, default=1, help="Ejecuciones por caso (la IA puede variar).")
    parser.add_argument("--precio-entrada", type=float, default=PRECIO_ENTRADA, help="USD por millón de tokens de entrada.")
    parser.add_argument("--precio-salida", type=float, default=PRECIO_SALIDA, help="USD por millón de tokens de salida.")
    args = parser.parse_args(argv)

    if args.repeticiones < 1:
        parser.error("--repeticiones debe ser 1 o más.")
    try:
        if args.modo == "bocetos":
            filas = evaluar_bocetos(args.carpeta, args.repeticiones)
            resumen = resumen_bocetos(filas, args.precio_entrada, args.precio_salida)
        else:
            filas = evaluar_conteo(args.carpeta, args.repeticiones)
            resumen = resumen_conteo(filas, args.precio_entrada, args.precio_salida)
    except CasoInvalido as exc:
        print(f"Error en los casos: {exc}", file=sys.stderr)
        return 2

    imprimir(args.modo, filas, resumen)
    guardar(args.carpeta, args.modo, filas, resumen)
    print(f"Detalle guardado en {args.carpeta / f'resultados_{args.modo}.csv'} y .json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
