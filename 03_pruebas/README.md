# 03 — Pruebas

Documentación y evidencia del proceso de pruebas.

> **El código de las pruebas no está aquí.** Vive junto a cada servicio en
> `02_codigo_fuente/*/tests/`, porque pytest lo descubre por ubicación y la
> canalización de CI lo ejecuta desde ahí. Esta carpeta reúne la
> documentación del proceso, que es lo que corresponde a la sección 7.3 del
> formato capstone.

## Contenido

### `estrategia/`

Alcance, niveles y tipos de prueba; ambientes y datos de prueba;
herramientas seleccionadas y su justificación.

### `reportes/`

Resultados por iteración: pruebas ejecutadas, porcentaje aprobado, defectos
encontrados por severidad y correcciones aplicadas.

## Cobertura actual

| Componente | Pruebas | Estado |
|---|---|---|
| Cálculo de materiales f(L,A,B) | Unitarias | Implementadas |
| Endpoint de cotización | Integración | Implementadas |
| Diagnóstico de servicios | Integración | Implementadas |
| Autenticación y autorización | Unitarias | Pendiente — Sprint 6 |
| Algoritmo de layout solar | Unitarias | Pendiente — Sprint 3 |
| Flujo completo del usuario | Extremo a extremo | Pendiente — Sprint 8 |

## Ejecución

```bash
cd 02_codigo_fuente/backend
pytest

cd 02_codigo_fuente/calc-service
pytest
```
