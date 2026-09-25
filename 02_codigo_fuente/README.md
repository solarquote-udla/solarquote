# 02 — Código fuente

Código de los cuatro contenedores de la arquitectura desacoplada.

## Contenedores

| Carpeta | Tecnología | Responsabilidad | Despliegue |
|---|---|---|---|
| `backend/` | FastAPI + SQLAlchemy | API principal, autenticación, persistencia y orquestación | Railway |
| `frontend/` | React + TypeScript + Vite | Interfaz de usuario | Vercel |
| `calc-service/` | FastAPI | Cálculo de materiales y armado de la cotización | Railway |
| `ia-service/` | FastAPI + Claude API | Interpretación de bocetos y conteo de varillas | Railway |

## Organización interna del backend

```
backend/
├── app/
│   ├── core/        Configuración, base de datos, seguridad y dependencias
│   ├── models/      Entidades SQLAlchemy
│   ├── schemas/     Validación de entrada y salida con Pydantic
│   ├── routers/     Endpoints HTTP agrupados por módulo
│   └── services/    Lógica de negocio
├── alembic/         Migraciones versionadas de la base de datos
├── scripts/         Utilidades de administración
└── tests/           Pruebas automatizadas
```

La separación entre `routers` y `services` es deliberada: los routers solo
traducen entre HTTP y la lógica de negocio, que vive en los servicios y
puede probarse sin levantar el servidor.

## Por qué las pruebas están aquí y no en `03_pruebas/`

pytest descubre las pruebas por convención de ubicación, y la canalización
de integración continua las ejecuta desde la raíz de cada servicio. Moverlas
fuera rompería ambas cosas.

`03_pruebas/` contiene la **documentación y evidencia** de las pruebas:
estrategia, matriz de trazabilidad y reportes de ejecución por sprint.

## Puesta en marcha

Ver `01_documentacion/manuales/SETUP-LOCAL.md`.

> Ningún archivo `.env` está versionado. Cada servicio incluye su
> `.env.example` con las variables requeridas.
