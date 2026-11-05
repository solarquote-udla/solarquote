# Despliegue

Guía para dejar SolarQuote corriendo en línea.

| Servicio | Plataforma | Carpeta | Estado |
|---|---|---|---|
| Frontend | Vercel | `02_codigo_fuente/frontend` | Desplegado |
| Backend principal | Railway | `02_codigo_fuente/backend` | Desplegado |
| Microservicio de cálculo | Railway | `02_codigo_fuente/calc-service` | Desplegado (ver Parte 2) |
| Microservicio de bocetos (IA) | Railway | `02_codigo_fuente/ia-service` | Desplegado (ver Parte 2B) |
| Base de datos | Neon | — | Desplegado |

> **Orden importante:** primero el backend, después el frontend. El frontend
> necesita conocer la URL del backend para construirse.

> **Regla: los secretos de producción nunca son los mismos que los de
> desarrollo.** `SECRET_KEY`, `CALC_SERVICE_SECRET`, `IA_SERVICE_SECRET` y
> `ANTHROPIC_API_KEY` se generan o se cargan aparte para Railway — nunca se
> copia el valor del `.env` local. Si un `.env` local se filtra alguna vez,
> producción no se ve afectada.

---

## Regla: bases de datos separadas

**Desarrollo y producción no comparten base de datos.** Ambas viven en el
mismo proyecto de Neon, como bases distintas:

| Entorno | Base | Quién la usa |
|---|---|---|
| Desarrollo | `neondb` (la que Neon crea por defecto) | Los `.env` locales |
| Producción | `solarquote_prod` | Railway |

### Por qué

Alembic guarda en la tabla `alembic_version` la última migración aplicada.
Si desarrollo y producción comparten base, probar una migración en local la
marca como aplicada también para producción, y el siguiente despliegue de
una rama que no la contiene falla con:

```
Can't locate revision identified by 'xxxxx'
```

Ocurrió en el Sprint 2 y costó una tarde. Además, un despliegue podría
alterar los datos con los que se está trabajando en local.

### Cómo se creó la base de producción

Neon → **Databases** → **New Database** → `solarquote_prod`. El connection
string es el mismo que el de desarrollo cambiando el nombre de la base al
final:

```
postgresql://usuario:password@host.neon.tech/solarquote_prod?sslmode=require
```

---

## Parte 1 — Backend en Railway

### 1.1 Crear el proyecto

1. Entra a https://railway.com y regístrate con GitHub
2. **New Project** → **Deploy from GitHub repo** → elige `solarquote`
3. Railway va a intentar desplegar la raíz del repo y **fallará**. Es normal:
   es un monorepo y todavía no sabe qué carpeta usar.

### 1.2 Apuntar a la carpeta correcta

En el servicio recién creado: **Settings** → **Source**

| Campo | Valor |
|---|---|
| Root Directory | `02_codigo_fuente/backend` |
| Branch | `develop` |

> **Se despliega desde `develop`** mientras el proyecto sigue en
> desarrollo activo, para poder iterar sin la ceremonia de un merge a
> `main` en cada sprint.
>
> **Al cerrar el proyecto** (entrega final): se mergea `develop` → `main`
> y se cambia esta rama a `main`. De ahí en adelante, producción sale
> solo de `main`.

Renombra el servicio a `solarquote-backend` en **Settings → General**.

### 1.3 Variables de entorno

