# Retrospectiva — Sprint 2

**Fecha:** octubre de 2026, al cierre del Sprint 2 (cerrado en Jira el 10 de octubre)
**Participantes:** Joseph Flores · Esteban Narváez

El equipo partió de un borrador armado con los hechos del sprint (PRs,
incidentes y decisiones), lo revisó en conjunto y lo validó. Lo que se
destacó en la conversación está marcado como **(reunión)**.

---

## Qué funcionó

- **(reunión) Se cumplió lo planificado.** Todas las historias del sprint
  se terminaron (13 elementos, 69 puntos en el *Sprint report*), y además
  se adelantaron RF-03 y la edición manual de bloques, previstas para el
  Sprint 4.
- **CI obligatorio desde el 1 de octubre.** Detectó dos defectos antes de que
  llegaran a `develop`: el ENUM huérfano en las migraciones y las dos
  *heads* al juntar ramas en paralelo.
- **Revisión cruzada de cada PR.** Los defectos más graves (las pruebas
  borraban la base de desarrollo, la cotización no guardaba el total y el
  desfase de 0,5 mm en la edición de bloques) salieron de revisar el
  código del otro, no de las pruebas.
- **Contrato antes del código.** Con `CONTRATO-CLIENTES.md`, el backend y
  el frontend de clientes se hicieron en paralelo y encajaron sin ajustes.
- **Funciones puras con cálculos a mano.** El algoritmo de layout se
  construyó y se validó contra óptimos contados a mano antes de tener
  pantalla.
- **PRs chicos por partes** (SQ-77 en 3 partes, SQ-94 en 2): más fáciles
  de revisar.
- **Desplegar temprano.** Producción quedó lista en la primera semana;
  los problemas de CORS y de variables salieron a tiempo.

## Qué no funcionó

- **(reunión) Choques entre los cambios de los dos.** Al trabajar en
  paralelo, a veces tocamos las mismas partes: conflictos en `main.py` al
  registrar routers, en `types/api.ts`, y dos *heads* de migración al
  juntar el layout con el desglose de la cotización. Se resolvieron, pero
  costaron tiempo de integración.
- **Ramas duplicadas** (`-clean`, `-v2`, `-v3`) al rehacer rebases:
  llegaron a haber 20 ramas. *Resuelto:* borrado automático de ramas al
  mergear.
- **calc-service quedó sin desplegar** hasta el 6 de octubre, y la cotización
  daba 502 en producción sin que nadie lo notara.
- **Credenciales expuestas en capturas de pantalla** (el deploy hook de
  Vercel y la contraseña de Neon). Se rotaron las dos, pero no debió
  pasar.
- **Las pruebas podían borrar la base de desarrollo.** El fixture
  apuntaba a la base del `.env`. Se detectó antes de perder datos.
- **Estados de Jira desactualizados** respecto al trabajo real durante
  buena parte del sprint.

## Acuerdos para el Sprint 3

1. **(reunión) Avisar antes de tocar archivos compartidos** (`main.py`,
   `types/api.ts`, las migraciones y los modelos compartidos), y
   actualizar la rama con `develop` seguido, no solo al final.
2. **Ninguna captura con valores del `.env` ni de variables de Railway**:
   se tapan antes de compartirlas.
3. **Todo servicio nuevo se despliega en el mismo sprint en que se
   integra**, con su `/health` verificado.
4. **Mover las tareas en Jira el mismo día del merge**, no al final.
5. **`pytest` en local solo contra `solarquote_test`** (ya lo impone el
   `conftest`).
6. **Revisión y cierre del sprint los viernes**, con release
   `develop → main`.
7. Priorizar en el Sprint 3 la pantalla de cotización (SQ-84) y
   "Cotizar este layout", para cerrar el circuito completo.
