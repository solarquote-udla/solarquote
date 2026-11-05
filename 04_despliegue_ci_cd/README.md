# 04 — Despliegue e integración continua

Configuración y documentación del despliegue del sistema.

## Contenido

### `guias/`

| Documento | Descripción |
|---|---|
| `DESPLIEGUE.md` | Procedimiento completo de publicación en Railway, Vercel y Neon, incluyendo variables de entorno, separación de bases de datos y resolución de problemas frecuentes. |
| `DATOS-DE-PRUEBA.md` | Cómo identificar clientes y proyectos de prueba que hayan quedado en producción, y la propuesta para darlos de baja antes de la aceptación con HEXtructure. |

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
| Backend principal, microservicio de cálculo y microservicio de IA (tres servicios, un solo proyecto) | Railway | Hobby | 5 USD/mes, con 5 USD de uso incluidos; el excedente se cobra aparte |
| Base de datos | Neon | Free | Sin costo — ver la nota de abajo sobre el límite de almacenamiento |
| API de Claude (Anthropic), usada por el microservicio de IA | Anthropic | Prepago | Según uso; se define un límite de gasto mensual en la consola |

Los bocetos y las fotos de validación se guardan en la base (no en un
almacenamiento aparte), así que cuentan contra el límite de Neon Free.
Conviene vigilarlo según crece el uso real.

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
merge a develop → Railway redespliega backend, calc-service e ia-service
                → Vercel redespliega el frontend
```

Cada pull request genera además una previsualización en Vercel con URL
propia, que permite revisar los cambios antes de aprobarlos.
