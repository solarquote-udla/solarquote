# Sprint 4 — Informe de cierre

**Periodo:** 24 de octubre – 6 de noviembre de 2026
**Equipo:** Joseph Flores · Esteban Narváez
**Objetivo del sprint:** cerrar RF-07 (proforma), RF-14 a RF-16
(validación de materiales), estabilizar el microservicio de IA contra
casos reales de HEXtructure, y dejar listos los procedimientos de
RNF-05 y RNF-06.

---

## Resultado

**Objetivo cumplido.** Con este corte quedan implementados y probados
**los 16 requisitos funcionales completos (RF-01 a RF-16)** — no queda
ninguna funcionalidad pendiente de construir, solo mediciones manuales
(RNF-01, RNF-05, RNF-06) y pruebas de extremo a extremo (Sprint 7).

Dos defectos de severidad alta aparecieron contra producción y contra
datos reales de HEXtructure — ninguno lo detectó la suite automatizada,
porque las pruebas simuladas no pueden ejercitar un comportamiento real
de la API de Anthropic ni la precisión contra un boceto real. Los dos se
corrigieron dentro del mismo corte. El detalle completo, con severidad y
causa, está en el [reporte de pruebas del Sprint 4](../../03_pruebas/reportes/sprint-04.md).

**Integradas en este sprint pero registradas en Jira en el Sprint 5.**
El Sprint 4 se cerró en Jira antes de que el equipo pusiera al día el
estado de varias historias que ya estaban mergeadas. Como un sprint
cerrado no admite más cambios, quedaron Hechas y movidas al Sprint 5, con
un comentario en cada una explicando el PR y la fecha real de
integración:

| Clave | Historia | RF | PR(s) | Fecha real |
|---|---|---|---|---|
| SQ-111 | Cargar y procesar boceto de distribución | RF-04 | #44, #57, #58, #60 | 19 oct, 5 nov |
| SQ-107 | Configurar microservicio de inteligencia artificial | — | desplegado en Railway, #57 | 5 nov |
| SQ-122 | Registrar despacho con conteo de varillas por IA | RF-14 | #50 | 26 oct |
| SQ-127 | Registrar recepción en terreno | RF-15 | #50 | 26 oct |
| SQ-130 | Dar seguimiento al estado de la propuesta | RF-16 | #50 | 26 oct |
| SQ-117 | Confirmar y editar el diseño interpretado | RF-05 | #42, #44 | 18-19 oct |
| SQ-135 | Construir la trazabilidad de requisitos a pruebas | — | #48 | 21 oct |
| SQ-136 | Cubrir con pruebas unitarias la lógica crítica | — | #48 | 21 oct |

---

## Pull requests del sprint

| # | Título | RF / área | Responsable |
|---|---|---|---|
| #49 | Alinear RF-08, RF-09 y RF-13 con su especificación | RF-08, RF-09, RF-13 | Joseph |
| #50 | Validación de materiales: despacho, recepción y seguimiento | RF-14 a RF-16 | Joseph |
| #52 | Proforma en Word y Excel | RF-07 | Esteban |
| #53 | Generar el diagrama ER desde los modelos (17 → 24 tablas) | documentación | Esteban |
| #54 | Pendientes de la revisión del #52 | RF-07 | Esteban |
| #55 | Kit de pruebas de aceptación | RNF-01, RNF-03 | Joseph |
| #56 | Rehacer `datos_demo.py` | datos de prueba | Esteban |
| #57 | `tool_choice` en modo auto (error 400 de producción) | RF-04 | Joseph |
| #58 | PDF como mosaico de imágenes | RF-04 | Joseph |
| #59 | Guía de despliegue con la configuración real de Railway | documentación | Esteban |
| #60 | Leer los PDF de CAD por geometría, sin IA | RF-04 | Joseph |
| #61 | Reporte de pruebas del Sprint 3 (primera versión) | calidad | Esteban |
| #62 | Checklist de compatibilidad (RNF-05) | RNF-05 | Esteban |
| #63 | Disponibilidad con UptimeRobot y `/health/servicios` | RNF-06 | Esteban |
| #64 | Actualizar dependencias vulnerables del frontend | seguridad | Esteban |
| #65 | Avisar correr alembic en vez del error crudo de SQL | datos de prueba | Esteban |
| #66 | Reporte de datos de prueba en producción | datos de prueba | Esteban |
| #67 | `/health/db` y `/health/servicios` responden 503 si algo falla | RNF-06 | Esteban |

