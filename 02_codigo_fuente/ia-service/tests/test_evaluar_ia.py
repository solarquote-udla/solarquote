"""
Evaluador de la IA con casos reales (scripts/evaluar_ia.py).

La lectura con IA no se prueba aquí (eso es justamente lo que el script
mide con la clave real); se prueba que las cuentas del script son las
correctas, porque de ellas salen las cifras del RNF-01 y del RNF-03 que
van al documento. Los DXF sí se leen de verdad: no usan la API.
"""

import json

import pytest

from app.core.config import settings
from scripts import evaluar_ia as ev
from tests.fabricas_dxf import crear_dxf


def _b(L, A, B, orientacion=None):
    bloque = {"L": L, "A": A, "B": B}
    if orientacion:
        bloque["orientacion"] = orientacion
    return bloque


# ─── comparar_boceto ──────────────────────────────────────────────────


def test_boceto_identico_es_exacto():
    c = ev.comparar_boceto([_b(4, 24, 8, "vertical")], [_b(4, 24, 8, "vertical")])
    assert c.exacto
    assert (c.bloques_correctos, c.bloques_esperados, c.bloques_sobrantes) == (8, 8, 0)
    assert c.paneles_esperados == c.paneles_detectados == 4 * 24 * 8
    assert c.error_paneles == 0


def test_un_tipo_partido_en_dos_filas_cuenta_como_el_mismo():
    """4×24 ×5 + 4×24 ×3 es lo mismo que 4×24 ×8 para las fórmulas f(L, A, B)."""
    c = ev.comparar_boceto([_b(4, 24, 8)], [_b(4, 24, 5), _b(4, 24, 3)])
    assert c.exacto
    assert c.bloques_correctos == 8


def test_bloques_de_menos_y_de_mas():
    c = ev.comparar_boceto([_b(4, 24, 8), _b(4, 12, 2)], [_b(4, 24, 6), _b(4, 12, 3)])
    assert not c.exacto
    assert c.bloques_correctos == 6 + 2
    assert c.bloques_sobrantes == 1
    assert c.tipos_correctos == 0
    assert c.diferencias == ["Tipo 4×12: B=3 en vez de 2", "Tipo 4×24: B=6 en vez de 8"]


def test_tipo_faltante_y_tipo_que_no_existe():
    c = ev.comparar_boceto([_b(4, 24, 8), _b(2, 10, 1)], [_b(4, 24, 8), _b(4, 20, 2)])
    assert c.bloques_correctos == 8
    assert c.bloques_esperados == 9
    assert c.bloques_sobrantes == 2
    assert "Falta el tipo 2×10 (B=1)" in c.diferencias
    assert "Sobra el tipo 4×20 (B=2)" in c.diferencias


def test_orientacion_equivocada_no_cambia_los_bloques_pero_se_reporta():
    c = ev.comparar_boceto([_b(4, 24, 8, "vertical")], [_b(4, 24, 8, "horizontal")])
    assert c.bloques_correctos == 8
    assert c.tipos_correctos == 1
    assert c.orientaciones_correctas == 0
    assert not c.exacto


def test_caso_sin_orientacion_no_la_exige():
    c = ev.comparar_boceto([_b(4, 24, 8)], [_b(4, 24, 8, "horizontal")])
    assert c.exacto
    assert c.orientaciones_correctas == 1


def test_error_de_paneles():
    c = ev.comparar_boceto([_b(4, 25, 4)], [_b(4, 24, 4)])
    assert c.paneles_esperados == 400
    assert c.paneles_detectados == 384
    assert c.error_paneles == pytest.approx(0.04)


def test_lectura_fallida_no_detecta_nada():
    c = ev.comparar_boceto([_b(4, 24, 8)], [])
    assert c.bloques_correctos == 0
    assert c.error_paneles == 1


# ─── resúmenes ────────────────────────────────────────────────────────


def _fila_boceto(correctos, esperados, segundos=10.0, error=None, exacto=None, tokens=(0, 0)):
    return {
        "bloques_correctos": correctos,
        "bloques_esperados": esperados,
        "bloques_sobrantes": 0,
        "tipos_correctos": 1 if correctos == esperados else 0,
        "tipos_esperados": 1,
        "exacto": correctos == esperados if exacto is None else exacto,
        "error_paneles": 1 - correctos / esperados,
        "segundos": segundos,
        "error": error,
        "tokens_entrada": tokens[0],
        "tokens_salida": tokens[1],
    }


def test_tasa_de_deteccion_suma_bloques_de_todos_los_bocetos():
    """9 de 10 bloques: 90 %, justo la meta del RNF-01."""
    r = ev.resumen_bocetos([_fila_boceto(8, 8), _fila_boceto(1, 2)])
    assert r["tasa_deteccion"] == pytest.approx(0.9)
    assert r["cumple_rnf01"]
    assert r["bocetos_exactos"] == 0.5


def test_una_ejecucion_fallida_cuenta_como_no_detectada_y_no_entra_al_tiempo():
    r = ev.resumen_bocetos([_fila_boceto(8, 8, segundos=12), _fila_boceto(0, 8, segundos=120, error="IaError: x")])
    assert r["tasa_deteccion"] == 0.5
    assert not r["cumple_rnf01"]
    assert r["fallidas"] == 1
    assert r["segundos_maximo"] == 12


def test_tiempo_dentro_del_limite_del_rnf03():
    r = ev.resumen_bocetos([_fila_boceto(8, 8, segundos=12), _fila_boceto(8, 8, segundos=31)])
    assert r["dentro_de_30_s"] == 0.5


