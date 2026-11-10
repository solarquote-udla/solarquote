# Reporte de pruebas — Sprint 3

**Periodo:** 11 – 23 de octubre de 2026
**Estrategia aplicada:** [ESTRATEGIA-PRUEBAS.md](../estrategia/ESTRATEGIA-PRUEBAS.md)

Medición sobre `develop` al 21 de octubre de 2026 (PR #48, trazabilidad
SQ-135/SQ-136). Punto de partida del corte: [Sprint 2](sprint-02.md), con
**228 pruebas** (196 backend + 32 calc-service; sin ia-service ni
frontend todavía).

---

## Resumen

| Indicador | Valor |
|---|---|
| Pruebas automatizadas | **633** (413 backend + 32 calc-service + 38 ia-service + 150 frontend) |
| Aprobadas | **633 (100 %)** |
| Crecimiento del corte | +405 pruebas (228 → 633) |
| Ejecución | En cada PR y en cada push a `develop`, en GitHub Actions |
| Pull requests integrados | 19 (#29, #31 a #48) |
| Pull requests fuera de este corte | #30 (PR #30 se mergeó el 7 de octubre, dentro del Sprint 2 — ya reportado en [sprint-02.md](sprint-02.md)) |

El crecimiento más grande del proyecto hasta la fecha: en este corte
nace la suite de pruebas del frontend (0 → 150, sin pruebas unitarias en
el Sprint 2) y la de ia-service (0 → 38, con la primera versión del
microservicio de interpretación de bocetos).

---

## Pull requests de este corte

| # | Título | Qué agrega |
|---|---|---|
| #29 | Cierre del Sprint 2: documentación y evidencias | Documentación y evidencias pendientes del corte anterior |
| #31 | SQ-150 Perfiles con permisos por opción de menú (RF-11) | Perfiles, permisos por módulo y su aplicación en el backend |
| #32 | SQ-151 Pantallas de Perfiles y Usuarios con tema oscuro (RF-11) | Interfaz de administración de perfiles y usuarios |
| #33 | SQ-150 Detalles de la segunda revisión de seguridad | Ajustes de la revisión cruzada sobre el #31 |
| #34 | SQ-152 Asistente de 3 pasos para generar el layout (RF-01 a RF-03) | Flujo guiado: terreno → equipo → layout, en un solo asistente |
| #35 | RF-09: CRUD del catálogo de materiales | Alta, edición y baja lógica de materiales |
| #36 | SQ-153 Pruebas de interfaz en el CI | Primera suite de pruebas del frontend (Vitest), candado contra doble envío, avisos en formularios |
| #37 | RF-08: catálogo de inversores con pantalla de administración | Alta, edición y baja lógica de inversores de referencia |
| #38 | SQ-155 Varios inversores por proyecto con bloques coloreados (RF-02, RF-03) | Más de un inversor por proyecto; el layout distingue sus bloques por color |
| #39 | RF-10: listado, filtros y detalle de cotizaciones | Historial de cotizaciones con búsqueda y filtros |
| #40 | RF-13: indicadores del negocio en el Dashboard | Tablero con gráficos por período y por estado |
| #41 | Diagrama ER completo y especificación de API de mis módulos | Documentación de arquitectura (sin cambios de código) |
| #42 | SQ-158 Diagrama de confirmación y cotización desde el layout (RF-05) | Confirmar y editar el diseño interpretado antes de cotizar |
| #43 | Tarjeta de potencia cotizada (kWp) — RF-13 | Quinto indicador del tablero |
| #44 | RF-04 y RF-05: bocetos del cliente | Primera versión del microservicio de IA: carga y lectura de bocetos (PDF, imagen, DXF) |
| #45 | Modo claro/oscuro | Valor agregado, fuera del alcance original |
| #46 | Ajustes de tema y boceto | Correcciones de la revisión sobre el #32 y el #44 |
| #47 | Quitar la guía de migración del repositorio | Limpieza de documentación de uso interno |
| #48 | SQ-135 y SQ-136: trazabilidad y pruebas faltantes | Matriz de trazabilidad requisitos → pruebas; huecos de cobertura en los routers de administración |

---

## Pruebas por componente (lo nuevo de este corte)

No se repite aquí el inventario completo de la suite (ver el
[Sprint 2](sprint-02.md) para la base); esta tabla es lo que agregaron
los archivos de prueba nuevos. No suma exactamente las +405 del resumen
porque deja fuera los ajustes repartidos en archivos que ya existían
(`test_material_administracion.py`, `test_cliente_servicio.py`,
`test_layout.py`, entre otros, crecidos en varios PRs de este corte).

| Archivo | Pruebas | PR | Qué verifica |
|---|---|---|---|
| `test_seguridad.py` | 25 | #31 | Autenticación, perfiles, permisos por módulo (RF-11) |
| `test_proyecto_avance.py` | 1 | #34 | El proyecto avanza de estado según el trabajo hecho |
| `test_inversor_administracion.py` | 16 | #37 | Catálogo de inversores: alta, edición, baja lógica (RF-08) |
| `test_varios_inversores.py` | 17 | #38 | Más de un inversor por proyecto, reparto de bloques |
| `test_cotizacion_historial.py` | 9 | #39 | Historial filtrado por fecha, cliente y estado (RF-10) |
| `test_tablero.py` | 7 | #40 | Indicadores del negocio por período (RF-13) |
| `test_confirmacion.py` | 13 | #42 | Confirmación del diseño interpretado antes de cotizar (RF-05) |
| `test_boceto.py` | 24 | #44 | Carga y procesamiento del boceto (RF-04) |
| `ia: test_dxf.py` | 9 | #44 | Lectura de DXF por geometría |
| `ia: test_endpoint_bocetos.py` | 11 | #44 | Contrato HTTP del microservicio de IA |
| `ia: test_ia.py` | 10 | #44 | Interpretación de PDF e imagen con la API de Claude (simulada) |
| `test_api_administracion.py` | 8 | #48 | Traducción de errores a HTTP y permisos por operación (hueco encontrado al armar la trazabilidad) |
| `test_api_terreno.py` | 3 | #48 | Mismo hueco, para el router de terreno |
| `test_rnf.py` | 3 | #48 | Primeras mediciones automatizadas de RNF-03 y RNF-04 |
| `administracion.test.tsx`, `aplicacion.test.tsx`, `asistentePaso1.test.tsx`, `asistentePasos2y3.test.tsx`, `concurrencia.test.tsx`, `escrituras.test.tsx` | 45 | #36 | Primera suite de pruebas del frontend |
| `inversores.test.tsx` | 11 | #38 | Catálogo de inversores en la interfaz |
| `historial.test.tsx` | 5 | #39 | Historial de cotizaciones en la interfaz |
| `fechas.test.tsx`, `tablero.test.tsx` | 9 | #40 | Formato de fechas y tablero en la interfaz |
| `confirmacion.test.tsx` | 9 | #42 | Confirmación del diseño en la interfaz |
| `bocetos.test.tsx` | 13 | #44 | Carga de boceto en la interfaz |
| `tema.test.tsx` | 5 | #45 | Modo claro/oscuro |
| `tema-colores.test.tsx` | 2 | #46 | Colores de los bloques por inversor en ambos temas |
| `inactividad.test.tsx` | 5 | #48 | Cierre de sesión por inactividad (RNF-04) |

---

## Defectos

Este corte no tuvo un reporte de defectos independiente — fue mayormente
de construcción de funcionalidad nueva (RF-04, RF-05, RF-08, RF-10, RF-13,
RF-11), con menos PRs de corrección (`fix:`) que el Sprint 4. Los ajustes
de revisión quedaron documentados en cada PR (#33, sobre el #31; #46,
sobre el #32 y el #44). El primer reporte de defectos con tabla y
severidad es el del [Sprint 4](sprint-04.md), que sí tuvo varios hallazgos
de producción.

---

## Pendiente para el Sprint 4

- RF-07 (proforma en Word y Excel): el PR #41 documentó la API pendiente,
  pero la implementación quedó para el corte siguiente.
- RF-14 a RF-16 (validación de materiales): sin empezar a este corte.
- Checklist de RNF-05 y procedimiento de RNF-06: sin empezar.