PR #51 se cerró sin mergear: duplicaba el fix de RF-09 que el #49 ya
traía.

---

## Métricas

| Indicador | Valor |
|---|---|
| Pull requests mergeados | 17 |
| Pull requests descartados | 1 (#51, duplicado) |
| Pruebas automatizadas | 811, todas aprobadas ([reporte](../../03_pruebas/reportes/sprint-04.md)) |
| Crecimiento de pruebas | +178 (633 → 811) |
| Defectos encontrados / abiertos | 10 / 0 (2 altos, 4 medios, 4 bajos) |
| RF completos al cierre | 16 de 16 (RF-01 a RF-16) |

---

## Incremento entregado

| Módulo | Qué quedó funcionando |
|---|---|
| RF-07 — Cotización | Proforma institucional en Word y Excel, con fórmulas editables y formato de Ecuador |
| Módulo 5 — Validación (RF-14 a RF-16) | Despacho con conteo de varillas por IA, recepción con checklist, seguimiento del estado de la propuesta |
| Módulo 2 — IA (RF-04) | Lectura exacta de PDF con geometría vectorial (sin gastar IA), mosaico de imágenes para PDF escaneados, corrección del error 400 de producción |
| RNF-05 | Checklist de compatibilidad lista para recorrer en los 4 navegadores |
| RNF-06 | `GET /health/servicios` (con su prueba) y procedimiento de disponibilidad con UptimeRobot — reemplaza un enfoque que asumía que Railway monitorea de forma continua, lo cual no hace |
| Datos de prueba | Reporte de solo lectura para encontrar clientes/proyectos de prueba en producción antes de la aceptación con HEXtructure |

---

## Evidencias a archivar en esta carpeta

| Archivo | Qué capturar | Quién |
|---|---|---|
| `backlog.png` | Jira → Backlog (una sola captura, compartida con sprint-03/) | Esteban |
| `burndown.png` | Jira → Reports → Burndown chart, Sprint 4 | Esteban |
| `informe-jira.png` | Jira → Reports → Sprint report, Sprint 4 | Esteban |
| `velocidad.png` | Jira → Reports → Velocity chart (una sola captura, compartida con sprint-03/) | Esteban |
| `pull-requests.png` | GitHub → Pull requests, `is:pr is:merged merged:2026-10-24..2026-11-06` | Esteban |
| `ci.png` | GitHub → Actions, una corrida en verde de este período | Esteban |
| `retrospectiva.md` | Acuerdos de la retrospectiva | En esta carpeta |

Capturas del sistema en funcionamiento, en `05_evidencias/capturas/sprint-04/`
(tomadas en producción el 9 de noviembre de 2026; los proyectos y clientes
que se ven son datos de prueba). En `01-confirmacion-boceto.png` la vista
previa del plano está difuminada a propósito: es un plano real de
HEXtructure y el repositorio es público.

| Archivo | Qué muestra | RF |
|---|---|---|
| `01-confirmacion-boceto.png` | Confirmación del boceto leído de la geometría del PDF: 32 bloques, 4.704 paneles, aviso de proporción | RF-04, RF-05 |
| `02-cotizacion-y-estado.png` | Detalle de la cotización con el estado de la propuesta (cotizada → despachada → recibida → instalada) | RF-06, RF-16 |
| `03-proforma-word.png` | Proforma institucional en Word | RF-07 |
| `04-proforma-excel.png` | La misma proforma en Excel | RF-07 |
| `05-despacho.png` | Despacho en planta: cotizaciones pendientes de validar | RF-14 |
