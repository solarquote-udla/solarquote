# Contrato de la API de clientes — RF-12

**Estado:** propuesta, pendiente de aprobación de Esteban.
**Reparto:** backend → Esteban · frontend → Joseph.

Este documento fija las rutas, los campos y los errores **antes** de
programar, para que backend y frontend avancen en paralelo. Cualquier
cambio se acuerda aquí primero.

Extiende el contrato mínimo de `GET /api/clientes` que ya está en
[MODELOS-COMPARTIDOS.md](MODELOS-COMPARTIDOS.md) sin romperlo: la
respuesta sigue siendo un arreglo y conserva `id`, `nombre`,
`identificacion` y `activo`.

---

## Reglas generales

- Todas las rutas exigen **Gerente General** (`requiere_gerente`).
- No hay paginación: HEXtructure maneja decenas de clientes, no miles.
  Si algún día hace falta, se acuerda antes (el selector de proyectos
  depende de recibir la lista completa).
- **Baja lógica.** Un cliente nunca se borra de la tabla: tiene proyectos
  y cotizaciones que deben seguir apuntándole. "Eliminar" en la interfaz
  significa `activo = false`.

---

## Rutas

| Método | Ruta | Respuesta | Uso |
|---|---|---|---|
| `GET` | `/api/clientes` | `200` `ClienteLeer[]` | Listado y búsqueda |
| `GET` | `/api/clientes/{id}` | `200` `ClienteLeer` | Detalle |
| `POST` | `/api/clientes` | `201` `ClienteLeer` | Alta |
| `PATCH` | `/api/clientes/{id}` | `200` `ClienteLeer` | Corrección parcial y reactivación |
| `DELETE` | `/api/clientes/{id}` | `204` sin cuerpo | Baja lógica |

### `GET /api/clientes`

Parámetros de consulta, ambos opcionales:

| Parámetro | Tipo | Defecto | Efecto |
|---|---|---|---|
| `buscar` | texto | — | Coincidencia parcial, sin distinguir mayúsculas, en `nombre`, `empresa` o `identificacion` |
| `incluir_inactivos` | bool | `false` | `true` devuelve también los dados de baja |

Orden: `nombre` ascendente.

### `DELETE /api/clientes/{id}`

Pone `activo = false`. Es idempotente: dar de baja a un cliente ya dado de
baja también responde `204`. Sus proyectos y cotizaciones no cambian. Desde
ese momento no se le pueden crear proyectos nuevos (ya validado en
`services/proyecto.py`).

### Reactivar

`PATCH /api/clientes/{id}` con `{"activo": true}`. No hace falta una ruta
aparte.

---

## Schemas

### `ClienteLeer`

```json
{
  "id": 7,
  "nombre": "Energy Control Cía. Ltda.",
  "tipo_identificacion": "ruc",
  "identificacion": "1790012345001",
  "empresa": "Energy Control",
  "email": "compras@energycontrol.ec",
  "telefono": "+593 99 123 4567",
  "direccion": "Av. Amazonas N34-120, Quito",
  "activo": true,
  "total_proyectos": 3,
  "created_at": "2026-10-02T15:04:05Z",
  "updated_at": "2026-10-02T15:04:05Z"
}
```

`total_proyectos` es nuevo y sirve para que la interfaz avise antes de
dar de baja a un cliente con trabajo en curso. Se calcula con un
`COUNT`; no es una columna.

### `ClienteCrear`

| Campo | Obligatorio | Regla |
|---|---|---|
| `nombre` | Sí | 3 a 150 caracteres, sin espacios a los lados |
| `tipo_identificacion` | Sí | `cedula`, `ruc` o `pasaporte` |
| `identificacion` | Sí | Según el tipo (ver abajo). Única en la tabla |
| `empresa` | No | Hasta 150 |
| `email` | No | Formato válido (`EmailStr`, ya está `email-validator` en requirements) |
| `telefono` | No | Ver abajo |
| `direccion` | No | Hasta 255 |

Los textos vacíos o solo con espacios se guardan como `null`.

### `ClienteActualizar`

Los mismos campos, todos opcionales, más `activo: bool`. Omitir un campo
lo deja igual; enviarlo en `null` lo borra (salvo los obligatorios, que
no aceptan `null`).

Si viene `identificacion`, se valida contra `tipo_identificacion`: el
enviado, o el guardado si no se envía.

---

## Validación de la identificación

Antes de validar se quitan espacios y guiones: `17-1234-5678` → `1712345678`.

| Tipo | Regla |
|---|---|
| `cedula` | 10 dígitos. Provincia (dígitos 1-2) entre 01 y 24, o 30. Tercer dígito menor a 6. Dígito verificador por módulo 10 |
| `ruc` | 13 dígitos. Termina en un establecimiento distinto de `000`. Tercer dígito: `0`–`5` → los primeros 10 deben ser una cédula válida (persona natural); `6` → sector público; `9` → sociedad privada |
| `pasaporte` | 5 a 20 caracteres alfanuméricos |

**Sobre el RUC de sociedades:** no exigimos el dígito verificador por
módulo 11 en los terceros dígitos `6` y `9`. Validar un formato más
estricto que el del propio SRI bloquearía clientes reales, y en esos
casos el costo de rechazar es mayor que el de aceptar.

Algoritmo de la cédula (módulo 10):

```
coeficientes = 2 1 2 1 2 1 2 1 2   (sobre los primeros 9 dígitos)
cada producto ≥ 10 → restar 9
verificador = (10 − suma % 10) % 10   → debe ser igual al dígito 10
```

Ejemplo válido para las pruebas: `1710034065`.

## Validación del teléfono

Se aceptan dígitos, espacios, guiones, paréntesis y un `+` inicial. Entre
7 y 15 dígitos en total. Se guarda tal como lo escribió el usuario, sin
reformatear.

Casos típicos: `0991234567` (celular), `062 123 456` (fijo de Imbabura),
`+593 99 123 4567`.

---

## Errores

| Código | Cuándo | `detail` |
|---|---|---|
| `404` | El `id` no existe | `"No existe el cliente 7"` |
| `409` | La identificación ya está registrada | `"Ya existe un cliente con la identificación 1790012345001: Energy Control Cía. Ltda."` |
| `422` | Falla de validación | El mensaje del validador, en español |

El `409` debe nombrar al cliente existente: lo más probable es que el
usuario lo esté buscando y no sepa que ya está.

---

## Diferencias con el documento de titulación — decidir

1. **Eliminar vs. dar de baja.** RF-12 dice "eliminar", y que las
   cotizaciones quedan "sin cliente asignado". El modelo hace baja lógica,
   y `Proyecto.cliente_id` es obligatorio, así que un borrado real no es
   posible si hay proyectos. **Propuesta:** mantener la baja lógica y
   ajustar la redacción del documento: "dar de baja; sus cotizaciones y
   proyectos se conservan".
2. **Identificación opcional.** El documento la pone como opcional; el
   modelo la exige y la hace única. **Propuesta:** mantenerla obligatoria.
   La proforma (RF-07) la necesita, y es lo que evita registrar dos veces
   al mismo cliente. Ajustar el documento.

## Datos de demo

`scripts/datos_demo.py` usa la identificación `9999999999999`, que no pasa
la validación nueva (la provincia 99 no existe). No falla, porque el script
inserta directo con el ORM, pero editar ese cliente desde la interfaz sí
fallaría. Hay que cambiarla por un RUC válido de ejemplo, por ejemplo
`1710034065001`.