**Variables** → **New Variable**. Una por una:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | El de **`solarquote_prod`** — nunca el de tu `.env` (ver la regla de bases separadas) |
| `SECRET_KEY` | **Genera una nueva**, distinta a la de desarrollo |
| `ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `False` |
| `CORS_ORIGINS` | Se llena en el paso 3.4 |
| `CALC_SERVICE_URL` | Se llena en el paso 2.3 |
| `CALC_SERVICE_SECRET` | Se llena en el paso 2.3 (DS-05) |
| `IA_SERVICE_URL` | Se llena en el paso 2B.3 |
| `IA_SERVICE_SECRET` | Se llena en el paso 2B.3 (DS-05) |
| `HEXTRUCTURE_RAZON_SOCIAL`, `HEXTRUCTURE_TELEFONO`, `HEXTRUCTURE_CORREO`, `HEXTRUCTURE_DIRECCION`, `HEXTRUCTURE_REPRESENTANTE`, `HEXTRUCTURE_CARGO_REPRESENTANTE` | Datos de la empresa para la proforma (RF-07) — ver `.env.example` para la lista completa |
| `HEXTRUCTURE_RUC`, `HEXTRUCTURE_BANCO_*` | **Pendientes a propósito** (ver RF-07): el documento los omite mientras no estén listos para publicarse |

Para la `SECRET_KEY` de producción:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

> **Nunca reutilices la clave de desarrollo en producción.** Si tu `.env`
> local se filtra alguna vez, los tokens de producción seguirían siendo
> seguros.

### 1.4 Exponer el servicio

**Settings** → **Networking** → **Generate Domain**

Te da una URL tipo `solarquote-backend-production.up.railway.app`. **Anótala.**

### 1.5 Verificar

```
https://tu-backend.up.railway.app/health
https://tu-backend.up.railway.app/health/db
https://tu-backend.up.railway.app/docs
```

Los tres deben responder. `/health/db` confirma que Railway alcanza a Neon.

> `railway.json` ejecuta `alembic upgrade head` antes de arrancar, así que
> las migraciones se aplican solas en cada despliegue.

---

## Parte 2 — calc-service en Railway

Desplegado en el mismo proyecto de Railway que el backend, con DS-05
(autenticación entre servicios) ya cerrado.

### 2.1 Segundo servicio, mismo proyecto

Dentro del proyecto de Railway: **New** → **GitHub Repo** → `solarquote`

Tenerlos en el mismo proyecto permite que se comuniquen por red interna.

### 2.2 Configurar

**Settings** → **Source**

| Campo | Valor |
|---|---|
| Root Directory | `02_codigo_fuente/calc-service` |
| Branch | `develop` |
| Wait for CI | Activado |

> **Wait for CI** hace que Railway espere a que los checks de GitHub
> Actions terminen en verde antes de desplegar — así un commit que rompe
> las pruebas no llega a producción solo porque el build de Railway en sí
> haya salido bien. Actívalo en los tres servicios (backend, calc-service
> e ia-service).

Renómbralo a `solarquote-calc`.

Variables:

| Variable | Valor |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `False` |
| `CORS_ORIGINS` | La URL del backend |
| `CALC_SERVICE_SECRET` | El secreto compartido (ver DS-05); mismo valor que en el backend |

### 2.3 Conectar backend → calc-service

Railway expone variables internas entre servicios del mismo proyecto.
En el servicio **backend**, agrega:

```
CALC_SERVICE_URL=http://solarquote-calc.railway.internal:8080
```

> La red interna no sale a internet: es más rápida y no consume ancho de
> banda facturable.

**calc-service no tiene dominio público** — solo se comunica con el
backend por la red interna, protegido además por `CALC_SERVICE_SECRET`
(DS-05). Así queda inaccesible desde fuera del proyecto de Railway.

---

## Parte 2B — ia-service en Railway (RF-04)

Lee los bocetos del cliente. Los DXF se procesan directo de la geometría,
sin IA. Los PDF se intentan igual, por geometría (`pdf_vectorial.py`);
solo si el PDF no trae los paneles dibujados como vectores (escaneo,
plano girado) se envía a la API de Claude (Anthropic), igual que las
imágenes (PNG/JPG), que siempre van por ahí. Sin clave de Anthropic el
servicio arranca igual: los DXF y los PDF con geometría funcionan; los
PDF sin geometría y las imágenes responden 503 con un mensaje claro.

### 2B.1 Tercer servicio, mismo proyecto

**New** → **GitHub Repo** → `solarquote`. Renómbralo a `solarquote-ia`.

| Campo | Valor |
|---|---|
| Root Directory | `02_codigo_fuente/ia-service` |
| Branch | `develop` |
| Wait for CI | Activado (ver la nota en la Parte 2) |

### 2B.2 Variables de ia-service

| Variable | Valor |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `False` |
| `PORT` | `8080` — fijo, no lo deja al valor que Railway asigna solo. La URL interna (`solarquote-ia.railway.internal:8080`, paso 2B.3) necesita un puerto estable para apuntar a él |
| `IA_SERVICE_SECRET` | Secreto aleatorio largo (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
| `ANTHROPIC_API_KEY` | La clave de la API de Anthropic. Solo aquí: nunca en el repositorio ni en un chat |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` — se fija explícito en vez de dejarlo en el valor por defecto del código, para que un cambio futuro de ese default no mueva producción sin que alguien lo decida |

No se le genera dominio público: solo lo llama el backend por la red
interna (`solarquote-ia.railway.internal`). Así nadie de fuera puede
gastar el crédito de la API de Anthropic.

### 2B.3 Conectar backend → ia-service

En el servicio **backend**:

```
IA_SERVICE_URL=http://solarquote-ia.railway.internal:8080
IA_SERVICE_SECRET=<el mismo valor que en ia-service>
```

### 2B.4 Verificar

Desde el backend, `GET /health` de ia-service debe responder
`"ia_configurada": true` cuando la clave está puesta (nunca muestra la
clave). En la aplicación, carga un DXF y luego un PDF en **Cargar boceto**.

