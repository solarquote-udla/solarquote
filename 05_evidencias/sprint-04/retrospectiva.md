# Retrospectiva — Sprint 4

**Fecha:** noviembre de 2026, al cierre del Sprint 4
**Participantes:** Joseph Flores · Esteban Narváez

---

## Qué funcionó

- **Los 16 RF quedaron completos.** RF-07 y RF-14 a RF-16, los últimos
  que faltaban, se terminaron en este corte.
- **Los dos defectos altos se encontraron a tiempo, aunque las pruebas
  simuladas no los detectaron.** El error 400 de `tool_choice` salió al
  activar la clave real de Anthropic en Railway; el 0/32 bloques exactos
  del boceto de San Pablo salió de medir con `scripts/evaluar_ia.py`
  contra un caso real. Ninguno llegó a bloquear la demo porque se midió
  contra producción y contra un caso real antes de la entrega, no
  después.
- **Revisión de Joseph sobre el PR #63 (RNF-06).** Encontró dos problemas
  reales antes de integrar: los endpoints de salud respondían 200 aunque
  algo estuviera caído (un monitor externo nunca lo hubiera detectado), y
  `/health/db` exponía el detalle de la excepción en la respuesta
  pública. Los dos se corrigieron en el PR #67.
- **PRs chicos y seguidos** (#52 → #54, #63 → #67): las correcciones de
  revisión entraron rápido, sin acumularse.

## Qué no funcionó

- **El Sprint 4 se cerró en Jira sin que varias historias terminadas
  se hubieran puesto al día.** SQ-111, SQ-107, SQ-122, SQ-127, SQ-130,
  SQ-117, SQ-135 y SQ-136 ya estaban mergeadas, pero Jira seguía
  mostrándolas sin cerrar. Al cerrar el sprint, un sprint cerrado no
  admite más cambios, así que quedó la tarea de moverlas al Sprint 5 con
  nota explicando la fecha real.
- **SQ-167 (recolectar bocetos y fotos reales) se marcó Hecha por error
  al cerrar el sprint**, cuando en realidad solo se tiene el boceto de
  San Pablo. Se detectó al revisar el cierre, se reabrió y se movió al
  Sprint 5.
- **El procedimiento original de RNF-06 partía de un supuesto
  incorrecto** (que Railway monitorea `/health` de forma continua y
  reinicia si falla) — según la documentación real de Railway, el
  healthcheck solo corre al desplegar. Se detectó en revisión antes de
  que afectara la medición real, pero costó rehacer el documento y el
  endpoint.

## Acuerdos para el Sprint 5

1. **Mover las historias en Jira el mismo día del merge**, sin esperar
   al cierre del sprint — tercer sprint seguido con este mismo acuerdo;
   buscar qué lo está bloqueando en la práctica, no solo repetirlo.
2. **Antes de cerrar un sprint en Jira, revisar que el estado de cada
   historia coincida con lo mergeado en `develop`.**
3. **Verificar contra la documentación oficial del proveedor** (Railway,
   en este caso) antes de diseñar un procedimiento de medición que
   depende de su comportamiento, no asumirlo.
4. **Priorizar en el Sprint 5:** documentar la arquitectura en la tesis
   (sección 7.1, hoy placeholder aunque la arquitectura real ya está en
   el repo), ejecutar la checklist de RNF-05, configurar UptimeRobot
   para RNF-06, y correr `datos_prueba_produccion.py` contra Railway.
