# Procedimiento de disponibilidad — RNF-06

RNF-06 exige disponibilidad ≥ 99 % durante el horario laboral y un tiempo
de recuperación ante fallos no mayor a 5 minutos. Este documento define
cómo se mide, con qué señales, cada cuánto se revisa y dónde queda el
registro.

## Señales disponibles

### 1. Los endpoints `/health` de los tres servicios

| Servicio | Endpoint | Qué confirma |
|---|---|---|
| Backend principal | `GET /health` | La API responde |
| Backend principal | `GET /health/db` | La conexión a Neon funciona (`{"database": "conectada"}` o el detalle del error) |
| calc-service | `GET /health` | El servicio responde |
| ia-service | `GET /health` | El servicio responde, y si `ia_configurada` es `true` (sin exponer la clave) |

**Solo el backend tiene dominio público.** calc-service e ia-service no lo
tienen a propósito (ver `04_despliegue_ci_cd/guias/DESPLIEGUE.md`, Partes
2 y 2B): solo se llaman por la red interna de Railway. Por eso su
disponibilidad no se puede revisar con un `curl` externo — se revisa con
la señal 2.

### 2. El panel de Railway, por cada uno de los tres servicios

Cada `railway.json` ya configura `healthcheckPath: "/health"` y
`restartPolicyType: "ON_FAILURE"` (hasta 5 reintentos): Railway golpea
`/health` por su cuenta y reinicia el servicio solo si deja de responder,
incluidos calc-service e ia-service por la red interna, aunque no tengan
dominio público.

En **Railway → el servicio → pestaña Metrics**, por cada uno de los tres:

- **Uptime** del período.
- **Deployments**: historial de despliegues y si alguno falló el health
  check al arrancar.
- **Restarts**: cuántos y, en los logs, por qué (`ON_FAILURE` los dispara
  cuando `/health` deja de responder o el proceso se cae).

### 3. Anthropic (solo para ia-service)

La consola de Anthropic muestra el estado de su API y el uso frente al
límite de gasto mensual configurado (ver `DESPLIEGUE.md`, 2B.5). Si
Anthropic está caído, `ia_configurada` en el `/health` de ia-service sigue
en `true` (la clave está puesta), pero cargar un PDF o una foto responde
502 — por eso una revisión también intenta, al menos una vez, cargar un
boceto real, no solo mirar `/health`.

## Procedimiento

**Cada cuánto:** una vez por semana mientras el proyecto sigue en
desarrollo activo (mismo ritmo que los despliegues a `develop`); a diario
durante la semana de la revisión de aceptación con HEXtructure y la
entrega final.

**Quién:** cualquiera del equipo con acceso al proyecto de Railway.

**Pasos de cada revisión:**

1. `GET /health` y `GET /health/db` del backend, desde su URL pública
   (`04_despliegue_ci_cd/README.md` tiene el dominio actual).
2. En Railway, revisar Metrics de los tres servicios: uptime, reinicios y
   su causa en los logs.
3. Cargar un boceto DXF o PDF real contra el sistema (confirma backend →
   ia-service de punta a punta, no solo que el proceso esté vivo).
4. Si algo falló en la semana: cuánto tardó Railway en reiniciar el
   servicio (el timestamp del primer fallo y el del reinicio exitoso, en
   los logs de Railway), para medirlo contra el límite de 5 minutos.
5. Registrar el resultado en [REGISTRO-RNF-06.md](REGISTRO-RNF-06.md).

**Dónde se registra:** [REGISTRO-RNF-06.md](REGISTRO-RNF-06.md), en esta
misma carpeta — una fila por revisión. El cálculo de disponibilidad del
período (para comparar contra el 99 %) se hace al cierre, sumando el
tiempo de caída que señalen los registros semanales contra las horas del
horario laboral de ese período.
