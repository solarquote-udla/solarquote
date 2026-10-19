"""
Zona horaria del negocio.

HEXtructure opera en Ecuador, que usa UTC-5 todo el año (sin horario de
verano). Las fechas se guardan en UTC; esta zona se usa para decidir a
qué día, mes o año pertenecen: el filtro del historial (RF-10), la
agrupación del tablero (RF-13) y el año de la proforma (RF-07).
"""

from datetime import timedelta, timezone

ZONA_ECUADOR = timezone(timedelta(hours=-5))
