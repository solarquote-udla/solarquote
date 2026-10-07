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
- [Reporte del Sprint 2](reportes/sprint-02.md)

## Cobertura actual

Al cierre del Sprint 2: **200 pruebas automatizadas**, todas aprobadas.

| Componente | Pruebas | Estado |
|---|---|---|
| Cálculo de materiales f(L,A,B) | Unitarias | Implementadas |
| Endpoint de cotización (calc-service) | Integración | Implementadas |
| Orquestador de cotización y snapshot del total | Integración | Implementadas |
| Terreno y área útil (RF-01) | Unitarias | Implementadas |
| Panel e inversor (RF-02) | Unitarias | Implementadas |
| Algoritmo de layout solar (RF-03) | Unitarias | Implementadas |
| Edición manual de bloques (SQ-64) | Unitarias + integración + paridad | En revisión |
| Clientes y validación de identificación (RF-12) | Unitarias + integración + paridad | Implementadas |
| Precios de materiales (RF-09) | Integración | Implementadas |
| CORS y configuración | Unitarias | Implementadas |
| Migraciones (ciclo completo, *head* única) | CI | Implementadas |
| Diagnóstico de servicios | Integración | Implementadas |
| Autenticación y autorización | Unitarias | Pendiente — Sprint 6 |
| Flujo completo del usuario | Extremo a extremo | Pendiente — Sprint 8 |

## Ejecución

```bash
cd 02_codigo_fuente/backend
pytest

cd 02_codigo_fuente/calc-service
pytest
```
