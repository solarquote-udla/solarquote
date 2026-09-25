# Modelos compartidos

Acuerdo entre Joseph y Esteban sobre las tablas que ambos módulos consumen.

---

## Regla

`Cliente` y `Proyecto` son **modelos compartidos**. Ninguno de los dos los
modifica sin avisar al otro. Cualquier cambio a estos archivos va en un PR
con review obligatorio del otro.

Archivos bajo esta regla:

- `backend/app/models/cliente.py`
- `backend/app/models/proyecto.py`

---

## Cliente (RF-12)

Tabla `clientes`. Datos maestros del cliente.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int | PK |
| `nombre` | str(150) | Persona natural o razón social |
| `tipo_identificacion` | enum | `cedula`, `ruc`, `pasaporte` |
| `identificacion` | str(20) | Único. Cédula 10 díg., RUC 13 díg. |
| `empresa` | str(150)? | |
| `email` | str(255)? | |
| `telefono` | str(30)? | |
| `direccion` | str(255)? | |
| `activo` | bool | Baja lógica, no se borran |

**Por qué baja lógica:** un cliente con cotizaciones históricas no se puede
eliminar sin romper el historial.

---

## Proyecto

Tabla `proyectos`. Raíz del trabajo técnico.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | int | PK |
| `nombre` | str(150) | |
| `cliente_id` | FK → clientes | |
| `usuario_id` | FK → usuarios | Quién lo creó |
| `ubicacion` | str(255)? | Provincia, cantón, referencia |
| `latitud` / `longitud` | Numeric(10,7)? | Para orientación solar |
| `estado` | enum | `borrador` → `en_diseno` → `disenado` → `cotizado` |
| `notas` | str(500)? | |

### Lo que NO va en Proyecto

El Módulo 1 (Layout) agregará en el Sprint 3 tablas propias colgando de
`proyecto_id`:

- Terreno (geometría, caminos)
- Configuración de equipo (panel, inversor)
- Bloques generados por el algoritmo

Esas tablas son de Joseph y no están bajo la regla de modelos compartidos.

---

## Relación con Cotización

`Cotizacion` guarda **dos cosas a la vez**:

1. **Llaves foráneas** `cliente_id` y `proyecto_id` (nullable) — para poder
   navegar la relación y responder "todas las cotizaciones del cliente X"
2. **Campos snapshot** `cliente_nombre`, `cliente_email`, etc. — para
   congelar los datos al momento de emitir

### Por qué las dos

Una proforma es un documento comercial. Si el cliente cambia de teléfono en
marzo, la proforma emitida en enero debe seguir mostrando el teléfono de
enero. Pero al mismo tiempo se necesita la relación para el historial y los
reportes.

Así se modelan facturas y proformas en sistemas reales: relación viva +
copia congelada.

### Por qué las FK son nullable

Permite cotizar a un cliente que todavía no está en el catálogo (caso real:
llamada rápida, se cotiza al vuelo). El snapshot se llena igual, y la FK se
puede asociar después.

---

## Diagrama

```
Cliente 1 ──── N Proyecto
   │                │
   │                │ (Sprint 3, de Joseph)
   │                ├── Terreno
   │                ├── ConfiguracionEquipo
   │                └── BloqueGenerado
   │                │
   └────────────────┴──── N Cotizacion ──── N ItemCotizacion
                              │
                              └── snapshot: cliente_nombre, email, teléfono
```
