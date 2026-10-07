# Retrospectiva — Sprint 2

**Fecha:** 9 de octubre de 2026
**Participantes:** Joseph Flores · Esteban Narváez

> **Borrador.** Armado a partir de lo que pasó en el sprint (PRs,
> incidentes, decisiones). Revísenlo juntos en la retrospectiva:
> corrijan, agreguen su propia lectura y borren esta nota.

---

## Qué funcionó

- **CI obligatorio desde el 1 de octubre.** Detectó dos defectos antes de que
  llegaran a `develop`: el ENUM huérfano en las migraciones y las dos
  *heads* al juntar ramas en paralelo.
- **Revisión cruzada de cada PR.** Los dos defectos más graves (las
  pruebas borraban la base de desarrollo y la cotización no guardaba el
  total) salieron de revisar el código del otro, no de las pruebas.
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
- **Desbalance de carga:** el Módulo 1 avanzó dos sprints por delante y
  la pantalla de cotización (RF-06) quedó para el siguiente.

## Acuerdos para el Sprint 3

1. **Ninguna captura con valores del `.env` ni de variables de Railway**:
   se tapan antes de compartirlas.
2. **Todo servicio nuevo se despliega en el mismo sprint en que se
   integra**, con su `/health` verificado.
3. **Mover las tareas en Jira el mismo día del merge**, no al final.
4. **`pytest` en local solo contra `solarquote_test`** (ya lo impone el
   `conftest`).
5. **Revisión y cierre del sprint los viernes**, con release
   `develop → main`.
6. Priorizar en el Sprint 3 la pantalla de cotización (RF-06) y
   "Cotizar este layout", para cerrar el circuito completo.