### 2B.5 Costo

Cada PDF o imagen que termina llamando a la API de Claude se cobra por
uso (ver la tabla de costos en `04_despliegue_ci_cd/README.md`). Define
un límite de gasto mensual en la consola de Anthropic antes de cargar la
clave en Railway. Los DXF no consumen crédito — se leen por geometría,
sin llamar a la API. Los PDF exportados de AutoCAD tampoco: si traen los
paneles dibujados como vectores, también se leen por geometría
(`pdf_vectorial.py`) y solo caen a la IA cuando el PDF no trae esa
geometría (escaneo, plano girado).

Railway en sí no cobra aparte por tener tres servicios: backend,
calc-service e ia-service comparten el mismo proyecto y el mismo plan
Hobby (ver el costo en el README).

---

## Parte 3 — Frontend en Vercel

### 3.1 Importar

1. https://vercel.com → **Add New** → **Project**
2. Importa `solarquote` desde GitHub

### 3.2 Configurar

| Campo | Valor |
|---|---|
| Framework Preset | Vite |
| Root Directory | `02_codigo_fuente/frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### 3.3 Variable de entorno

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://tu-backend.up.railway.app` |

> Sin barra al final. Las variables `VITE_*` se incrustan en el build:
> si la cambias, hay que volver a desplegar.

**Deploy**. Vercel asigna un dominio a partir del nombre del proyecto.

El dominio de producción actual es **`solarquote-hextructure.vercel.app`**.
`solarquote.vercel.app` estaba tomado: los subdominios `.vercel.app` son
globales entre todos los usuarios de Vercel.

### 3.4 Cerrar el círculo: CORS

Vuelve a Railway, servicio **backend**, y actualiza:

```
CORS_ORIGINS=https://solarquote-hextructure.vercel.app
```

Sin esto el navegador bloquea todas las peticiones. Railway redespliega solo.

> **Para cambiar el dominio sin cortar el servicio:** agrega el nuevo en
> Vercel sin quitar el viejo, pon ambos en `CORS_ORIGINS` separados por
> coma, verifica el login en el nuevo, y recién entonces quita el viejo de
> los dos lados.

### 3.5 URLs de cada despliegue

Además del dominio de producción, Vercel genera dos clases de URL:

| Clase | Formato |
|---|---|
| Por despliegue | `solarquote-<hash>-<scope>.vercel.app` |
| Por rama | `solarquote-git-<rama>-<scope>.vercel.app` |

`<scope>` es el slug de la cuenta o equipo de Vercel y es igual en todas.
Se ve en el link **Preview** que deja el bot de Vercel en cada PR: es lo que
va entre el último guion y `.vercel.app`.

Como cambian en cada despliegue, no se pueden listar en `CORS_ORIGINS`. Se
cubren con un patrón en Railway, servicio **backend**:

```
CORS_ORIGIN_REGEX=^https://solarquote-[a-z0-9-]+-<scope>\.vercel\.app$
```

Reglas del patrón:

- **Terminar en `-<scope>\.vercel\.app$`**. Sin el scope, cualquiera que
  cree en Vercel un proyecto llamado `solarquote-algo` pasaría el CORS.
- **Escapar los puntos (`\.`)**. Un `.` suelto calza con cualquier carácter.
- Un patrón con error de sintaxis impide que el backend arranque. Es a
  propósito: mejor un deploy fallido que un CORS roto en silencio.
- El formato está cubierto por `backend/tests/test_cors.py`.

El patrón no reemplaza a `CORS_ORIGINS`: producción y `localhost` siguen en
la lista fija.

**Qué tan seguro es.** El token viaja en el header `Authorization`, no en
cookies, así que el CORS no es lo que protege la sesión: un sitio ajeno no
puede leer el token guardado en otro dominio. El patrón estricto es una
segunda capa, no la principal.

**Límite importante.** Las previews usan el **mismo backend y la misma base**
que producción. Sirven para revisar cambios de pantalla. Si el PR trae
endpoints o migraciones nuevas, la preview los llama antes de que existan y
falla con 404 hasta que se haga el merge. Y lo que se guarde desde una
preview queda en la base real.

Si el login falla con "No se pudo conectar con el servidor" desde una URL
de Vercel, casi siempre es CORS (el mensaje engaña: el backend está bien,
es el navegador el que bloquea). Revisar que el scope del patrón coincida
con la URL.

---

## Parte 4 — Despliegue continuo

Queda configurado automáticamente:

```
merge a la rama configurada → Railway redespliega backend, calc-service e ia-service
                            → Vercel redespliega frontend
```

