# Especificación de la API — módulos de Esteban

**Estado:** implementado y mergeado a `develop`. A diferencia de
[CONTRATO-CLIENTES.md](CONTRATO-CLIENTES.md) (que fija rutas y campos
**antes** de programar), este documento describe la API tal como quedó
construida, para el capítulo 7 del documento de titulación.

**Alcance:** los endpoints de los módulos a cargo de Esteban — RF-06
(creación de cotización), RF-08 (Inversores), RF-09 (Materiales y precios),
RF-10 (Historial de cotizaciones), RF-12 (Clientes) y RF-13 (Tablero de
indicadores). No cubre RF-01/02/03/05 (Módulo 1, de Joseph), documentados
en [ALGORITMO-LAYOUT.md](ALGORITMO-LAYOUT.md) y
[MODELOS-COMPARTIDOS.md](MODELOS-COMPARTIDOS.md).

El contrato de `Cliente` ya vigente con el frontend de Joseph está en
[CONTRATO-CLIENTES.md](CONTRATO-CLIENTES.md) y en la sección "Contrato de
`GET /api/clientes`" de MODELOS-COMPARTIDOS.md; aquí se documenta el
endpoint completo, no solo ese contrato mínimo.

---

## Reglas generales

- Todas las rutas van bajo autenticación JWT (`Usuario` autenticado); cada
  router además exige uno o más permisos del perfil (RF-11), listados por
  ruta más abajo.
- Ningún endpoint de estos módulos usa `DELETE` salvo `/api/clientes/{id}`:
  Inversor y Material se desactivan (`activo=false`) vía `PATCH`, igual que
  Cliente, pero con una ruta distinta por historia de usuario.
- Los errores de validación de Pydantic devuelven `422` con el detalle en
  español. Las reglas de negocio (duplicados, referencias inexistentes)
  devuelven `409` o `422` según el caso — se detalla en cada sección.
- Las fechas van en ISO 8601 con zona horaria (UTC en la base; el frontend
  las muestra en hora de Ecuador, ver `src/utils/fechas.ts`).

---

## RF-08 — Inversores (`/api/inversores`)

Catálogo de referencia para prellenar el formulario de configuración de
equipo (RF-02, Módulo 1). Baja lógica: un inversor descontinuado se
desactiva, nunca se borra (lo pueden estar usando proyectos ya
configurados, vía snapshot).

| Método | Ruta | Permiso | Respuesta | Uso |
|---|---|---|---|---|
| `GET` | `/api/inversores` | `inversores`, `generar_layout` o `cargar_boceto` | `200` `InversorLeer[]` | Listado (`?incluir_inactivos=`) |
| `GET` | `/api/inversores/{id}` | igual | `200` `InversorLeer` | Detalle |
| `POST` | `/api/inversores` | `inversores` | `201` `InversorLeer` | Alta |
| `PATCH` | `/api/inversores/{id}` | `inversores` | `200` `InversorLeer` | Corrección / desactivar / reactivar |

El permiso de lectura es más amplio que el de administrar a propósito:
quien genera un layout o carga un boceto necesita ver el catálogo para
elegir inversor, pero no crear ni editar inversores.

### `InversorLeer`

```json
{
  "id": 3,
  "marca": "Huawei",
  "modelo": "SUN2000-100KTL-M2",
  "potencia_kw": 100.0,
  "vmax_v": 1000.0,
  "vmin_v": 200.0,
  "mppts": 10,
  "strings_por_mppt": 2,
  "activo": true
}
```

### `InversorCrear` / `InversorActualizar`

| Campo | Obligatorio en alta | Regla |
|---|---|---|
| `marca` | Sí | 2 a 80 caracteres, espacios colapsados |
| `modelo` | Sí | 1 a 100 caracteres, espacios colapsados |
| `potencia_kw` | Sí | > 0, ≤ 10 000 |
| `vmax_v` | No | > 0, ≤ 2000. Si se envía, también debe venir `vmin_v` |
| `vmin_v` | No | > 0, ≤ 2000. Si se envía, también debe venir `vmax_v`, y `vmax_v > vmin_v` |
| `mppts` | No | 1 a 50 |
| `strings_por_mppt` | No | 1 a 50 |
| `activo` | — (solo en `PATCH`) | — |

`marca` + `modelo` son únicos juntos (`ux_inversor_marca_modelo`). En el
`PATCH`, ningún campo obligatorio del modelo (`marca`, `modelo`,
`potencia_kw`, `activo`) puede llegar explícitamente en `null` — se
rechaza con `422` antes de tocar la base, para no romper el `NOT NULL` con
un error menos claro.

### Errores

