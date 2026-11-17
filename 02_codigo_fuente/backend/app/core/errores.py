"""
Mensajes de validación en español — RF-02 y en general toda la API.

FastAPI/Pydantic devuelven el 422 con los mensajes de las restricciones
de campo (`gt`, `le`, `min_length`, campo faltante, tipo equivocado...)
en inglés. Los mensajes que nosotros mismos escribimos (un `ValueError`
levantado en un `field_validator` o `model_validator`) ya están en
español — este manejador solo traduce lo que viene de Pydantic por
defecto, y conserva el `loc` tal cual para que el frontend sepa junto a
qué campo poner cada error.
"""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _num(valor: object) -> object:
    """120.0 -> 120, pero 0.5 se queda igual. Para que el mensaje no diga "mayor que 0.0"."""
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return valor


def _mensaje_en_espanol(error: dict) -> str:
    tipo = error["type"]
    ctx = error.get("ctx") or {}

    if tipo == "value_error":
        # Nuestros propios ValueError (field_validator/model_validator):
        # Pydantic antepone "Value error, " al mensaje que ya escribimos.
        return str(error["msg"]).removeprefix("Value error, ")

    plantillas = {
        "greater_than": f"Debe ser mayor que {_num(ctx.get('gt'))}.",
        "greater_than_equal": f"Debe ser mayor o igual a {_num(ctx.get('ge'))}.",
        "less_than": f"Debe ser menor que {_num(ctx.get('lt'))}.",
        "less_than_equal": f"Debe ser como máximo {_num(ctx.get('le'))}.",
        "string_too_short": f"Debe tener al menos {ctx.get('min_length')} caracteres.",
        "string_too_long": f"Debe tener como máximo {ctx.get('max_length')} caracteres.",
        "too_short": f"Debe tener al menos {ctx.get('min_length')} elementos.",
        "too_long": f"Debe tener como máximo {ctx.get('max_length')} elementos.",
        "missing": "Este campo es obligatorio.",
        "int_parsing": "Debe ser un número entero.",
        "int_type": "Debe ser un número entero.",
        "float_parsing": "Debe ser un número.",
        "string_type": "Debe ser un texto.",
        "bool_parsing": "Debe ser verdadero o falso.",
        "bool_type": "Debe ser verdadero o falso.",
        "literal_error": f"Debe ser uno de: {ctx.get('expected')}.",
        "json_invalid": "El formato enviado no es válido.",
        "extra_forbidden": "Este campo no es válido aquí.",
        "uuid_parsing": "No tiene el formato esperado.",
        "date_parsing": "Debe ser una fecha válida.",
        "datetime_parsing": "Debe ser una fecha y hora válidas.",
    }
    return plantillas.get(tipo, str(error["msg"]))


async def manejador_422(request: Request, exc: RequestValidationError) -> JSONResponse:
    detalle = [
        {"loc": list(error["loc"]), "msg": _mensaje_en_espanol(error), "type": error["type"]}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": detalle})
