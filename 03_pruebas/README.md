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
- [Protocolo de pruebas de aceptación](aceptacion/PROTOCOLO-ACEPTACION.md)
- [Checklist de compatibilidad (RNF-05)](compatibilidad/CHECKLIST-RNF-05.md)
- [Procedimiento de disponibilidad (RNF-06)](fiabilidad/RNF-06-DISPONIBILIDAD.md)
- [Reporte del Sprint 2](reportes/sprint-02.md)
- [Reporte del Sprint 3](reportes/sprint-03.md)

### `aceptacion/`

Protocolo de las pruebas de aceptación con HEXtructure (casos, mediciones
de RNF-01 y RNF-03, tiempo por cotización y cuestionario SUS) y el
registro que se llena en cada sesión. Los casos reales (bocetos, proformas
y fotos) no se suben: la carpeta `casos/` está excluida de git.

### `compatibilidad/`

Checklist de RNF-05 (Chrome, Firefox, Edge y Safari) y el registro que se
llena al recorrerla. Las capturas de pantalla no se suben: la carpeta
`capturas/` está excluida de git.

### `fiabilidad/`

Procedimiento para medir la disponibilidad (RNF-06) con un monitor
externo (UptimeRobot) sobre los `/health` del backend, incluido
`/health/servicios` (que cubre a calc-service e ia-service por la red
interna de Railway, sin dominio público), y el registro de cada
revisión.

### `trazabilidad/`

Qué prueba cubre cada regla de cada requisito (RF y RNF), la cobertura de
código por servicio y los huecos pendientes.

## Cobertura actual

Corte del 5 de noviembre de 2026: **811 pruebas automatizadas**, todas
aprobadas. Detalle por requisito en la
[matriz de trazabilidad](trazabilidad/MATRIZ-TRAZABILIDAD.md).

| Componente | Pruebas | Cobertura de líneas |
|---|---|---|
| Backend (API principal) | 511 | 96 % |
| calc-service | 32 | 100 % |
| ia-service | 96 | 94 % |
| Frontend (interfaz) | 172 | — |

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
