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

## Documentos

- [Estrategia de pruebas](estrategia/ESTRATEGIA-PRUEBAS.md)
- [Matriz de trazabilidad requisitos → pruebas](trazabilidad/MATRIZ-TRAZABILIDAD.md)
- [Reporte del Sprint 2](reportes/sprint-02.md)

### `trazabilidad/`

Qué prueba cubre cada regla de cada requisito (RF y RNF), la cobertura de
código por servicio y los huecos pendientes.

## Cobertura actual

Corte del 26 de octubre de 2026: **723 pruebas automatizadas**, todas
aprobadas. Detalle por requisito en la
[matriz de trazabilidad](trazabilidad/MATRIZ-TRAZABILIDAD.md).

| Componente | Pruebas | Cobertura de líneas |
|---|---|---|
| Backend (API principal) | 468 | 96 % |
| calc-service | 32 | 100 % |
| ia-service | 52 | 94 % |
| Frontend (interfaz) | 171 | — |

Pendientes: pruebas de extremo a extremo (Sprint 7) y las mediciones de
RNF-01 con bocetos y fotos de lotes reales, RNF-05 y RNF-06.

## Ejecución

```bash
cd 02_codigo_fuente/backend
pytest

cd 02_codigo_fuente/calc-service
pytest

cd 02_codigo_fuente/ia-service
pytest

cd 02_codigo_fuente/frontend
npm test
```
