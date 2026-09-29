# Despliegue

Guía para dejar SolarQuote corriendo en línea.

| Servicio | Plataforma | Carpeta | Estado |
|---|---|---|---|
| Frontend | Vercel | `02_codigo_fuente/frontend` | Desplegado |
| Backend principal | Railway | `02_codigo_fuente/backend` | Desplegado |
| Microservicio de cálculo | Railway | `02_codigo_fuente/calc-service` | Pendiente (ver Parte 2) |
| Base de datos | Neon | — | Desplegado |

> **Orden importante:** primero el backend, después el frontend. El frontend
> necesita conocer la URL del backend para construirse.

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

> **Durante el Sprint 2 se despliega desde `develop`**, para poder iterar
> sobre la configuración sin ceremonia.
>
> **Al cerrar el sprint**: se mergea `develop` → `main` y se cambia esta
> rama a `main`. De ahí en adelante, producción sale de `main` y solo se
> actualiza al cerrar cada sprint.

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

> **Todavía no se despliega**, a propósito:
>
> - El backend aún no lo llama: falta el endpoint de orquestación de RF-06.
> - DS-05 (autenticación entre servicios) sigue abierto.
> - Un segundo servicio consume el crédito de Railway sin aportar nada
>   mientras nadie lo invoque.
>
> Se despliega cuando se integre RF-06 y se cierre DS-05. Los pasos quedan
> documentados para ese momento.

### 2.1 Segundo servicio, mismo proyecto

Dentro del proyecto de Railway: **New** → **GitHub Repo** → `solarquote`

Tenerlos en el mismo proyecto permite que se comuniquen por red interna.

### 2.2 Configurar

**Settings** → **Source**

| Campo | Valor |
|---|---|
| Root Directory | `02_codigo_fuente/calc-service` |
| Branch | `develop` |

Renómbralo a `solarquote-calc`.

Variables:

| Variable | Valor |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `False` |
| `CORS_ORIGINS` | La URL del backend |
| `SERVICIO_SECRETO` | El secreto compartido (ver DS-05) |

### 2.3 Conectar backend → calc-service

Railway expone variables internas entre servicios del mismo proyecto.
En el servicio **backend**, agrega:

```
CALC_SERVICE_URL=http://solarquote-calc.railway.internal:8080
```

> La red interna no sale a internet: es más rápida y no consume ancho de
> banda facturable.

⚠️ **Antes de generar un dominio público para calc-service**, cierra DS-05
(autenticación entre servicios). Si solo se comunica internamente, no
generes dominio — así queda inaccesible desde fuera.

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

Además del dominio de producción, cada despliegue tiene su propia URL
(`solarquote-<hash>-<equipo>.vercel.app`). **Esas URLs no pasan CORS** y
el login falla con "No se pudo conectar con el servidor", un mensaje
engañoso porque el backend está bien: es el navegador el que bloquea.

Para probar, usa siempre el dominio de producción. Habilitar las
previsualizaciones de PR requiere `allow_origin_regex` en el middleware de
CORS; está pendiente.

---

## Parte 4 — Despliegue continuo

Queda configurado automáticamente:

```
merge a la rama configurada → Railway redespliega backend y calc-service
                            → Vercel redespliega frontend
```

Durante el Sprint 2 esa rama es `develop`; a partir del cierre del sprint,
`main`.

Cada PR hacia `develop` genera además una previsualización en Vercel con URL
propia. Por ahora solo sirve para revisar pantallas que no llaman a la API
(ver 3.5).

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

---

## Problemas comunes

**El build de Railway falla con `No such file or directory`**
El Root Directory no está configurado. Debe ser `02_codigo_fuente/backend` o `02_codigo_fuente/calc-service`.

**`Application failed to respond`**
Falta `--host 0.0.0.0` en el comando de arranque. Sin eso, uvicorn solo
escucha en localhost y Railway no lo alcanza. Ya viene en `railway.json`.

**CORS: `blocked by CORS policy`, o "No se pudo conectar con el servidor"**
`CORS_ORIGINS` no incluye el dominio desde el que estás entrando, o lo
escribiste con barra final. Debe ser exactamente
`https://solarquote-hextructure.vercel.app`. Si entraste por la URL de un
despliegue concreto (con hash), ver 3.5.

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
