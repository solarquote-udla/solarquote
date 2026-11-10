# Registro de disponibilidad — RNF-06

Procedimiento: [RNF-06-DISPONIBILIDAD.md](RNF-06-DISPONIBILIDAD.md).

Monitores de UptimeRobot (cada 5 min): backend `/health`, backend
`/health/db`, backend `/health/servicios` (cubre calc-service e
ia-service por la red interna).

## Puesta en marcha

| Dato | Valor |
|---|---|
| Inicio de la medición | 10 de noviembre de 2026, 11:45 (hora de Ecuador) |
| Página de estado pública | https://stats.uptimerobot.com/C1cLVxJvdV |
| Monitores | `SolarQuote - API` (`/health`), `SolarQuote - Base de datos` (`/health/db`), `SolarQuote - Servicios internos` (`/health/servicios`) |
| Intervalo | 5 minutos (plan gratuito) |
| Alertas | Correo al equipo al caer y al recuperarse |
| Estado al iniciar | Los tres monitores en **Up**, 100 % |

**Falso positivo de la configuración (no cuenta como caída).** Al crear
los monitores por primera vez, el 10 de noviembre por la mañana, los tres
marcaron Down con código **405**. La API funcionaba: el plan gratuito de
UptimeRobot consulta con `HEAD` y los endpoints de salud solo aceptaban
`GET`. Se corrigió en el PR #69. Después de desplegarlo, los monitores se
borraron y se crearon de nuevo para que el porcentaje no incluya esas
horas. La medición válida empieza en la fecha de la tabla de arriba.

## Revisión semanal

| Fecha | Uptime del período — `/health` | Uptime del período — `/health/db` | Uptime del período — `/health/servicios` | Boceto real cargado (dependiente de Anthropic) | Observaciones |
|---|---|---|---|---|---|
| | | | | | |

## Incidentes (si hubo caídas)

Hora de la primera falla y de recuperación: las reporta UptimeRobot por
correo y en el dashboard de cada monitor.

| Fecha | Monitor (servicio) | Hora de la primera falla | Hora de recuperación | Minutos de caída | ¿≤ 5 min? | Causa |
|---|---|---|---|---|---|---|
| | | | | | | |

## Cálculo de disponibilidad del período

| Período | Horas de horario laboral | Minutos de caída | Disponibilidad | ¿≥ 99 %? |
|---|---|---|---|---|
| | | | | |