| Código | Cuándo |
|---|---|
| `404` | El `id` no existe |
| `409` | Ya existe un inversor con esa `marca` + `modelo` |
| `422` | Falla de validación (incluida la regla de Vmax/Vmin) |

---

## RF-09 — Materiales y precios (`/api/materiales`)

Catálogo de materiales usado por el cálculo `f(L,A,B)` de calc-service, y
su historial de precios. El precio nunca es una columna de `Material`:
cada cambio agrega una fila en `PrecioMaterial`, y la "vigente" es la que
tiene `vigente_hasta` en `null`.

| Método | Ruta | Permiso | Respuesta | Uso |
|---|---|---|---|---|
| `GET` | `/api/materiales` | `materiales` o `precios` | `200` `MaterialLeer[]` | Listado (`?incluir_inactivos=`) |
| `GET` | `/api/materiales/{id}` | igual | `200` `MaterialLeer` | Detalle |
| `POST` | `/api/materiales` | `materiales` | `201` `MaterialLeer` | Alta en el catálogo |
| `PATCH` | `/api/materiales/{id}` | `materiales` | `200` `MaterialLeer` | Nombre, unidad, activo (el código es fijo) |
| `GET` | `/api/materiales/{id}/precios` | `materiales` o `precios` | `200` `PrecioMaterialLeer[]` | Historial completo de precios |
| `PATCH` | `/api/materiales/{id}/precio` | `precios` | `200` `MaterialLeer` | Registra un precio nuevo |

Administrar el catálogo (`materiales`) y administrar precios (`precios`)
son permisos distintos: HEXtructure separa quién define qué materiales
existen de quién actualiza sus precios.

### `MaterialLeer`

```json
{
  "id": 12,
  "codigo": "HEX_V18MM",
  "nombre": "Varilla HEX 18mm",
  "unidad": "unidad",
  "activo": true,
  "precio_vigente": "4.50",
  "vigente_desde": "2026-09-01T00:00:00Z"
}
```

`precio_vigente` es `null` si el material todavía no tiene ningún precio
registrado (puede pasar justo después del alta).

### `PrecioMaterialLeer` (una fila del historial)

```json
{
  "id": 8,
  "precio": "4.50",
  "vigente_desde": "2026-09-01T00:00:00Z",
  "vigente_hasta": null,
  "created_at": "2026-09-01T10:12:03Z"
}
```

### `MaterialCrear` / `MaterialActualizar`

| Campo | Obligatorio en alta | Regla |
|---|---|---|
| `codigo` | Sí | 2 a 30 caracteres, se normaliza a mayúsculas; solo letras, números y `_` |
| `nombre` | Sí | 2 a 150 caracteres, espacios colapsados |
| `unidad` | No (`"unidad"` por defecto) | 1 a 20 caracteres |

El `codigo` no se puede corregir después del alta (`MaterialActualizar` no
lo incluye): lo usan las fórmulas `f(L,A,B)` del motor de cálculo, y
cambiarlo rompería esa referencia.

### `PrecioActualizar`

```json
{ "precio": 4.75 }
```

`precio` > 0, con hasta 2 decimales. El servicio cierra automáticamente el
precio anterior (`vigente_hasta = ahora`) y crea el nuevo con
`vigente_hasta = null`; no hace falta enviar fechas.

### Errores

| Código | Cuándo |
|---|---|
| `404` | El `id` no existe |
| `409` | Ya existe un material con ese `codigo` |
| `409` | (`MaterialEnUso`) intento de desactivar un material referenciado donde no corresponde |
| `422` | Falla de validación |

---

## RF-06 / RF-10 — Cotizaciones (`/api/cotizaciones`)

`POST` es el endpoint orquestador de RF-06: valida la entrada, llama a
calc-service para el desglose de materiales y el total, y persiste el
resultado. `GET` (listado y detalle) es el historial de RF-10: lee lo que
quedó persistido, no vuelve a calcular nada.

| Método | Ruta | Permiso | Respuesta | Uso |
|---|---|---|---|---|
| `POST` | `/api/cotizaciones` | `generar_layout` o `cargar_boceto` | `201` `CotizacionLeer` | Crear y calcular |
| `GET` | `/api/cotizaciones` | `historial` o `generar_layout` | `200` `CotizacionesPaginaLeer` | Historial, con filtros y paginación |
| `GET` | `/api/cotizaciones/{id}` | igual | `200` `CotizacionDetalleLeer` | Detalle completo |

El permiso para crear es el mismo que para generar un layout o cargar un
boceto: cotizar no es un permiso aparte, es parte del flujo de cálculo. El
permiso para leer el historial incluye a quien genera layouts, porque esa
persona retoma sus propios proyectos desde ahí.

