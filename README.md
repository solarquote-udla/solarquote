# SolarQuote

Sistema web para la gestión y cotización de estructuras fotovoltaicas de
**HEXtructure S.A.S.**

**Proyecto Capstone** — Universidad de Las Américas · Ingeniería de Software

| | |
|---|---|
| **Autores** | Joseph Augusto Flores Iza · Esteban Alejandro Narváez Acurio |
| **Tutor** | Roberth Patricio Almeida Serrano |
| **Cliente** | HEXtructure S.A.S. — Ibarra, Imbabura |
| **Periodo** | Septiembre 2026 – Enero 2027 |

---

## Qué resuelve

HEXtructure fabrica estructuras metálicas reutilizables para paneles
fotovoltaicos montados sobre suelo. Hoy cotiza cada proyecto calculando los
materiales a mano sobre hojas de cálculo, un proceso lento y propenso a
errores que además no deja trazabilidad de lo despachado ni de lo recibido
en obra.

SolarQuote automatiza ese proceso: interpreta el diseño, calcula los
materiales requeridos, genera la proforma comercial y da seguimiento a la
propuesta hasta su instalación.

---

## Estructura del repositorio

```
solarquote/
├── 01_documentacion/      Arquitectura, gestión del proyecto y manuales
├── 02_codigo_fuente/      Código de los cuatro contenedores
├── 03_pruebas/            Estrategia, trazabilidad y reportes de pruebas
├── 04_despliegue_ci_cd/   Configuración y guías de despliegue
├── 05_evidencias/         Evidencias del proceso por sprint
└── .github/workflows/     Canalización de integración continua
```

> **`.github/workflows/` vive en la raíz por obligación técnica:** GitHub
> Actions solo lee esa ruta exacta. Moverla dentro de `04_despliegue_ci_cd/`
> desactivaría la integración continua.

> **El código de pruebas acompaña a cada servicio** (`backend/tests/`,
> `calc-service/tests/`), como exigen pytest y la canalización de CI.
> `03_pruebas/` contiene la documentación y evidencia de pruebas —
> estrategia, matriz de trazabilidad y reportes de ejecución.

---

## Arquitectura

Arquitectura desacoplada de cinco contenedores, seleccionada sobre una
alternativa monolítica mediante matriz de decisión ponderada bajo
ISO/IEC 25010:2023 (puntaje 4,25 frente a 3,70).

| Contenedor | Tecnología | Plataforma | Ubicación |
|---|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Vercel | `02_codigo_fuente/frontend/` |
| Backend principal | FastAPI + SQLAlchemy | Railway | `02_codigo_fuente/backend/` |
| Microservicio de cálculo | FastAPI | Railway | `02_codigo_fuente/calc-service/` |
| Microservicio de IA | FastAPI + Claude API | Railway | `02_codigo_fuente/ia-service/` |
| Base de datos | PostgreSQL | Neon | — |

---

## Alcance funcional

Dieciséis requerimientos funcionales organizados en cinco módulos.

| Módulo | Requerimientos | Descripción |
|---|---|---|
| 1 — Layout | RF-01 a RF-03 | Terreno y caminos, selección de equipo, generación del layout solar |
| 2 — Boceto | RF-04, RF-05 | Interpretación de bocetos mediante IA y edición del diseño |
| 3 — Cotización | RF-06, RF-07 | Cálculo de materiales y generación de proforma editable |
| 4 — Administración | RF-08 a RF-13 | Catálogos, clientes, historial e indicadores |
| 5 — Validación | RF-14 a RF-16 | Despacho con conteo por IA, recepción y seguimiento |

**Actores:** Gerente General (todos los módulos) y Personal de Producción
(únicamente el módulo de validación).

---

## Puesta en marcha

Instrucciones completas en
[`01_documentacion/manuales/SETUP-LOCAL.md`](01_documentacion/manuales/SETUP-LOCAL.md).

```bash
git clone <url-del-repositorio>
cd solarquote/02_codigo_fuente
```

**Requisitos:** Python 3.12, Node.js 20, Git.

> Las credenciales y secretos **no** están en el repositorio. Cada servicio
> incluye un archivo `.env.example` con las variables necesarias.

---

## Documentación

| Documento | Contenido |
|---|---|
| [Modelos compartidos](01_documentacion/arquitectura/MODELOS-COMPARTIDOS.md) | Acuerdo sobre las entidades que ambos módulos consumen |
| [Decisiones de seguridad](01_documentacion/arquitectura/DECISIONES-SEGURIDAD.md) | Registro de decisiones con alternativas evaluadas |
| [Roadmap](01_documentacion/gestion/ROADMAP.md) | Planificación por sprints hasta la entrega |
| [Product Backlog](01_documentacion/gestion/jira/solarquote-backlog.csv) | Épicas, historias y subtareas gestionadas en Jira |
| [Setup local](01_documentacion/manuales/SETUP-LOCAL.md) | Puesta en marcha del entorno de desarrollo |
| [Despliegue](04_despliegue_ci_cd/guias/DESPLIEGUE.md) | Publicación en Railway, Vercel y Neon |

---

## Metodología

**Scrum** con iteraciones de dos semanas. La planificación, el backlog y las
evidencias de ejecución se gestionan en Jira; las capturas por sprint se
archivan en `05_evidencias/`.

### Flujo de trabajo

```
main          producción — solo se actualiza al cerrar un sprint
 └── develop  integración continua del equipo
      └── feat/SQ-00-descripcion
```

Todo cambio entra por pull request con revisión del otro integrante. Nadie
mergea su propio trabajo sin aprobación.

### Convención de commits

```
<tipo>(<alcance>): <descripción en imperativo>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

```
feat(layout): agregar cálculo de área útil descontando caminos
fix(auth): corregir expiración del token
```
