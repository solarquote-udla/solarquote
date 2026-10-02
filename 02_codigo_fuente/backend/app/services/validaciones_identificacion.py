"""
Validación de cédula, RUC y teléfono ecuatorianos — RF-12.

Reglas acordadas en CONTRATO-CLIENTES.md. No se exige el dígito
verificador por módulo 11 del RUC de sociedades (tercer dígito 6 o 9):
validar más estricto que el propio SRI bloquearía clientes reales.
"""

import re

PROVINCIAS_VALIDAS = {*range(1, 25), 30}


def normalizar_identificacion(valor: str) -> str:
    """Quita espacios y guiones: '17-1234-5678' -> '1712345678'."""
    return re.sub(r"[\s-]", "", valor)


def validar_cedula(valor: str) -> bool:
    valor = normalizar_identificacion(valor)
    if not re.fullmatch(r"\d{10}", valor):
        return False

    provincia = int(valor[:2])
    if provincia not in PROVINCIAS_VALIDAS:
        return False

    if int(valor[2]) >= 6:
        return False

    coeficientes = (2, 1, 2, 1, 2, 1, 2, 1, 2)
    suma = 0
    for digito, coeficiente in zip(valor[:9], coeficientes):
        producto = int(digito) * coeficiente
        suma += producto - 9 if producto >= 10 else producto

    verificador = (10 - suma % 10) % 10
    return verificador == int(valor[9])


def validar_ruc(valor: str) -> bool:
    valor = normalizar_identificacion(valor)
    if not re.fullmatch(r"\d{13}", valor):
        return False

    if valor[10:] == "000":
        return False

    provincia = int(valor[:2])
    if provincia not in PROVINCIAS_VALIDAS:
        return False

    tercer_digito = int(valor[2])
    if tercer_digito <= 5:
        return validar_cedula(valor[:10])
    if tercer_digito in (6, 9):
        return True
    return False


def validar_telefono(valor: str) -> bool:
    if not re.fullmatch(r"\+?[\d\s()-]+", valor):
        return False
    digitos = re.sub(r"\D", "", valor)
    return 7 <= len(digitos) <= 15
