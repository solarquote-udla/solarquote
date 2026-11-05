# Reporte de pruebas — Sprint 3

**Periodo:** 21 de octubre – 5 de noviembre de 2026
**Estrategia aplicada:** [ESTRATEGIA-PRUEBAS.md](../estrategia/ESTRATEGIA-PRUEBAS.md)

Medición sobre `develop` al 5 de noviembre de 2026 (commit `843f319`).
Punto de partida del corte: PR #48 (trazabilidad SQ-135/SQ-136), con **633
pruebas** (413 backend, 150 frontend, 32 calc-service, 38 ia-service).

---

## Resumen

| Indicador | Valor |
|---|---|
| Pruebas automatizadas | **800** (500 backend + 32 calc-service + 96 ia-service + 172 frontend) |
| Aprobadas | **800 (100 %)** |
| Crecimiento del corte | +167 pruebas (633 → 800) |
| Ejecución | En cada PR y en cada push a `develop`, en GitHub Actions |
| Pull requests integrados | 10 (#49, #50, #52, #53, #54, #55, #56, #57, #58, #60) |
| Pull requests descartados | 1 (#51, cerrado sin mergear: duplicaba el fix de RF-09 que #49 ya traía) |
| Defectos encontrados | 9 (2 altos, 3 medios, 4 bajos) |
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
| #60 | feat(ia-service): leer los PDF de CAD por geometría | Lectura exacta del PDF sin IA cuando trae los paneles como vectores |

---

## Pruebas por componente (lo nuevo de este corte)

No se repite aquí el inventario completo de la suite (ver el [Sprint 2](sprint-02.md)
para la base); esta tabla es lo que se agregó entre el PR #49 y el #60.
Son los archivos principales: no suma exactamente las +167 del resumen
porque deja fuera ajustes más chicos repartidos en varios archivos
existentes (pruebas de `test_boceto.py`, de los `.test.tsx` del frontend
y de la documentación por cada PR).

| Archivo | Pruebas | Qué verifica |
|---|---|---|
| `test_boceto_despacho.py` / `test_validacion_*.py` (#50) | 30 | Despacho, recepción, locking `FOR UPDATE`, CHECKs de la base (RF-14 a RF-16) |
| `ia: test_conteo.py` (#50) | 14 | Conteo de varillas por IA |
| `test_proforma_documentos.py` (#52, #54) | 23 | Generación de Word/Excel, formato institucional, `_numero`/`_porcentaje`/`_pluralizar` |
| `test_generar_diagrama_er.py` (#53) | 7 | El diagrama generado tiene 24 tablas y la cardinalidad correcta |
| `ia: test_evaluar_ia.py` (#55) | 24 | El evaluador contra casos reales de HEXtructure (RNF-01, RNF-03) |
| `test_metricas_aceptacion.py` (#55) | 6 | Métricas de la sesión de aceptación leídas de la base |
| `test_datos_demo.py` (#56) | 6 | Idempotencia del script de siembra |
| `ia: test_ia.py` (#57, #58) | +7 | Reintento en modo `"auto"`, log sin la clave, mosaico de imágenes |
| `ia: test_mosaico.py` (#58) | 6 | Render del PDF a imágenes: tamaños, rótulos, límite de páginas, PNG/JPEG |
| `ia: test_pdf_vectorial.py` (#60) | 9 | Lectura exacta del PDF por geometría, con PDF vectoriales generados en la prueba |

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

**Lectura:** los dos defectos altos de este corte comparten la misma causa
raíz — un comportamiento real de producción (la API de Anthropic) o de un
caso real (un boceto de HEXtructure) que ninguna prueba simulada puede
ejercitar, porque las pruebas simuladas devuelven exactamente lo que se les
programa. Los dos se encontraron probando contra la API real antes de
integrar (#57) o midiendo con `scripts/evaluar_ia.py` contra un boceto real
(#60, #58), no con la suite automatizada. El resto de los defectos — todos
medios y bajos — salieron de revisión de código, igual que en el Sprint 2.

**Nota aparte, sin severidad de código:** durante este corte se encontraron
y corrigieron dos discrepancias de proceso, no de software: tickets de
Jira marcados "Finalizada" antes de que el código existiera (RF-07) y
otros "Tareas por hacer" ya completamente implementados (RF-10, RF-11,
RF-13); y un caso en el que datos reales de HEXtructure (RUC, cuenta
bancaria) quedaron por error en un archivo de pruebas versionado, antes de
llegar a commitearse — lo bloqueó el clasificador de seguridad del entorno
de desarrollo.

---

## Pendiente para el cierre

- Checklist de RNF-05 (compatibilidad: Chrome, Firefox, Edge y Safari o el
  navegador del celular).
- Procedimiento para medir RNF-06 (fiabilidad) con las métricas de Railway
  y los `/health` de los tres servicios.
- `npm audit` del frontend: separar vulnerabilidades de producción y de
  desarrollo, actualizar lo que no rompa nada.
- `scripts/datos_demo.py`: sin migraciones, el script muestra el error de
  SQL en vez de pedir `alembic upgrade head` (detalle opcional de la
  revisión del #56, no bloqueante).
- Medir RNF-01 con los 10 bocetos reales de HEXtructure (más allá del caso
  de San Pablo usado en este corte).
- Listar los datos de prueba que quedaron en la base de producción de
  Railway y proponer cómo darlos de baja antes de la aceptación con
  HEXtructure.
