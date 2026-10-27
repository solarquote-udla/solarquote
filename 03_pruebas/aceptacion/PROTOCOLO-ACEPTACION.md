# Protocolo de pruebas de aceptación

Cómo se verifica, con HEXtructure y con datos reales, lo que las pruebas
automatizadas no pueden verificar. De aquí salen las cifras de la sección
7.4 (Resultados y Discusión) y del Resumen del documento.

| | |
|---|---|
| Período | Diciembre de 2026 – enero de 2027 (sección 7.3.1) |
| Participantes | Santiago Guagalango (Gerente General), una persona del Personal de Producción, Desarrollador 1 (facilita) y Desarrollador 2 (registra) |
| Ambiente | Ambiente controlado (Vercel y Railway) con la clave de Anthropic configurada y el catálogo real de materiales, precios e inversores |
| Registro | [REGISTRO-SESION.md](REGISTRO-SESION.md), una copia por sesión |

## 1. Qué se mide y con qué criterio

| ID | Medición | Criterio | Origen del criterio | Cómo se mide |
|---|---|---|---|---|
| M1 | Detección correcta de bloques en bocetos reales | ≥ 90 % | RNF-01 | `evaluar_ia.py bocetos` (sección 4) |
| M2 | Tiempo de procesamiento del boceto | ≤ 30 s | RNF-03 | `evaluar_ia.py bocetos` y cronómetro en la sesión |
| M3 | Precisión del conteo de varillas | Por acordar con HEXtructure (propuesta: error ≤ 2 % en 9 de cada 10 fotos) | RF-14 (el requisito no fija un umbral) | `evaluar_ia.py conteo` |
| M4 | Tiempo por cotización con el sistema | Menor a los 45 min del proceso manual | Sección 1.1 | Cronómetro en la sesión y `metricas_aceptacion.py` |
| M5 | Usabilidad percibida | Puntaje SUS ≥ 68 (promedio de referencia de la escala) | ISO/IEC 25010, usabilidad | Cuestionario SUS al final de cada sesión |
| M6 | Correcciones manuales en la confirmación del boceto | Se reporta (sin umbral) | RF-05 | `metricas_aceptacion.py` |
| M7 | Casos de aceptación aprobados | 8 de 8, sin defectos críticos ni altos abiertos | Estrategia de pruebas | Sección 3, firmado por HEXtructure |

**Definición de M1.** Para cada tipo de bloque del boceto (mismo L y A),
si la proforma tiene B bloques y la IA detectó B′, son correctos
min(B, B′). La tasa es la suma de bloques correctos sobre la suma de
bloques esperados, en todos los bocetos. Los bloques que la IA inventa o
cuenta de más se reportan aparte (inflan los materiales). Si la IA parte un
tipo en dos filas (4×24 ×5 y 4×24 ×3), cuenta como 4×24 ×8, porque las
fórmulas f(L, A, B) dan los mismos materiales.

## 2. Preparación (una semana antes)

1. **Bocetos con su respuesta correcta.** Pedir a HEXtructure 10 bocetos
   reales que ya hayan sido cotizados, junto con la proforma de cada uno.
   La proforma trae en sus notas las líneas `L= A= BLOQUES=` de cada ítem:
   esa es la respuesta correcta, sin que nadie tenga que volver a contar.
   Conviene que haya variedad: PDF limpio, foto tomada con celular, plano
   escaneado, varios tipos de bloque, plano girado y, si existen, DXF.
2. **Fotos de atados contadas a mano.** 10 fotos de atados de varillas
   (VAR1650 y VAR1350), de frente, con el conteo manual de cada una. Dos
   personas cuentan por separado; si difieren, se vuelve a contar.
3. **Carpetas de casos.** Copiar las plantillas de `plantillas/` a
   `casos/bocetos/esperado.json` y `casos/fotos/esperado.json`, poner los
   archivos junto a ellas y llenar los valores.

   > Los bocetos y las proformas tienen datos de clientes. La carpeta
   > `casos/` está excluida de git: **no se sube al repositorio**, que es
   > público. Se guarda en el Drive del equipo.

4. **Medición previa (M1, M2 y M3).** Ejecutar el evaluador con tres
   repeticiones por caso, porque la IA puede variar entre corridas
   (sección 4). El script informa el costo real en la API.
5. **Ambiente.** Base de datos sin datos de prueba anteriores, catálogo de
   precios vigente, usuarios de Santiago y de Producción creados con sus
   perfiles reales.

## 3. Casos de aceptación

