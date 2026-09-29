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

### Contrato de `GET /api/clientes`

El alta de proyectos (Joseph) elige el cliente de este listado, que
implementa RF-12 (Esteban). Lo único que se consume es:

| Campo | Obligatorio | Uso |
|---|---|---|
| `id` | Sí | Se envía como `cliente_id` al crear el proyecto |
| `nombre` | Sí | Texto de la opción en el selector |
| `identificacion` | Sí | Se muestra junto al nombre para distinguir homónimos |
| `activo` | No | Si viene en `false`, el cliente se oculta del selector |

La respuesta es un **arreglo** de clientes, no un objeto paginado. Si más
adelante se pagina, hay que acordarlo antes: el selector dejaría de ver a
los clientes que no estén en la primera página.

Cualquier campo adicional que devuelva RF-12 se ignora sin romper nada.

El backend de proyectos rechaza con 422 un `cliente_id` inexistente o dado
de baja, así que el filtro de `activo` en el frontend es comodidad, no
seguridad.

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

### Gestión de proyectos

Endpoints mínimos, de Joseph, bajo `/api/proyectos` (solo Gerente General):
alta, listado y detalle. Consumen el modelo sin modificarlo.

Un detalle de diseño: el listado indica si cada proyecto ya tiene terreno
(`tiene_terreno`). Se resuelve con una consulta aparte en el servicio y no
con una relación en `Proyecto`, justamente para no tocar el modelo
compartido por algo que solo usa el Módulo 1.

### Lo que NO va en Proyecto

El Módulo 1 (Layout) agrega tablas propias colgando de `proyecto_id`:

- Terreno y caminos (RF-01, Sprint 2) — **implementado**
- Configuración de equipo (panel, inversor) — RF-02
- Bloques generados por el algoritmo — RF-03

Esas tablas son de Joseph y no están bajo la regla de modelos compartidos.

Al definir el terreno, el proyecto pasa de `borrador` a `en_diseno`. Solo
avanza desde `borrador`: redefinir el terreno de un proyecto ya diseñado o
cotizado no lo hace retroceder.

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
   │                │ (Módulo 1, de Joseph)
   │                ├── Terreno 1 ── N Camino
   │                ├── ConfiguracionEquipo
   │                └── BloqueGenerado
   │                │
   └────────────────┴──── N Cotizacion ──── N ItemCotizacion
                              │
                              └── snapshot: cliente_nombre, email, teléfono
```
