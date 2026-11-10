# Sprint 3 — Informe de cierre

**Periodo:** 11 – 23 de octubre de 2026
**Equipo:** Joseph Flores · Esteban Narváez
**Objetivo del sprint:** cerrar el Módulo 4 (administración: materiales,
inversores, clientes, historial, tablero) y arrancar el Módulo 2
(interpretación de bocetos con IA), más seguridad y permisos por rol.

> **Nota sobre las claves de Jira:** varios PRs de este corte referencian
> en su título un número `SQ-xxx` tomado del nombre de la rama al
> abrirla. Esos números ya **no coinciden** con la numeración actual del
> backlog de Jira (por ejemplo, el PR del catálogo de inversores dice
> "SQ-154", pero el SQ-154 de hoy es otra historia — el backlog se
> reorganizó después). Por eso esta tabla identifica el trabajo por PR y
> por RF, verificables directo en GitHub, y solo cita la clave de Jira
> cuando se confirmó contra el backlog actual.

---

## Resultado

Objetivo cumplido. Quedaron funcionando: seguridad con perfiles y
permisos por módulo (RF-11), el catálogo de materiales e inversores, el
historial de cotizaciones, el tablero con sus 5 indicadores (RF-08 a
RF-13), la confirmación del diseño antes de cotizar (RF-05), y la
primera versión del microservicio de IA con lectura de bocetos en PDF,
imagen y DXF (RF-04). Nace en este corte la suite de pruebas del
frontend (0 → 150) y la de ia-service (0 → 38).

---

## Pull requests del sprint

| # | Título | RF / área | Responsable |
|---|---|---|---|
| #29 | Cierre del Sprint 2: documentación y evidencias | — | Joseph |
| #31 | Perfiles con permisos por opción de menú | RF-11 | Joseph |
| #32 | Pantallas de Perfiles y Usuarios con tema oscuro | RF-11 | Joseph |
| #33 | Detalles de la segunda revisión de seguridad | RF-11 | Joseph |
| #34 | Asistente de 3 pasos para generar el layout | RF-01 a RF-03 | Joseph |
| #35 | CRUD del catálogo de materiales | RF-09 | Esteban |
| #36 | Pruebas de interfaz en el CI, candado contra doble envío | — (calidad) | Joseph |
| #37 | Catálogo de inversores con pantalla de administración | RF-08 | Esteban |
| #38 | Varios inversores por proyecto con bloques coloreados | RF-02, RF-03 | Joseph |
| #39 | Historial de cotizaciones: listado, filtros y detalle | RF-10 | Esteban |
| #40 | Indicadores del negocio en el Dashboard | RF-13 | Esteban |
| #41 | Diagrama ER completo y especificación de API | documentación | Esteban |
| #42 | Confirmación y cotización desde el layout | RF-05 | Joseph |
| #43 | Tarjeta de potencia cotizada (kWp) | RF-13 | Esteban |
| #44 | RF-04 y RF-05: bocetos del cliente (microservicio de IA) | RF-04, RF-05 | Joseph |
| #45 | Modo claro/oscuro | valor agregado | Esteban |
| #46 | Ajustes de tema y boceto (revisión del #32 y #44) | RF-11, RF-04 | Joseph |
| #47 | Quitar la guía de migración del repositorio | documentación | Joseph |
| #48 | Trazabilidad y pruebas faltantes (SQ-135, SQ-136) | calidad | Joseph |

PR #30 (autenticación entre servicios, SQ-37) se mergeó el 7 de octubre,
dentro del Sprint 2 — ya está en su informe de cierre, no se repite aquí.

---

## Métricas

| Indicador | Valor |
|---|---|
| Pull requests mergeados | 19 |
| Pruebas automatizadas | 633, todas aprobadas ([reporte](../../03_pruebas/reportes/sprint-03.md)) |
| Crecimiento de pruebas | +405 (228 → 633) |
| Despliegues | Sin cambios de infraestructura — los tres servicios ya estaban en producción desde el Sprint 2 |

---

## Incremento entregado

| Módulo | Qué quedó funcionando |
|---|---|
| RF-11 — Seguridad | Perfiles con permisos por opción de menú, cierre de sesión por inactividad, administración de usuarios |
| Módulo 2 — IA (RF-04, RF-05) | Microservicio de IA desplegado; carga y lectura de bocetos (PDF, imagen, DXF); confirmación y edición del diseño interpretado antes de cotizar |
| Módulo 4 — Administración (RF-08, RF-09, RF-10, RF-13) | Catálogo de materiales e inversores, historial de cotizaciones con filtros, tablero con 5 indicadores |
| Calidad | Primera suite de pruebas del frontend (Vitest) corriendo en el CI; matriz de trazabilidad requisitos → pruebas |

---

## Evidencias a archivar en esta carpeta

| Archivo | Qué capturar | Quién |
|---|---|---|
| `backlog.png` | Jira → Backlog | Esteban |
| `burndown.png` | Jira → Reports → Burndown chart, Sprint 3 | Esteban |
| `informe-jira.png` | Jira → Reports → Sprint report, Sprint 3 | Esteban |
| `velocidad.png` | Jira → Reports → Velocity chart (una sola captura, compartida con sprint-04/) | Esteban |
| `pull-requests.png` | GitHub → Pull requests, `is:pr is:merged merged:2026-10-11..2026-10-23` | Esteban |
| `ci.png` | GitHub → Actions, una corrida en verde de este período | Esteban |
| `retrospectiva.md` | Acuerdos de la retrospectiva | En esta carpeta |

Capturas del sistema en funcionamiento, en `05_evidencias/capturas/sprint-03/`
(tomadas en producción el 9 de noviembre de 2026; los proyectos y clientes
que se ven son datos de prueba):

| Archivo | Qué muestra | RF |
|---|---|---|
| `01-perfiles.png` | Perfil Personal de Producción con sus permisos por opción de menú | RF-11 |
| `02-menu-operario.png` | Sesión de un usuario de producción: el menú solo muestra despacho y recepción | RF-11 |
| `03-inversores.png` | Catálogo de inversores | RF-08 |
| `04-confirmacion-layout.png` | Confirmación del layout, con un bloque fuera de proporción aceptado bajo responsabilidad | RF-03, RF-05 |
| `05-carga-boceto.png` | Carga del boceto con los datos del proyecto | RF-04 |
| `06-procesando-boceto.png` | Pasos del procesamiento del boceto | RF-04 |
| `07-historial.png` | Historial: proyectos en curso para retomarlos | RF-10 |
| `08-tablero.png` | Dashboard con los indicadores | RF-13 |
| `09-tema-claro.png` | El mismo Dashboard en modo claro | valor agregado |