### `POST /api/cotizaciones` — `CotizacionCrear`

```json
{
  "cliente_id": 7,
  "proyecto_id": 15,
  "addendum_porcentaje": 5,
  "items": [
    { "paneles_largo": 12, "paneles_ancho": 4, "bloques": 3 }
  ]
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `cliente_id` | No | Si se envía, el snapshot (`cliente_nombre`, etc.) se toma del registro de `Cliente` y los campos de abajo se ignoran |
| `cliente_nombre` | Solo si no hay `cliente_id` | 1 a 150 caracteres |
| `cliente_empresa` / `cliente_email` / `cliente_telefono` | No | — |
| `proyecto_id` | No | — |
| `proyecto_nombre` | No | — |
| `addendum_porcentaje` | No (`0` por defecto) | 0 a 100 |
| `items` | Sí, mínimo 1 | Ver `ItemCalculoEntrada` |

`ItemCalculoEntrada`: `paneles_largo` (L, **par**, > 0), `paneles_ancho`
(A, > 0), `bloques` (B, > 0). La paridad de L se valida aquí para
devolver un `422` claro, aunque calc-service también la valide — así se
evita que un rechazo normal del cálculo llegue como `502`.

Si no se envía `cliente_id`, `cliente_nombre` es obligatorio: permite
cotizar a un cliente que todavía no está en el catálogo (RF-12) — caso
real: llamada rápida, se cotiza al vuelo, y el cliente se registra después.

### `CotizacionLeer` (respuesta del `POST`)

Incluye el detalle completo que devolvió calc-service en el momento de
calcular (`calculo`), además de los datos ya persistidos:

```json
{
  "id": 42,
  "numero_proforma": null,
  "estado": "cotizada",
  "cliente_id": 7,
  "cliente_nombre": "Energy Control Cía. Ltda.",
  "cliente_empresa": "Energy Control",
  "cliente_email": "compras@energycontrol.ec",
  "cliente_telefono": "+593 99 123 4567",
  "proyecto_id": 15,
  "proyecto_nombre": "Planta Yaruquí",
  "addendum_porcentaje": "5",
  "created_at": "2026-10-18T15:04:05Z",
  "updated_at": "2026-10-18T15:04:05Z",
  "calculo": {
    "items": [
      { "paneles_largo": 12, "paneles_ancho": 4, "bloques": 3, "cantidades": { "HEX_V18MM": 36 } }
    ],
    "cantidades_totales": { "HEX_V18MM": 36 },
    "subtotal": "1620.00",
    "addendum_porcentaje": "5",
    "addendum_monto": "81.00",
    "iva_porcentaje": "15",
    "iva_monto": "255.15",
    "total": "1956.15"
  }
}
```

`numero_proforma` queda en `null`: se asigna al emitir la cotización
(flujo de RF-16, fuera de este alcance), no al crearla.

### `GET /api/cotizaciones` — historial (RF-10)

Parámetros de consulta, todos opcionales:

| Parámetro | Tipo | Efecto |
|---|---|---|
| `buscar` | texto | Coincidencia parcial contra cliente o número de proforma |
| `estado` | enum | `cotizada`, `despachada`, `recibida`, `instalada` |
| `desde` / `hasta` | fecha | Emitidas en ese rango, inclusive |
| `pagina` | int (≥ 1) | Por defecto 1 |
| `por_pagina` | int (1 a 100) | Por defecto 20 |

Respuesta — `CotizacionesPaginaLeer`:

```json
{
  "resultados": [
    {
      "id": 42,
      "numero_proforma": "SQ-0042",
      "estado": "cotizada",
      "cliente_nombre": "Energy Control Cía. Ltda.",
      "cliente_empresa": "Energy Control",
      "proyecto_id": 15,
      "proyecto_nombre": "Planta Yaruquí",
      "total": "1956.15",
      "created_at": "2026-10-18T15:04:05Z"
    }
  ],
  "total": 1,
  "pagina": 1,
  "por_pagina": 20,
  "total_paginas": 1
}
```

### `GET /api/cotizaciones/{id}` — detalle (RF-10)

`CotizacionDetalleLeer` agrega al resumen el desglose financiero completo
(`subtotal`, `addendum_monto`, `iva_porcentaje`, `iva_monto`, `total`), los
ítems (`items: ItemCotizacionLeer[]`, con `paneles_largo`/`paneles_ancho`/
`bloques`) y los materiales totales de la cotización
(`materiales: MaterialCotizadoLeer[]`, con `codigo`, `nombre`, `unidad`,
`cantidad` y `precio_unitario`, tal como se emitieron).

**Importante:** no incluye la cantidad de cada material **por ítem** — esa
nunca se guardó, solo el total por material de toda la cotización (ver
`MaterialCotizado` en el modelo). El desglose por ítem solo existe en la
respuesta del `POST`, en el momento de crear.

### Errores

| Código | Cuándo |
|---|---|
| `404` | La cotización no existe |
| `422` | Cliente o proyecto inexistente/no disponible, falta un precio vigente, o falla de validación de entrada |
| `502` | calc-service no respondió o devolvió un error |

---

## RF-12 — Clientes (`/api/clientes`)

Documentado en detalle en [CONTRATO-CLIENTES.md](CONTRATO-CLIENTES.md).
Resumen de rutas para este capítulo:

| Método | Ruta | Permiso | Respuesta | Uso |
|---|---|---|---|---|
| `GET` | `/api/clientes` | `clientes`, `generar_layout` o `cargar_boceto` | `200` `ClienteLeer[]` | Listado (`?buscar=`, `?incluir_inactivos=`) |
| `GET` | `/api/clientes/{id}` | igual | `200` `ClienteLeer` | Detalle |
| `POST` | `/api/clientes` | `clientes` | `201` `ClienteLeer` | Alta |
| `PATCH` | `/api/clientes/{id}` | `clientes` | `200` `ClienteLeer` | Corrección parcial y reactivación |
| `DELETE` | `/api/clientes/{id}` | `clientes` | `204` sin cuerpo | Baja lógica (idempotente) |

El permiso de lectura es amplio por la misma razón que en Inversores: el
alta de proyectos (Joseph) necesita listar clientes para el selector.

Ver CONTRATO-CLIENTES.md para los schemas completos (`ClienteLeer`,
`ClienteCrear`, `ClienteActualizar`), la validación de cédula/RUC/pasaporte
y teléfono, y la tabla de errores (`404`, `409`, `422`).

---

## RF-13 — Tablero de indicadores (`/api/tablero`)

Solo lectura: reportes derivados de `Cotizacion` y `MaterialCotizado`. No
hay alta ni edición, por eso no hay schemas de entrada más allá de los
parámetros de consulta.

| Método | Ruta | Permiso | Respuesta | Uso |
|---|---|---|---|---|
| `GET` | `/api/tablero` | `historial` o `generar_layout` | `200` `TableroLeer` | Los cuatro indicadores, en una sola respuesta |

Mismo permiso que el historial: son reportes sobre las mismas cotizaciones,
no un módulo nuevo.

### Parámetros de consulta

| Parámetro | Tipo | Defecto | Efecto |
|---|---|---|---|
| `desde` | fecha | Hace 6 meses | Inclusive |
| `hasta` | fecha | Hoy | Inclusive |
| `top` | int (1 a 20) | 5 | Cuántos clientes/materiales mostrar en los rankings |

### `TableroLeer`

```json
{
  "resumen": {
    "total_cotizaciones": 34,
    "monto_total": "58230.40",
    "paneles_cotizados": 1248,
    "potencia_total_kwp": "612.50"
  },
  "cotizaciones_por_periodo": [
    { "periodo": "2026-09", "cantidad": 10, "total": "15200.00" }
  ],
  "cotizaciones_por_estado": [
    { "estado": "cotizada", "cantidad": 20 }
  ],
  "clientes_frecuentes": [
    { "cliente_nombre": "Energy Control Cía. Ltda.", "cantidad": 6 }
  ],
  "materiales_mas_consumidos": [
    { "material_id": 12, "codigo": "HEX_V18MM", "nombre": "Varilla HEX 18mm", "cantidad": 980 }
  ]
}
```

`resumen.paneles_cotizados` es la suma de `L × A × B` de cada ítem de cada
cotización del rango.

`resumen.potencia_total_kwp` es la suma de `Cotizacion.potencia_kwp` de las
cotizaciones del rango. Solo las que salen de un layout (RF-05) la tienen;
las cotizadas al vuelo no cuentan, así que puede ser `0` aunque
`paneles_cotizados` no lo sea.

`periodo` va en formato `"AAAA-MM"`, agrupado en hora de Ecuador.

### Errores

| Código | Cuándo |
|---|---|
| `422` | (`RangoInvalido`) `desde` posterior a `hasta`, u otro rango no válido |

---

## Pendiente, no parte de esta entrega

- **Proforma en Word/Excel (RF-07):** la pantalla de "desglose" del
  prototipo y la descarga del archivo generado. Sprint 4, no iniciado — no
  hay endpoint `/api/cotizaciones/{id}/proforma` aún.
