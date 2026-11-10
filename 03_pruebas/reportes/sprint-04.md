# Reporte de pruebas — Sprint 4

**Periodo:** 24 de octubre – 6 de noviembre de 2026
**Estrategia aplicada:** [ESTRATEGIA-PRUEBAS.md](../estrategia/ESTRATEGIA-PRUEBAS.md)

Medición sobre `develop` al 6 de noviembre de 2026 (tras el PR #67).
Punto de partida del corte: PR #48 (trazabilidad SQ-135/SQ-136), con **633
pruebas** (413 backend, 150 frontend, 32 calc-service, 38 ia-service).

---

## Resumen

| Indicador | Valor |
|---|---|
| Pruebas automatizadas | **811** (511 backend + 32 calc-service + 96 ia-service + 172 frontend) |
| Aprobadas | **811 (100 %)** |
| Crecimiento del corte | +178 pruebas (633 → 811) |
| Ejecución | En cada PR y en cada push a `develop`, en GitHub Actions |
| Pull requests integrados | 17 (#49, #50, #52 a #67, salvo #51) |
| Pull requests descartados | 1 (#51, cerrado sin mergear: duplicaba el fix de RF-09 que #49 ya traía) |
| Defectos encontrados | 10 (2 altos, 4 medios, 4 bajos) |
| Defectos abiertos | 0 |

---

## Pull requests de este corte

| # | Título | Qué agrega |
|---|---|---|
| #49 | fix: alinear RF-08, RF-09 y RF-13 con su especificación | `precio ≥ 0` en RF-09, búsqueda en el catálogo de inversores (RF-08), bocetos procesados en el tablero (RF-13) |
| #50 | feat: validación de materiales — despacho, recepción y seguimiento (RF-14 a RF-16) | Módulo completo de validación con conteo de varillas por IA, locking de concurrencia y trazabilidad del lote |
| #52 | feat(RF-07): proforma en Word y Excel | Generación de la proforma institucional, formato Ecuador, Excel con fórmulas editables |
| #53 | docs(diagrama-er): generar el ER desde los modelos | `DIAGRAMA-ER.md` pasa de 17 a 24 tablas, generado por script en vez de a mano |
| #54 | fix(RF-07): pendientes de la revisión del #52 | Formato de la proforma (kWp, porcentajes, singular/plural), limpieza de dependencias, nota del diagrama ER |
| #55 | chore: kit de pruebas de aceptación | `evaluar_ia.py`, `metricas_aceptacion.py` y el protocolo de aceptación con HEXtructure (RNF-01, RNF-03) |
| #56 | feat: rehacer `datos_demo.py` | Cliente, inversor y proyecto de demostración listos para generar el layout, para la revisión de la semana 8 |
| #57 | fix(ia-service): pedir la herramienta en modo auto | Corrige el error 400 de producción (`tool_choice` no admitido por el modelo) |
| #58 | feat(ia-service): PDF como mosaico de imágenes | La IA lee el PDF de CAD como imágenes en vez de como texto |
| #59 | docs(despliegue): guía con la configuración real de Railway | Corrige variables y nombres de servicio documentados contra lo real desplegado |
| #60 | feat(ia-service): leer los PDF de CAD por geometría | Lectura exacta del PDF sin IA cuando trae los paneles como vectores |
| #61 | docs(pruebas): reporte de pruebas del Sprint 3 (corte 3) | Este mismo reporte, en su primera versión (luego dividido en Sprint 3 y Sprint 4) |
| #62 | docs(pruebas): checklist de compatibilidad para RNF-05 | Checklist y registro para recorrer Chrome, Firefox, Edge y Safari |
| #63 | feat(RNF-06): disponibilidad con UptimeRobot y `/health/servicios` | Endpoint que consulta calc-service e ia-service por red interna; procedimiento de disponibilidad rehecho (Railway no monitorea de forma continua) |
| #64 | chore(frontend): actualizar dependencias vulnerables | 15 → 10 vulnerabilidades, 0 altas, sin tocar lo que rompería el build |
| #65 | fix(backend): avisar correr alembic en vez del error crudo de SQL | `datos_demo.py` detecta la falta de migraciones antes de fallar con un error de Postgres sin traducir |
| #66 | feat(backend): reporte de datos de prueba en producción | Script de solo lectura para encontrar clientes/proyectos de prueba en Railway antes de la aceptación |
| #67 | fix(RNF-06): `/health/db` y `/health/servicios` responden 503 si algo falla | UptimeRobot decide por código HTTP, no por el cuerpo; el detalle de la excepción de `/health/db` deja de exponerse |

---

## Pruebas por componente (lo nuevo de este corte)

No se repite aquí el inventario completo de la suite (ver el [Sprint 2](sprint-02.md)
para la base); esta tabla es lo que se agregó entre el PR #49 y el #67.
Son los archivos principales: no suma exactamente las +178 del resumen
porque deja fuera ajustes más chicos repartidos en varios archivos
existentes (pruebas de `test_boceto.py`, de los `.test.tsx` del frontend
y de la documentación por cada PR).

| Archivo | Pruebas | Qué verifica |
|---|---|---|
| `test_validacion.py` (#50) | 30 | Despacho, recepción, locking `FOR UPDATE`, CHECKs de la base (RF-14 a RF-16) |
| `ia: test_conteo.py` (#50) | 14 | Conteo de varillas por IA |
| `test_proforma_documentos.py` (#52, #54) | 23 | Generación de Word/Excel, formato institucional, `_numero`/`_porcentaje`/`_pluralizar` |
| `test_generar_diagrama_er.py` (#53) | 7 | El diagrama generado tiene 24 tablas y la cardinalidad correcta |
| `ia: test_evaluar_ia.py` (#55) | 24 | El evaluador contra casos reales de HEXtructure (RNF-01, RNF-03) |
| `test_metricas_aceptacion.py` (#55) | 6 | Métricas de la sesión de aceptación leídas de la base |
| `test_datos_demo.py` (#56, #65) | 8 | Idempotencia del script de siembra (6); aviso de `alembic upgrade head` en vez del error crudo de SQL (2) |
| `ia: test_ia.py` (#57, #58) | +7 | Reintento en modo `"auto"`, log sin la clave, mosaico de imágenes |
| `ia: test_mosaico.py` (#58) | 6 | Render del PDF a imágenes: tamaños, rótulos, límite de páginas, PNG/JPEG |
| `ia: test_pdf_vectorial.py` (#60) | 9 | Lectura exacta del PDF por geometría, con PDF vectoriales generados en la prueba |
| `test_health.py` (#63, #67) | 6 | `/health/servicios` y `/health/db`: 200 si todo responde, 503 si algo falla, sin exponer el detalle de la excepción |
| `test_datos_prueba_produccion.py` (#66) | 3 | Filtro de clientes/proyectos de prueba, por nombre, identificación, empresa o cliente asociado |

---

## Defectos encontrados

| # | Severidad | Defecto | Cómo se detectó | Corrección |
|---|---|---|---|---|
| 1 | **Alta** | Al activar la clave real de Anthropic en Railway, todo PDF o imagen respondía error 400 (`tool_choice: type "tool"/"any" not supported for this model`): los modelos actuales no admiten forzar la herramienta | **Producción** — las pruebas simulan la respuesta de la API, así que nunca ejercitaron esa restricción real | PR #57: `tool_choice` en modo `"auto"` con un reintento si el modelo responde sin usar la herramienta |
| 2 | **Alta** | Con el boceto real de San Pablo (PDF de AutoCAD), la lectura por IA con imágenes detectó 0 de 32 bloques exactos (RNF-01 exige ≥ 90 %); el total de paneles solo erraba 7 %, pero contar líneas finas en una imagen no es algo confiable para el modelo | Medición con `scripts/evaluar_ia.py` contra un boceto real — no lo detectaban las pruebas simuladas, que no miden precisión contra un caso conocido | PR #60: si el PDF trae los paneles dibujados como vectores, se leen por geometría — 32/32 bloques, 100 % |
| 3 | Media | RF-09 exige "precio mayor o igual a cero", pero `PrecioActualizar` validaba con `gt=0`: la logística (que nace en $0) no se podía volver a poner en $0 | Revisión de código al armar la matriz de trazabilidad (PR #48) | PR #49: `gt=0` → `ge=0` |
| 4 | Media | `datos_demo.py` configuraba el equipo de demostración con 1 solo inversor; para el terreno de 100 × 60 m la pantalla del layout sugiere 5 (regla de 400 paneles por inversor), y se veía incoherente en la revisión con el tutor | Revisión manual de Joseph contra la pantalla real del layout | PR #56 (push de seguimiento): 5 inversores del mismo modelo |
| 5 | Media | `datos_demo.py` creaba los materiales de las fórmulas con nombres distintos a los de la migración `f08f77f098c9` si corría antes de que existieran, dejando dos catálogos para el mismo código | Revisión de Joseph | PR #56 (push de seguimiento): el script solo verifica el catálogo de la migración; si falta algo, pide correr `alembic upgrade head` en vez de crear un duplicado |
| 6 | Baja | Si la descarga de la proforma fallaba, el error reemplazaba toda la pantalla de la cotización: reusaba el mismo estado que el error de carga inicial | Revisión de código propia, durante el desarrollo | PR #52: estado separado (`errorDescarga`) |
| 7 | Baja | La guía de despliegue documentaba la variable de `calc-service` como `SERVICIO_SECRETO`; el nombre real en el código es `CALC_SERVICE_SECRET` — estaba así desde que se escribió esa sección | Revisión de la documentación contra el código, al confirmar la configuración real de Railway | PR #59 |
| 8 | Baja | Al mover la llamada HTTP de `conteo.py` a `ia.py` (PR #57), quedó un `import httpx` sin uso; sus pruebas seguían pasando solo porque Python comparte el mismo módulo `httpx` entre archivos — frágil si alguien limpiaba el import | Revisión del PR #57 | PR #60: se quita el import y las pruebas pasan a simular `ia.httpx.post`, donde vive la llamada real |
| 9 | Baja | El generador del diagrama ER escribía las llaves `PK`/`FK`/`UK` entre comillas; Mermaid solo dibuja el ícono de llave cuando van sin comillas, así que el diagrama no mostraría ninguna | Revisión de la sintaxis de Mermaid durante el desarrollo, antes de abrir el PR #53 | Corregido antes del PR #53 (no llegó a commitearse así) |
| 10 | Media | `/health/db` y `/health/servicios` (RNF-06) respondían siempre 200, incluso con la base caída o calc-service/ia-service sin responder — un monitor externo (UptimeRobot) decide por el código HTTP, no por el cuerpo, así que nunca hubiera detectado una caída real. Además, `/health/db` exponía el detalle de la excepción en la respuesta pública | Revisión de Joseph sobre el PR #63, ya integrado | PR #67: los dos endpoints responden 503 si algo falla; el detalle de la excepción solo va al log, nunca a la respuesta |

**Lectura:** los dos defectos altos de este corte comparten la misma causa
raíz — un comportamiento real de producción (la API de Anthropic) o de un
caso real (un boceto de HEXtructure) que ninguna prueba simulada puede
ejercitar, porque las pruebas simuladas devuelven exactamente lo que se les
programa. El primero se encontró en producción, al activar la clave real
de Anthropic en Railway (#57); el segundo, midiendo con
`scripts/evaluar_ia.py` contra un boceto real (#60, #58) — ninguno de los
dos lo detectó la suite automatizada. El resto de los defectos — todos
medios y bajos — salieron de revisión de código, igual que en el Sprint 2.

**Nota aparte, sin severidad de código:** durante este corte se encontraron
y corrigieron dos discrepancias de proceso, no de software: tickets de
Jira marcados "Finalizada" antes de que el código existiera (RF-07) y
otros "Tareas por hacer" ya completamente implementados (RF-10, RF-11,
RF-13); y un caso en el que datos reales de HEXtructure quedaron por error
en un archivo de pruebas versionado, detectado antes de llegar a
commitearse — esos datos van en variables de entorno, nunca en el código.

---

## Resuelto durante este corte

Lo que en el corte anterior quedaba pendiente para el cierre ya se
resolvió dentro de este mismo Sprint 4:

- Checklist de RNF-05 — `compatibilidad/CHECKLIST-RNF-05.md` (#62).
- Procedimiento de RNF-06, rehecho con UptimeRobot y `/health/servicios`
  en vez del monitoreo continuo que Railway no hace (#63, #67).
- `npm audit` del frontend: 15 → 10 vulnerabilidades, 0 altas (#64).
- `scripts/datos_demo.py` avisa correr `alembic upgrade head` en vez del
  error crudo de SQL (#65).
- Reporte de datos de prueba en producción, de solo lectura (#66).

## Pendiente para el cierre

- Medir RNF-01 con los 10 bocetos reales de HEXtructure (más allá del caso
  de San Pablo usado en este corte).
- Ejecutar la checklist de RNF-05 en cada navegador y llenar el registro
  (la checklist ya está lista; falta recorrerla).
- Crear la cuenta de UptimeRobot y configurar los 3 monitores de RNF-06
  (el endpoint y el procedimiento ya están listos; falta configurarlos).
- Correr `scripts/datos_prueba_produccion.py` contra la base real de
  Railway y decidir, caso por caso, qué hacer con lo que encuentre.
- Pruebas de extremo a extremo del flujo principal (Sprint 7, fuera de
  alcance de este corte).
