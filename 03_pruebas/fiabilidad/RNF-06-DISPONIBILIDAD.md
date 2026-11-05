# Procedimiento de disponibilidad — RNF-06

RNF-06 exige disponibilidad ≥ 99 % durante el horario laboral y un tiempo
de recuperación ante fallos no mayor a 5 minutos. Este documento define
cómo se mide, con qué señales, cada cuánto se revisa y dónde queda el
registro.

## Por qué no basta con Railway

El `railway.json` de cada servicio configura `healthcheckPath: "/health"`
y `restartPolicyType: "ON_FAILURE"`, pero esto **no** es un monitor
continuo: según la documentación de Railway, el healthcheck solo corre
una vez, al desplegar (para decidir si el despliegue tuvo éxito), y
`ON_FAILURE` solo reinicia el servicio si el proceso se cae — no si sigue
vivo pero `/health` empieza a fallar. Railway no vuelve a golpear
`/health` después de ese chequeo inicial. Por eso Railway no puede medir
ni el 99 % de disponibilidad ni los 5 minutos de recuperación: no hay
nadie preguntando "¿sigues respondiendo?" cada cierto tiempo mientras el
servicio corre.

Lo que sí mide eso es un monitor externo que pregunte periódicamente, y
eso es lo que define este procedimiento.

## Señales

### 1. UptimeRobot (monitor externo, gratuito)

Un monitor HTTP(S) cada 5 minutos contra:

| Monitor | URL | Qué confirma |
|---|---|---|
| Backend — API | `GET /health` del backend, dominio público | La API responde |
| Backend — base de datos | `GET /health/db` del backend, dominio público | La conexión a Neon funciona |
| Backend — calc-service e ia-service | `GET /health/servicios` del backend, dominio público | Ver sección 2 |

UptimeRobot registra, por cada monitor: el porcentaje de uptime del
período y, por cada caída, cuándo empezó y cuándo se recuperó — las dos
cifras que pide RNF-06 (99 % y 5 minutos), sin depender de revisar logs
de Railway a mano.

**Configuración** (una cuenta free de [uptimerobot.com](https://uptimerobot.com)):

1. Crear un monitor tipo "HTTP(s)" por cada URL de la tabla, intervalo de
   5 minutos.
2. Alertas por correo al equipo cuando un monitor caiga y cuando se
   recupere (de ahí sale la hora exacta de cada evento).
3. El dashboard público de cada monitor (o un export) es lo que se
   adjunta al registro al cierre del período.

### 2. `GET /health/servicios` del backend

calc-service e ia-service **no tienen dominio público** a propósito (ver
`04_despliegue_ci_cd/guias/DESPLIEGUE.md`, Partes 2 y 2B): solo se les
llama por la red interna de Railway. UptimeRobot, al ser externo, no
puede golpearlos directo.

Por eso el backend expone `GET /health/servicios`
(`app/routers/health.py`): internamente llama al `/health` de
calc-service y de ia-service por la red interna de Railway
(`CALC_SERVICE_URL`, `IA_SERVICE_URL`) y responde con el estado de cada
uno, sin exponer nada más:

```json
{"calc_service": "ok", "ia_service": "ok"}
```

o, si alguno no respondió o respondió distinto de 200:

```json
{"calc_service": "ok", "ia_service": "caído"}
```

Así el único monitor de UptimeRobot contra `/health/servicios` cubre
también la disponibilidad de los dos servicios sin dominio público. La
prueba del endpoint está en `tests/test_health.py` (mockeando `httpx.get`
para los dos casos: ambos arriba, y cada uno caído por separado).

### 3. Anthropic (solo para ia-service)

La consola de Anthropic muestra el estado de su API y el uso frente al
límite de gasto mensual configurado (ver `DESPLIEGUE.md`, 2B.5). Si
Anthropic está caído, `/health/servicios` sigue mostrando `ia_service:
"ok"` (el proceso de ia-service está vivo, solo Anthropic no responde) —
por eso una revisión también intenta, al menos una vez, cargar un boceto
real que dependa de la IA (una imagen o un PDF sin geometría), no solo
mirar `/health/servicios`.

## Procedimiento

**Cada cuánto:**

- UptimeRobot corre solo, cada 5 minutos, sin intervención — es la
  fuente principal de la medición.
- Revisión manual (los 4 pasos de abajo): una vez por semana mientras el
  proyecto sigue en desarrollo activo; a diario durante la semana de la
  revisión de aceptación con HEXtructure y la entrega final.

**Quién:** cualquiera del equipo con acceso a la cuenta de UptimeRobot y
al proyecto de Railway.

**Pasos de cada revisión manual:**

1. Revisar el dashboard de UptimeRobot: uptime del período por cada uno
   de los 3 monitores, y si hubo caídas, cuándo empezaron y cuándo se
   recuperaron (esto ya da la duración exacta, sin tocar logs de
   Railway).
2. Si `/health/servicios` marcó algún servicio `"caído"` en algún punto
   de la semana, revisar en Railway los logs de ese servicio para la
   causa (reinicio por `ON_FAILURE`, error de arranque, etc.).
3. Cargar un boceto real (idealmente uno que dependa de Anthropic, no
   solo de la lectura por geometría) contra el sistema — confirma backend
   → ia-service de punta a punta, incluido Anthropic, que ningún `/health`
   ejercita.
4. Registrar el resultado en [REGISTRO-RNF-06.md](REGISTRO-RNF-06.md).

**Dónde se registra:** [REGISTRO-RNF-06.md](REGISTRO-RNF-06.md), en esta
misma carpeta — una fila por revisión semanal, más la tabla de incidentes
con los tiempos que da UptimeRobot. El cálculo de disponibilidad del
período (para comparar contra el 99 %) se hace al cierre, con el
porcentaje que reporta UptimeRobot para cada monitor contra las horas del
horario laboral de ese período.