Esa rama es `develop` mientras el proyecto sigue en desarrollo activo; a
partir del cierre (entrega final), `main`.

Cada PR hacia `develop` genera además una previsualización en Vercel con URL
propia, que pasa el CORS gracias a `CORS_ORIGIN_REGEX` (ver 3.5 y sus
límites).

Antes del merge, cada PR debe pasar los checks `backend`, `calc-service`,
`ia-service` y `frontend` del workflow `.github/workflows/ci.yml`. Son obligatorios en los
rulesets de `develop` y `main`, junto con tener la rama al día con la base.

`develop` está protegida: todo cambio entra por pull request con una
aprobación. Para forzar un despliegue sin push existe un **Deploy Hook** en
Vercel (Settings → Git → Deploy Hooks). Su URL es un secreto: quien la tenga
puede disparar builds en la cuenta.

---

## Verificación final

- [ ] `https://backend.up.railway.app/health` responde `ok`
- [ ] `https://backend.up.railway.app/health/db` responde `conectada`
- [ ] `https://solarquote-hextructure.vercel.app` carga la pantalla de login
- [ ] El login funciona con un usuario real
- [ ] Tras iniciar sesión se ve el shell con la barra lateral
- [ ] Recargar la página en `/validacion` no da 404 (lo resuelve `vercel.json`)
- [ ] La consola del navegador no muestra errores de CORS
- [ ] Cargar un boceto en PDF o imagen no responde 503 ni 502 (confirma que ia-service está arriba y `IA_SERVICE_SECRET` coincide en los dos servicios)
- [ ] Una cotización calcula materiales sin error (confirma calc-service y `CALC_SERVICE_SECRET`)

---

## Problemas comunes

**El build de Railway falla con `No such file or directory`**
El Root Directory no está configurado. Debe ser `02_codigo_fuente/backend`, `02_codigo_fuente/calc-service` o `02_codigo_fuente/ia-service`.

**`Application failed to respond`**
Falta `--host 0.0.0.0` en el comando de arranque. Sin eso, uvicorn solo
escucha en localhost y Railway no lo alcanza. Ya viene en `railway.json`.

**CORS: `blocked by CORS policy`, o "No se pudo conectar con el servidor"**
`CORS_ORIGINS` no incluye el dominio desde el que estás entrando, o lo
escribiste con barra final. Debe ser exactamente
`https://solarquote-hextructure.vercel.app`. Si entraste por la URL de una
preview, revisa `CORS_ORIGIN_REGEX` (ver 3.5).

**`Can't locate revision identified by '...'`**
Railway apunta a la base de desarrollo. `DATABASE_URL` en Railway debe
terminar en `/solarquote_prod`. Ver la regla de bases separadas.

**Refrescar una ruta da 404 en Vercel**
Falta el rewrite de `vercel.json`. Verifica que el archivo esté en
`02_codigo_fuente/frontend/` y que se haya subido al repo.

**`ValidationError: DATABASE_URL Field required`**
La variable no está en Railway. Revisa que no tenga espacios al inicio o
al final al pegarla.

**Las migraciones no se aplican**
Revisa los logs del despliegue. `alembic upgrade head` corre antes de
uvicorn; si falla, el servicio no arranca.

**Cargar un boceto responde "falta IA_SERVICE_SECRET"**
Es el backend, no ia-service: `IA_SERVICE_SECRET` no está puesto en el
servicio **backend** (es opcional ahí — sin él, cargar bocetos responde
503 en vez de romper el resto de la API). Revisa que tenga el mismo valor
que en ia-service.

**"No se pudo conectar con el servicio de bocetos / de IA"**
El backend no alcanza a ia-service. Revisa `IA_SERVICE_URL` en el
backend: debe ser `http://solarquote-ia.railway.internal:8080` — el
nombre del servicio tal como quedó renombrado en Railway, y el mismo
puerto que `PORT` en ia-service (paso 2B.2). Un nombre de servicio mal
escrito o un `PORT` que no coincide dan este error, no un 404 ni un 502.

**ia-service responde con un error (404)**
`ANTHROPIC_MODEL` apunta a un nombre de modelo que no existe o ya no está
disponible en la cuenta de Anthropic. Revisa el valor contra la lista de
modelos vigentes en la documentación de Anthropic.

**ia-service responde con un error (400)**
Mensaje de Anthropic del tipo `tool_choice: type "tool" ... not supported
for this model` — pasó en producción al activar la clave la primera vez
(ver `fix/ia-tool-choice-auto`, PR #57): algunos modelos no admiten forzar
la herramienta. Si vuelve a aparecer con un modelo nuevo, revisar si ese
modelo tiene la misma limitación.
