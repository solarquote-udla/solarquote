# 04 — Despliegue e integración continua

Configuración y documentación del despliegue del sistema.

## Contenido

### `guias/`

| Documento | Descripción |
|---|---|
| `DESPLIEGUE.md` | Procedimiento completo de publicación en Railway, Vercel y Neon, incluyendo variables de entorno, separación de bases de datos y resolución de problemas frecuentes. |

### `configuracion/`

Archivos de configuración compartidos entre entornos.

## Dónde está cada configuración

Algunos archivos de despliegue **no** están en esta carpeta porque las
plataformas los leen desde ubicaciones fijas:

| Archivo | Ubicación real | Motivo |
|---|---|---|
| `.github/workflows/` | Raíz del repositorio | GitHub Actions solo lee esa ruta |
| `railway.json` | Raíz de cada servicio | Railway lo busca en el directorio raíz configurado |
| `vercel.json` | `02_codigo_fuente/frontend/` | Vercel lo busca en el directorio raíz del proyecto |

## Infraestructura

| Servicio | Plataforma | Plan | Costo aproximado |
|---|---|---|---|
| Frontend | Vercel | Hobby | Sin costo |
| Backend principal | Railway | Hobby | 5 USD/mes |
| Microservicio de cálculo | Railway | Hobby | 5 USD/mes |
| Base de datos | Neon | Free | Sin costo |

## Separación de entornos

| Entorno | Base de datos | Origen del despliegue |
|---|---|---|
| Desarrollo | `solarquote` | Local, archivos `.env` de cada integrante |
| Producción | `solarquote_prod` | Railway y Vercel |

Desarrollo y producción **no comparten base de datos**. Probar una migración
en local marcaría esa revisión como aplicada también para producción, y el
siguiente despliegue fallaría al no encontrar el archivo correspondiente.

## Despliegue continuo

```
merge a main → Railway redespliega backend y microservicios
             → Vercel redespliega el frontend
```

Cada pull request genera además una previsualización en Vercel con URL
propia, que permite revisar los cambios antes de aprobarlos.