Cada caso se ejecuta con el usuario real del perfil indicado. El
facilitador no toca el teclado; si el participante se detiene más de
2 minutos, se anota en el registro y se le ayuda.

| ID | Requisitos | Escenario | Se acepta si |
|---|---|---|---|
| CA-01 | RF-11 | Santiago y el operario inician sesión con sus cuentas | Cada uno ve solo las opciones de su perfil; Producción solo ve Validación de materiales |
| CA-02 | RF-01 a RF-03, RF-05 | Santiago genera el layout de un terreno real que ya cotizó (terreno, caminos, panel e inversores) y lo confirma | El layout respeta los caminos y los límites de string; la potencia en kWp es coherente con la que él calculó; se emite la cotización |
| CA-03 | RF-04, RF-05 | Santiago carga un boceto real en PDF o imagen, revisa los bloques y los confirma | Los bloques confirmados coinciden con los de su proforma; el diagrama aparece en ≤ 30 s (M2) |
| CA-04 | RF-04 | Santiago carga un plano DXF (si HEXtructure tiene uno) | Los bloques coinciden sin correcciones |
| CA-05 | RF-06, RF-07 | Con el resultado de CA-03, Santiago revisa la cotización y descarga la proforma en Word y en Excel | Las cantidades de los diez materiales coinciden con su proforma manual; Santiago acepta el formato para enviarla a un cliente |
| CA-06 | RF-08 a RF-10, RF-12, RF-13 | Santiago actualiza un precio, registra un cliente, busca la cotización en el historial y revisa el tablero | El precio nuevo se usa en la siguiente cotización y no cambia las anteriores; el tablero refleja las cotizaciones de la sesión |
| CA-07 | RF-14 | El operario registra el despacho del lote de CA-05 con la foto de un atado real | El conteo de la IA se puede corregir; si difiere de lo cotizado, el sistema pide la justificación |
| CA-08 | RF-15, RF-16 | El operario registra la recepción con el checklist y Santiago marca la instalación | La línea de tiempo muestra cotizada, despachada, recibida e instalada con fechas y responsables |

## 4. Herramientas

### Evaluador de la IA (M1, M2, M3)

Desde `02_codigo_fuente/ia-service`, con el entorno virtual activado y
`ANTHROPIC_API_KEY` en el `.env` (los DXF no la necesitan):

```powershell
python -m scripts.evaluar_ia bocetos ..\..\03_pruebas\aceptacion\casos\bocetos --repeticiones 3
python -m scripts.evaluar_ia conteo  ..\..\03_pruebas\aceptacion\casos\fotos   --repeticiones 3
```

Imprime una fila por ejecución y el resumen (tasa de detección frente al
90 %, tiempos frente a los 30 s, exactitud del conteo y costo), y deja
`resultados_bocetos.csv` y `.json` en la carpeta de casos. El `.json`
guarda lo que devolvió la IA, para analizar cada error.

### Métricas de la base (M4, M6)

Desde `02_codigo_fuente/backend`, apuntando a la base del ambiente donde
se hizo la sesión; solo lee:

```powershell
python -m scripts.metricas_aceptacion --desde 2026-12-07 --hasta 2026-12-11
```

El tiempo que informa va desde que se crea el proyecto hasta que se emite
la proforma, con pausas incluidas: es una cota superior. El valor que se
reporta como M4 es el del cronómetro.

### Cuestionario SUS (M5)

Al final de cada sesión, cada participante responde las diez afirmaciones
del [registro](REGISTRO-SESION.md) de 1 (totalmente en desacuerdo) a 5
(totalmente de acuerdo). Puntaje: en las afirmaciones impares se resta 1 a
la respuesta; en las pares, la respuesta se resta de 5; la suma se
multiplica por 2,5 (escala de 0 a 100). Con dos participantes el puntaje
es indicativo, y así se reporta.

## 5. Defectos

Los defectos se registran con la severidad de la estrategia de pruebas
(crítica, alta, media, baja), se corrigen en una rama `fix/` con la prueba
que lo reproduce y se vuelve a ejecutar el caso. La aceptación exige cero
defectos críticos o altos abiertos.

## 6. Del registro al documento

| Resultado | Dónde va |
|---|---|
| M1 a M7 con su criterio y si se cumple | Tabla de resultados de la sección 7.4 |
| M1 y M2 | Filas RNF-01 y RNF-03 de la Tabla 44 (de "Pendiente" a "Aprobado" o "No cumple") |
| Defectos de la sesión | Nuevo corte en la Tabla 46 |
| Aceptación firmada | Anexo del documento |
| Tasa de detección, tiempo por cotización y SUS | Resumen y Abstract |
