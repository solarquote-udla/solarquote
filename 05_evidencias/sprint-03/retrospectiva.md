# Retrospectiva — Sprint 3

**Fecha:** octubre de 2026, al cierre del Sprint 3
**Participantes:** Joseph Flores · Esteban Narváez

---

## Qué funcionó

- **Se cerraron de golpe dos módulos completos.** RF-08, RF-09, RF-10 y
  RF-13 (administración y tablero) quedaron terminados, y arrancó RF-04
  y RF-05 (el microservicio de IA) en el mismo corte.
- **Primera suite de pruebas del frontend.** El PR #36 metió Vitest al
  CI de una vez para todo el proyecto — antes solo se verificaban tipos
  y lint. De ahí en adelante cada pantalla nueva llegó con sus pruebas.
- **Trabajo en paralelo sin bloquearse.** Mientras Joseph avanzaba el
  asistente de layout y el microservicio de IA, Esteban cerraba
  administración y tablero — áreas sin mucho código compartido.
- **Documentación antes de que se desactualice.** El PR #41 dejó el
  diagrama ER y la especificación de la API al día con lo ya construido,
  no al final del proyecto.

## Qué no funcionó

- **Los números de Jira en las ramas quedaron desalineados.** Varias
  ramas se nombraron con un `SQ-xxx` que, para cuando se revisó el
  backlog real, ya apuntaba a otra historia (el backlog se había
  reorganizado). Los PRs de este sprint referencian esos números viejos
  en su título, lo que hoy puede confundir si se busca la historia en
  Jira por ese número.
- **Jira siguió sin reflejar el trabajo real durante el sprint**, igual
  que en el Sprint 2 — varias historias terminadas seguían en "Tareas
  por hacer" días después de mergeadas.
- **RF-07 (proforma) se documentó pero no se construyó.** El PR #41
  dejó lista la especificación de la API, pero la implementación quedó
  para el Sprint 4 — un desfase entre lo documentado como pendiente y lo
  realmente priorizado para este corte.

## Acuerdos para el Sprint 4

1. **Al abrir una rama, verificar el número de Jira contra el backlog
   actual**, no asumir que el nombre de una rama anterior sigue siendo
   válido.
2. **Mover las historias en Jira el mismo día del merge** — acuerdo que
   ya se había tomado en el Sprint 2 y no se sostuvo del todo.
3. **Priorizar RF-07 (proforma)** al inicio del Sprint 4, ya con la API
   especificada desde este corte.
4. **Las pruebas de interfaz que entraron con el #36 se mantienen
   obligatorias** para toda pantalla nueva de aquí en adelante.
