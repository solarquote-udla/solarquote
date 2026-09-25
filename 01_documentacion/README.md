# 01 — Documentación

Documentación técnica y de gestión del proyecto.

## Contenido

### `arquitectura/`

| Documento | Descripción |
|---|---|
| `MODELOS-COMPARTIDOS.md` | Acuerdo sobre las entidades `Cliente` y `Proyecto`, consumidas por más de un módulo. Define qué campos tienen, por qué la cotización conserva un snapshot de los datos del cliente, y la regla de que ningún integrante los modifica sin avisar al otro. |
| `DECISIONES-SEGURIDAD.md` | Registro de decisiones de seguridad con las alternativas evaluadas y su justificación: almacenamiento del token, autorización por capas, hashing de contraseñas y mensajes de error del login. |

### `gestion/`

| Documento | Descripción |
|---|---|
| `ROADMAP.md` | Planificación por sprints con entregables y criterios de aceptación. |
| `jira/solarquote-backlog.csv` | Backlog completo: épicas, historias con criterios de aceptación y subtareas. Es la fuente del tablero Scrum en Jira. |

### `manuales/`

| Documento | Descripción |
|---|---|
| `SETUP-LOCAL.md` | Puesta en marcha del entorno de desarrollo. |

## Pendiente

La documentación del diseño de la solución (diagramas C4 de los cuatro
niveles y modelo entidad-relación) se incorpora en `arquitectura/` durante
el Sprint 5, según el roadmap.