def test_costo_con_el_precio_por_millon():
    r = ev.resumen_bocetos([_fila_boceto(8, 8, tokens=(1_000_000, 100_000))], precio_entrada=2, precio_salida=10)
    assert r["costo_usd"] == pytest.approx(2 + 1)


def test_resumen_de_conteo():
    filas = [
        {"diferencia": 0, "error_relativo": 0.0, "segundos": 5, "error": None, "tokens_entrada": 0, "tokens_salida": 0},
        {"diferencia": -3, "error_relativo": 0.01, "segundos": 6, "error": None, "tokens_entrada": 0, "tokens_salida": 0},
        {"diferencia": 20, "error_relativo": 0.1, "segundos": 7, "error": None, "tokens_entrada": 0, "tokens_salida": 0},
    ]
    r = ev.resumen_conteo(filas)
    assert r["exactas"] == pytest.approx(1 / 3)
    assert r["dentro_de_2_por_ciento"] == pytest.approx(2 / 3)
    assert r["error_absoluto_medio"] == pytest.approx(23 / 3)


def test_error_relativo_de_un_conteo():
    assert ev.ComparacionConteo(esperado=352, detectado=345).error_relativo == pytest.approx(7 / 352)
    assert ev.ComparacionConteo(esperado=352, detectado=345).error == -7


# ─── casos y ejecución completa ──────────────────────────────────────


def _carpeta(tmp_path, casos, modo="bocetos"):
    clave = "bocetos" if modo == "bocetos" else "fotos"
    (tmp_path / "esperado.json").write_text(json.dumps({clave: casos}), encoding="utf-8")
    return tmp_path


def test_sin_esperado_json_es_un_error_claro(tmp_path):
    with pytest.raises(ev.CasoInvalido, match="esperado.json"):
        ev.cargar_casos(tmp_path, "bocetos")


def test_archivo_inexistente(tmp_path):
    carpeta = _carpeta(tmp_path, [{"archivo": "no_existe.pdf", "bloques": [_b(4, 24, 1)]}])
    with pytest.raises(ev.CasoInvalido, match="no existe el archivo"):
        ev.cargar_casos(carpeta, "bocetos")


@pytest.mark.parametrize("bloque", [{"L": 4, "A": 24}, {"L": 0, "A": 24, "B": 1}, {"L": 4, "A": 24, "B": 1, "orientacion": "diagonal"}])
def test_bloque_esperado_invalido(tmp_path, bloque):
    (tmp_path / "a.dxf").write_bytes(b"x")
    carpeta = _carpeta(tmp_path, [{"archivo": "a.dxf", "bloques": [bloque]}])
    with pytest.raises(ev.CasoInvalido):
        ev.cargar_casos(carpeta, "bocetos")


def test_foto_sin_cantidad(tmp_path):
    (tmp_path / "f.jpg").write_bytes(b"x")
    carpeta = _carpeta(tmp_path, [{"archivo": "f.jpg"}], modo="conteo")
    with pytest.raises(ev.CasoInvalido, match="cantidad"):
        ev.cargar_casos(carpeta, "conteo")


def test_ejecucion_completa_con_un_dxf_real(tmp_path, capsys):
    """Un DXF se lee sin la API: el flujo completo corre en el CI y deja el CSV y el JSON."""
    planta = [(x * 12, y * 30, 4, 24) for x in range(2) for y in range(2)]
    (tmp_path / "planta.dxf").write_bytes(crear_dxf(planta))
    _carpeta(tmp_path, [{"archivo": "planta.dxf", "bloques": [_b(4, 24, 4)]}])

    assert ev.main(["bocetos", str(tmp_path), "--repeticiones", "2"]) == 0

    salida = capsys.readouterr().out
    assert "100.0 %" in salida and "CUMPLE" in salida
    resultado = json.loads((tmp_path / "resultados_bocetos.json").read_text(encoding="utf-8"))
    assert resultado["resumen"]["ejecuciones"] == 2
    assert resultado["resumen"]["tasa_deteccion"] == 1
    assert resultado["resumen"]["costo_usd"] == 0
    assert (tmp_path / "resultados_bocetos.csv").read_text(encoding="utf-8").count("planta.dxf") == 2


def test_sin_clave_la_ejecucion_se_registra_como_fallida_y_sigue(tmp_path, monkeypatch, capsys):
    """Un PDF sin clave de Anthropic no detiene la evaluación: queda la fila con el error."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    (tmp_path / "boceto.pdf").write_bytes(b"%PDF-1.4 prueba")
    _carpeta(tmp_path, [{"archivo": "boceto.pdf", "bloques": [_b(4, 24, 8)]}])

    assert ev.main(["bocetos", str(tmp_path)]) == 0

    resultado = json.loads((tmp_path / "resultados_bocetos.json").read_text(encoding="utf-8"))
    assert resultado["resumen"]["fallidas"] == 1
    assert resultado["ejecuciones"][0]["error"].startswith("IaNoConfigurada")
    assert "NO CUMPLE" in capsys.readouterr().out


def test_casos_invalidos_devuelven_codigo_2(tmp_path, capsys):
    assert ev.main(["bocetos", str(tmp_path)]) == 2
    assert "esperado.json" in capsys.readouterr().err


def test_el_medidor_suma_los_tokens_que_informa_la_api(monkeypatch):
    class Respuesta:
        def json(self):
            return {"usage": {"input_tokens": 1500, "output_tokens": 300}}

    monkeypatch.setattr(ev.httpx, "post", lambda *a, **k: Respuesta())
    with ev._MedidorDeTokens() as medidor:
        ev.httpx.post("https://api.anthropic.com/v1/messages")
        ev.httpx.post("https://api.anthropic.com/v1/messages")
    assert (medidor.entrada, medidor.salida) == (3000, 600)
