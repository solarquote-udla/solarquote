# Reporte de pruebas — Sprint 2

**Periodo:** 25 de septiembre – 9 de octubre de 2026
**Estrategia aplicada:** [ESTRATEGIA-PRUEBAS.md](../estrategia/ESTRATEGIA-PRUEBAS.md)

Medición sobre `develop` al 7 de octubre de 2026 (commit `da48faf`).

---

## Resumen

| Indicador | Valor |
|---|---|
| Pruebas automatizadas | **200** (173 backend + 27 calc-service) |
| Aprobadas | **200 (100 %)** |
| Ejecución | En cada PR y en cada push a `develop`, en GitHub Actions |
| PRs que pasaron por el CI | 21 de 23 (los dos primeros son anteriores al CI) |
| Defectos encontrados | 9 (1 crítico, 1 alto, 4 medios, 3 bajos) |
| Defectos abiertos | 0 |

En revisión, sin contar arriba: `feat/SQ-64-editar-bloques` agrega
**21 pruebas** (194 en el backend al mergearse).

---

## Pruebas por componente

### Backend (173)

| Archivo | Pruebas | Nivel | Qué verifica |
|---|---|---|---|
| `test_calculo_equipo.py` | 31 | Unitaria | Separación entre filas, límites de string, regla de 400 paneles por inversor (RF-02) |
| `test_cliente_servicio.py` | 26 | Integración | CRUD de clientes, baja lógica, identificación duplicada (RF-12) |
| `test_layout.py` | 22 | Unitaria | Algoritmo de layout: óptimos contados a mano, caminos, rotación, kWp, eléctrica (RF-03) |
| `test_validaciones_identificacion.py` | 21 | Unitaria | Cédula (módulo 10), RUC, pasaporte, teléfono |
| `test_geometria.py` | 15 | Unitaria | Área útil del terreno con caminos que se cruzan (RF-01) |
| `test_cotizacion_servicio.py` | 14 | Integración | Orquestador: precios vigentes, snapshot del total, estado `cotizado` (RF-06) |
| `test_material_administracion.py` | 13 | Integración | Precios: cierre de vigencia e historial (RF-09) |
| `test_cors.py` | 11 | Unitaria | Orígenes aceptados y rechazados para las previews de Vercel |
| `test_proyecto_actualizar.py` | 7 | Integración | Corrección de datos del proyecto (SQ-147) |
| `test_config.py` | 5 | Unitaria | Validación de la configuración (IVA) |
| `test_calc_service.py` | 4 | Contrato | Petición y respuesta hacia calc-service |
| `test_material.py` | 4 | Integración | Resolución del precio vigente por código |

### calc-service (27)

| Archivo | Pruebas | Nivel | Qué verifica |
|---|---|---|---|
| `test_calculo_materiales.py` | 13 | Unitaria | Fórmulas f(L, A, B) de los diez materiales (RF-06) |
| `test_endpoint_cotizacion.py` | 12 | Integración | Endpoint de cálculo: addendum, IVA, cargos fijos |
| `test_health.py` | 2 | Integración | Diagnóstico del servicio |

### Frontend

Sin pruebas unitarias todavía. En cada PR se ejecutan la verificación de
tipos (`tsc`) y ESLint. Las reglas duplicadas del backend se verifican por
**paridad** (ver la estrategia, §5):

| Regla | Casos | Diferencias |
|---|---|---|
| Cédula, RUC, pasaporte y teléfono | 22 518 | 0 |
| Validez de bloques editados (SQ-64, en revisión) | 4 000 | 0 |

### Migraciones

En cada PR: `upgrade → downgrade → upgrade` completo y verificación de
una sola *head*. Estado al cierre: 9 migraciones, una *head* (`26f2e122b07e`).

---

## Defectos encontrados

| # | Severidad | Defecto | Cómo se detectó | Corrección |
|---|---|---|---|---|
| 1 | **Crítica** | `conftest.py` ejecutaba `drop_all` sobre la `DATABASE_URL` del `.env`: correr `pytest` en local **borraba todas las tablas de la base de desarrollo** (reproducido: 13 tablas → 0) | Revisión de código | PR #21: las pruebas de integración solo corren contra una base `*test*` o `*_ci` |
| 2 | **Alta** | La cotización guardaba los ítems pero no el subtotal, el IVA, el total ni los precios usados: una proforma vieja cambiaría al recalcularse con precios nuevos | Revisión de código | PR #19: snapshot del desglose y de `MaterialCotizado` |
| 3 | Media | El `downgrade` de la primera migración no borraba el tipo ENUM `rol_usuario`; un segundo `upgrade` fallaba con `DuplicateObject` | **CI** (ciclo de migraciones) | PR #3 |
| 4 | Media | El login fallaba desde las URLs de preview de Vercel por CORS | Prueba manual | PR #4: `CORS_ORIGIN_REGEX` |
| 5 | Media | El orquestador aceptaba clientes dados de baja, un `proyecto_id` inexistente daba error 500 y el snapshot del cliente salía del request | Revisión de código | PR #16 |
| 6 | Media | Dos *heads* de Alembic al juntar el layout (#14) con el desglose de la cotización (#19) | **CI** (*head* única) | Migración de fusión `26f2e122b07e` |
| 7 | Baja | Vértices colineales se informaban como "el polígono se cruza consigo mismo" | Prueba unitaria | PR #1: verificación por casco convexo antes |
| 8 | Baja | `TEST_DATABASE_URL` no se leía desde el `.env` | Prueba manual | PR #26 |
| 9 | Baja | La tolerancia por área en la edición de bloques rechazaba bloques que solo se rozaban por redondeo | Prueba unitaria | Cambiada a tolerancia por penetración (5 mm), en SQ-64 |

**Lectura:** dos de los defectos de severidad media los detectó el CI
antes de llegar a `develop`. Los dos más graves salieron de revisión de
código entre los integrantes, y ninguno llegó a producción.

---

## Pendiente para el Sprint 3

- Medir la cobertura de código con `pytest-cov` y publicarla en el CI.
- Mergear SQ-64 (21 pruebas en revisión).
- Pruebas del endpoint "Cotizar este layout".
