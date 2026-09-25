# Setup del entorno local

Guía para dejar el backend corriendo en tu máquina.

---

## Requisitos previos

| Herramienta | Versión mínima | Verificar con | Descargar |
|---|---|---|---|
| Python | 3.11 | `python --version` | https://www.python.org/downloads/ |
| Node.js | 20 | `node --version` | https://nodejs.org |
| Git | 2.x | `git --version` | https://git-scm.com |

> **Windows:** al instalar Python, marca la casilla **"Add Python to PATH"**.
> Si no lo hiciste, tendrás que reinstalarlo.

---

## 1. Crear el entorno virtual

Un *entorno virtual* (venv) es una carpeta aislada con las librerías de este
proyecto. Evita que se mezclen con las de otros proyectos de tu compu.

```bash
cd "C:\.....\SolarQuote\SolarQuote\solarquote\02_codigo_fuente\backend"
```

```bash
python -m venv venv
```

Esto crea una carpeta `venv/` (ya está en `.gitignore`, no se sube).

---

## 2. Activar el entorno virtual

**PowerShell (Windows):**
```powershell
.\venv\Scripts\Activate.ps1
```

**CMD (Windows):**
```cmd
venv\Scripts\activate.bat
```

**Git Bash / Linux / Mac:**
```bash
source venv/bin/activate
```

Sabrás que funcionó porque el prompt cambia a:
```
(venv) PS C:\...\backend>
```

> **Si PowerShell da error de "ejecución de scripts está deshabilitada":**
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> Responde `S` (sí) y vuelve a intentar activar.

**Importante:** tienes que activar el venv **cada vez** que abras una terminal
nueva para trabajar en el backend.

---

## 3. Instalar dependencias

Con el venv activado:

```bash
pip install -r requirements.txt
```

Tarda 1–3 minutos. Instala FastAPI, SQLAlchemy, y todo lo demás.

---

## 4. Crear el archivo `.env`

Copia la plantilla:

**PowerShell:**
```powershell
Copy-Item .env.example .env
```

**Git Bash / Linux / Mac:**
```bash
cp .env.example .env
```

Ahora abre `.env` y llena dos cosas:

### `SECRET_KEY`
Genera una clave aleatoria:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
Copia el resultado y pégalo en `SECRET_KEY=`

### `DATABASE_URL`
Todavía no la tenemos — la sacamos de Neon en el siguiente paso.
**Por ahora déjala como está**, la API arranca igual (solo fallará
`/health/db`, que es justo lo que queremos comprobar después).

---

## 5. Arrancar el servidor

```bash
uvicorn app.main:app --reload
```

Deberías ver:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

`--reload` significa que el servidor se reinicia solo cada vez que guardas
un archivo. No lo uses en producción.

---

## 6. Verificar que funciona

Abre en el navegador:

| URL | Qué deberías ver |
|---|---|
| http://localhost:8000 | `{"mensaje": "SolarQuote API v0.1.0", ...}` |
| http://localhost:8000/health | `{"status": "ok", ...}` |
| http://localhost:8000/docs | La documentación interactiva (Swagger) |

**`/docs` es tu mejor amigo.** FastAPI genera esa página automáticamente a
partir del código. Desde ahí puedes probar cualquier endpoint sin escribir
frontend ni usar Postman.

---

## Para detener el servidor

`Ctrl + C` en la terminal.

---


## Problemas comunes

**`'python' no se reconoce como un comando`**
Python no está en el PATH. Reinstálalo marcando "Add Python to PATH", o usa `py` en lugar de `python`.

**`No module named 'app'`**
Estás en la carpeta equivocada. Tienes que estar en `02_codigo_fuente/backend/`, no en `backend/app/`.

**`ModuleNotFoundError: No module named 'fastapi'`**
No activaste el venv, o no instalaste las dependencias.

**El puerto 8000 está ocupado**
```bash
uvicorn app.main:app --reload --port 8001
```

**`ValidationError: SECRET_KEY Field required`**
No creaste el `.env`, o le falta esa variable.
