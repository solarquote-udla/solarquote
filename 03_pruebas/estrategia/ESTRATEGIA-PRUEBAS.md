# Estrategia de pruebas — SolarQuote

Historia: SQ-134 · Vigente desde el Sprint 2 · Responde a la sección 7.3
del formato capstone.

Este documento describe **cómo se prueba** SolarQuote: qué se prueba en
cada nivel, con qué herramientas, en qué ambientes y qué condición debe
cumplir un cambio para entrar a la rama principal.

---

## 1. Principios

1. **Las reglas de negocio se prueban como funciones puras.** El cálculo de
   materiales f(L, A, B), la geometría del terreno, el algoritmo de layout,
   la validación de cédula y RUC: todo vive en funciones sin base de datos
   ni HTTP, con casos cuyo resultado se calcula a mano y se deja escrito en
   la prueba.
2. **Lo que toca la base se prueba contra PostgreSQL real**, no contra un
   sustituto. SQLite no tiene JSONB ni los ENUM de Postgres, y las
   diferencias aparecerían recién en producción.
3. **Ningún cambio entra a `develop` ni a `main` sin pasar el CI.** Los
   checks son obligatorios en los rulesets de GitHub; nadie puede saltarlos.
4. **Cuando la misma regla vive en dos lugares, se prueba que coincidan.**
   La validación del frontend replica la del backend para avisar antes de
   enviar; se verifica la paridad con miles de casos generados al azar.

---

## 2. Niveles de prueba

| Nivel | Qué cubre | Herramienta | Dónde |
|---|---|---|---|
| **Unitarias** | Funciones puras: fórmulas, geometría, layout, validaciones | pytest | `02_codigo_fuente/*/tests/` |
| **Integración** | Servicios contra PostgreSQL: crear, editar, recalcular, rechazar | pytest + fixture `db` | `02_codigo_fuente/backend/tests/` |
| **Contrato entre servicios** | Backend ↔ calc-service: formato de la petición y respuesta | pytest + `httpx` simulado | `test_calc_service.py` |
| **Migraciones** | `upgrade → downgrade → upgrade` y una sola *head* | Alembic en el CI | `.github/workflows/ci.yml` |
| **Paridad frontend–backend** | La misma regla da el mismo resultado en TypeScript y en Python | Script con casos aleatorios | Ver §5 |
| **Estática del frontend** | Tipos y reglas de estilo | `tsc` + ESLint | CI, job `frontend` |
| **Extremo a extremo** | Flujo completo del usuario en el navegador | Pendiente (Sprint 8) | — |
| **Aceptación** | Criterios de cada historia en Jira | Revisión manual + evidencias | `05_evidencias/` |

### 2.1 Cómo se escribe una prueba unitaria

Cada caso deja el cálculo a mano en el docstring, de modo que quien lea la
prueba pueda verificarla sin ejecutar nada. Ejemplo real
(`tests/test_layout.py`):

```
Columnas: floor((100 + 2) / 11,112) = 9.
Por columna: 2 bloques completos ocupan 56,432 m; sobran 3,568 m,
menos el pasillo quedan 1,568 m → 1 panel más (bloque 4 × 1).
Total: 9 × (2 × 96 + 4) = 1764 paneles.
```

### 2.2 Cómo se aísla una prueba de integración

El fixture `db` (`tests/conftest.py`) abre una transacción antes de cada
prueba y la revierte al terminar. Las pruebas no dependen del orden en que
corren ni dejan datos para la siguiente.

---

## 3. Ambientes

| Ambiente | Base de datos | Uso |
|---|---|---|
| **CI** (GitHub Actions) | Postgres 16 desechable, base `solarquote_ci` | Todas las pruebas en cada PR y en cada push a `develop`/`main` |
| **Local** | `solarquote_test` en Neon (`TEST_DATABASE_URL`) | El desarrollador antes de subir cambios |
| **Desarrollo** | `neondb` en Neon | Probar la aplicación a mano. **Nunca** para pytest |
| **Producción** | `solarquote_prod` en Neon | Solo la aplicación desplegada |

**Protección de la base de desarrollo.** Las pruebas borran todas las
tablas al terminar. Para evitar accidentes, solo corren contra una base
cuyo nombre contenga `test` o termine en `_ci`; con cualquier otra, las
pruebas de integración se saltan con un aviso. La regla nació de un
incidente real del Sprint 2 (ver el reporte del sprint).

---

## 4. Canalización de integración continua

`.github/workflows/ci.yml` corre tres jobs en paralelo:

| Job | Pasos |
|---|---|
| `backend` | Instalar dependencias → pytest → verificar una sola *head* de Alembic → `upgrade → downgrade → upgrade` |
| `calc-service` | Instalar dependencias → pytest |
| `frontend` | `npm ci` → ESLint → `tsc -b && vite build` |

**Criterio de entrada a `develop` y `main`** (rulesets de GitHub):

- Los tres jobs en verde.
- La rama al día con la base (*require branches to be up to date*).
- Una aprobación del otro integrante.
- Merge con *merge commit*; nunca *squash* ni *force push*.

---

## 5. Pruebas de paridad

Dos reglas existen a la vez en el backend y en el frontend:

| Regla | Backend | Frontend | Verificación |
|---|---|---|---|
| Cédula, RUC, pasaporte y teléfono | `services/validaciones_identificacion.py` | `utils/identificacion.ts` | 21 009 identificaciones y 1 509 teléfonos, 0 diferencias |
| Validez de un bloque editado | `services/calculo_layout.py` (`validar_bloques`) | `utils/edicionLayout.ts` | 4 000 escenarios con terrenos cóncavos, caminos, rotación y casos a milímetros del límite, 0 diferencias |

**Procedimiento:** se generan casos al azar con semilla fija, se
evalúan con ambas implementaciones y se comparan uno a uno. Se repite
cada vez que cambia cualquiera de las dos copias.

---

## 6. Datos de prueba

- **Casos de referencia del negocio:** la cotización EMIHANA
  (L = 4, A = 28, 12 bloques) y el panel de 2278 × 1134 mm, con resultados
  calculados a mano.
- **Identificaciones válidas de ejemplo:** cédula `1710034065`,
  RUC `1710034065001`.
- **Datos de demostración:** `scripts/datos_demo.py` crea un cliente y un
  proyecto en la base de desarrollo; se niega a correr en producción.

---

## 7. Clasificación de defectos

| Severidad | Criterio | Ejemplo del proyecto |
|---|---|---|
| **Crítica** | Pérdida de datos o caída del sistema | Las pruebas borraban la base de desarrollo |
| **Alta** | Resultado incorrecto en un documento comercial | La cotización no guardaba el total ni los precios usados |
| **Media** | Falla de una funcionalidad con alternativa | El login fallaba desde las previews de Vercel |
| **Baja** | Mensaje confuso o problema de comodidad | Mensaje de "auto-intersección" para vértices colineales |

Cada defecto encontrado se registra en el reporte del sprint
(`03_pruebas/reportes/`) con su severidad, cómo se detectó y el PR que lo
corrigió.

---

## 8. Pendiente

| Qué | Cuándo |
|---|---|
| Pruebas de los endpoints de autenticación | Sprint 6 |
| Pruebas extremo a extremo del flujo cliente → proforma | Sprint 8 |
| Medición de cobertura de código (`pytest-cov`) | Sprint 3 |
| Pruebas del microservicio de IA contra bocetos reales (RNF: ≥ 90 % de detección) | Sprint 5 |
