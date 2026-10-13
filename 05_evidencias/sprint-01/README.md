# Sprint 1 — Informe de cierre

> **Informe reconstruido el 7 de octubre de 2026**, al cierre del Sprint 2,
> a partir del *Sprint report* de Jira y del historial del proyecto. Las
> capturas de esta carpeta se tomaron en esa fecha.

**Periodo registrado en Jira:** 22 – 25 de septiembre de 2026
**Equipo:** Joseph Flores · Esteban Narváez
**Objetivo del sprint:** dejar la base técnica del sistema — repositorio,
backend, frontend, autenticación, modelos de datos y despliegue en la nube —
sobre la que se construyen los módulos funcionales.

---

## Contexto: cómo se registró este sprint

El trabajo del Sprint 1 se hizo en un **repositorio anterior**, antes de
migrar a la estructura institucional `01`–`05` del repositorio actual
(primer commit: 25 de septiembre). El tablero de Jira se configuró **al
final** del sprint: el backlog se importó desde
`01_documentacion/gestion/jira/solarquote-backlog.csv` el 24 de
septiembre.

Por eso, en el *Sprint report* las siete historias aparecen marcadas como
*agregadas después del inicio del sprint*, y el burndown no muestra una
bajada gradual: registra trabajo ya hecho. **El seguimiento diario en Jira
empieza en el Sprint 2**, cuyo burndown sí refleja el avance real.

Se deja explícito para que la evidencia se lea correctamente, no para
justificarla.

---

## Historias completadas

| Clave | Historia | Responsable | Pts | Estado |
|---|---|---|---|---|
| SQ-2 | Configurar repositorio y flujo de trabajo Git | Joseph | 3 | ✅ Done |
| SQ-6 | Configurar backend FastAPI con conexión a base de datos | Joseph | 5 | ✅ Done |
| SQ-11 | Configurar frontend React con Tailwind y enrutamiento | Joseph | 8 | ✅ Done |
| SQ-16 | Desplegar backend y frontend en la nube | Joseph | 5 | ✅ Done |
| SQ-29 | Autenticar usuarios con JWT | Joseph | 8 | ✅ Done |
| SQ-39 | Modelar Cliente y Proyecto | Joseph | 5 | ✅ Done |
| SQ-68 | Modelar cotizaciones y catálogo de materiales | Esteban | 8 | ✅ Done |
| | **Total** | | **42** | **7 de 7** |

---

## Incremento entregado

| Área | Qué quedó funcionando |
|---|---|
| Repositorio | Monorepo con backend, frontend, calc-service e ia-service; Git Flow (`main` ← `develop` ← `feat/*`) con ramas protegidas |
| Backend | FastAPI con configuración centralizada, SQLAlchemy, migraciones con Alembic y PostgreSQL en Neon |
| Autenticación | Login con JWT, contraseñas con hash y autorización por rol (Gerente General / Personal de Producción) |
| Frontend | React + Vite + TypeScript + Tailwind; cliente HTTP que adjunta el token; rutas protegidas; shell con menú por rol |
| Datos | Modelos compartidos `Cliente` y `Proyecto` (con su acuerdo en `MODELOS-COMPARTIDOS.md`); `Cotizacion`, `ItemCotizacion`, `Material` y `PrecioMaterial` con catálogo inicial |
| Cálculo | calc-service con las fórmulas f(L, A, B) y sus pruebas |
| Despliegue | Frontend en Vercel, backend en Railway, bases separadas de desarrollo y producción en Neon |
| Gestión | Backlog completo en Jira (149 elementos), roadmap y criterios de aceptación |

---

## Evidencias

| Archivo | Qué muestra |
|---|---|
| `informe-jira.png` | *Sprint report* de Jira: 7 historias, 42 puntos, todas completadas |
| `burndown.png` | *Burndown chart* del sprint, con el detalle de eventos |
| `retrospectiva.md` | Retrospectiva del sprint |
| `../capturas/sprint-01/01-login.png` | Pantalla de inicio de sesión en producción (SQ-29) |
| `../capturas/sprint-01/servicio_vercel.png` | Proyecto en Vercel con el dominio de producción |
| `../capturas/sprint-01/servicio_railway.png` | Servicios en Railway, en línea |
| `../capturas/sprint-01/servicio_neon.png` | Bases separadas en Neon: desarrollo, producción y pruebas |

Las capturas de servicios muestran el estado al 7 de octubre: la
infraestructura que se levantó en este sprint, ya con lo que se agregó en
el Sprint 2 (calc-service y la base de pruebas).

**No disponibles:** el backlog y el tablero tal como estaban al cierre del
sprint. Jira no guarda instantáneas de esas vistas.
