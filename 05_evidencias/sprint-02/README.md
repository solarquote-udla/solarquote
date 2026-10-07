# Sprint 2 — Informe de cierre

**Periodo:** 25 de septiembre – 9 de octubre de 2026
**Equipo:** Joseph Flores · Esteban Narváez
**Objetivo del sprint:** que el sistema se vea y esté en línea — frontend
y backend desplegados, y las primeras funcionalidades de los módulos de
layout y cotización.

---

## Resultado

**Objetivo cumplido y superado.** El sistema está desplegado en producción
(Vercel + Railway + Neon) y, además de lo planificado, se adelantaron
RF-03 (generación del layout, previsto para el Sprint 4) y la
administración de clientes y precios (previstas para el Sprint 3).

Flujo navegable en producción al cierre:

```
login → clientes → proyecto → terreno y caminos → panel e inversor → layout solar
                                                                        ↓
                         precios de materiales → (cotización: backend listo)
```

---

## Historias del sprint

| Clave | Historia | Responsable | Pts | Estado | PRs |
|---|---|---|---|---|---|
| SQ-45 | RF-01 Definir terreno y caminos | Joseph | 13 | ✅ Hecha | #1 |
| SQ-52 | RF-02 Seleccionar panel e inversor | Joseph | 8 | ✅ Hecha | #2 |
| SQ-145 | Gestionar proyectos (alta, listado, detalle) | Joseph | 3 | ✅ Hecha | #1 |
| SQ-147 | Editar datos del proyecto | Joseph | 2 | ✅ Hecha | #20 |
| SQ-24 | Integración continua con pruebas automatizadas | Joseph | 5 | ✅ Hecha | #3, #21, #26 |
| SQ-146 | CORS para las previews de Vercel | Joseph | 2 | ✅ Hecha | #4 |
| SQ-134 | Definir la estrategia de pruebas | Joseph | 3 | ✅ Hecha | este cierre |
| SQ-89 | RF-12 Administrar clientes | Esteban (backend) · Joseph (pantalla) | 8 | ✅ Hecha | #15, #17, #18, #22 |
| SQ-93 | RF-09 Administrar precios de materiales | Esteban | 8 | ✅ Hecha | #23, #24, #25 |
| SQ-21 | Desplegar el microservicio de cálculo | Esteban · Joseph | 3 | ✅ Hecha | despliegue en Railway |
| SQ-72 | RF-06 Calcular materiales por proyecto | Esteban | 13 | 🟡 Backend listo; falta la pantalla → Sprint 3 | #5, #10–#13, #16, #19, #28 |
| SQ-37 | Autenticar la comunicación entre servicios | Esteban | 3 | ⬜ Pasa al Sprint 3 | — |

**Adelantadas de sprints futuros:**

| Clave | Historia | Sprint previsto | Estado |
|---|---|---|---|
| SQ-56 | RF-03 Generar el layout solar automáticamente | Sprint 4 | ✅ Hecha (#14) |
| SQ-64 | Editar manualmente los bloques generados | Sprint 4 | 🟡 En revisión |

> Completar antes del cierre: confirmar en Jira los estados finales y
> los puntos completados según el *Sprint Report*.

---

## Métricas

| Indicador | Valor |
|---|---|
| Pull requests mergeados | 23 (todos con revisión del otro integrante) |
| Pruebas automatizadas | 200, todas aprobadas ([reporte](../../03_pruebas/reportes/sprint-02.md)) |
| Defectos encontrados / abiertos | 9 / 0 |
| Despliegues | Frontend (Vercel), backend y calc-service (Railway), base de producción (Neon) |
| Líneas de código agregadas | ~11 000 (`02_codigo_fuente/`) |

---

## Incremento entregado

| Módulo | Qué quedó funcionando |
|---|---|
| Infraestructura | CI obligatorio en `develop` y `main`; despliegue continuo; previews por PR con login; tres servicios en producción |
| Módulo 1 — Layout | Terreno y caminos sobre plano, panel e inversor con presets de fichas técnicas, generación automática del layout con proporción antisísmica, configuración eléctrica y capacidad en kWp |
| Módulo 3 — Cotización | Cálculo f(L, A, B) en calc-service; orquestador con precios vigentes, IVA configurable, logística y total congelado |
| Módulo 4 — Administración | Clientes (con validación de cédula y RUC) y precios de materiales con historial |

---

## Decisiones técnicas del sprint

| Decisión | Dónde está documentada |
|---|---|
| Contrato de la API de clientes antes de programar | `01_documentacion/arquitectura/CONTRATO-CLIENTES.md` |
| Algoritmo de layout y regla antisísmica (±20 %, configurable) | `01_documentacion/arquitectura/ALGORITMO-LAYOUT.md` |
| Snapshot del total en la cotización | `MODELOS-COMPARTIDOS.md` |
| Protección de la base de desarrollo en las pruebas | `03_pruebas/estrategia/ESTRATEGIA-PRUEBAS.md` |
| Sprints de 2 semanas desde el Sprint 3 | `01_documentacion/gestion/ROADMAP.md` |

---

## Evidencias a archivar en esta carpeta

| Archivo | Qué capturar | Estado |
|---|---|---|
| `backlog.png` | Jira → Backlog, con el Sprint 2 y los siguientes | ☐ |
| `tablero.png` | Jira → Active sprint, al cierre | ☐ |
| `burndown.png` | Jira → Reports → Burndown chart, Sprint 2 | ☐ |
| `informe-jira.png` | Jira → Reports → Sprint report, Sprint 2 | ☐ |
| `ci.png` | GitHub → Actions: corridas en verde | ☐ |
| `pull-requests.png` | GitHub → Pull requests → Closed | ☐ |
| `retrospectiva.md` | Acuerdos de la retrospectiva | Borrador listo |

Capturas del sistema en funcionamiento → `05_evidencias/capturas/sprint-02/`:

| Archivo | Pantalla |
|---|---|
| `01-login.png` | Login en `solarquote-hextructure.vercel.app` |
| `02-clientes.png` | Administración → Clientes |
| `03-precios.png` | Administración → Precios |
| `04-terreno.png` | Terreno con caminos y áreas |
| `05-equipo.png` | Panel e inversor con resultados |
| `06-layout.png` | Layout generado con bloques por tipo |
| `07-edicion-bloques.png` | Modo edición con un bloque en rojo |
