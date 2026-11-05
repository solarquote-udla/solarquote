# Datos de prueba que pueden quedar en producción

Antes de la revisión de aceptación con HEXtructure conviene dejar la base
de producción sin datos de prueba visibles (clientes y proyectos de
demo, de validar el despliegue, etc.). Este documento propone cómo
identificarlos y darlos de baja. **No se ha borrado ni dado de baja nada
todavía** — es una propuesta, pendiente de que alguien con acceso a la
base de producción la ejecute y decida caso por caso.

## 1. Cómo identificarlos

`scripts/datos_prueba_produccion.py` es de solo lectura: busca clientes
cuyo nombre, identificación o empresa contenga alguna palabra típica de
datos de prueba ("prueba", "test", "demo", "solarandes", "ejemplo"), y
proyectos que cuelguen de esos clientes o cuyo propio nombre coincida.
Por cada uno, informa cuántos proyectos, cotizaciones, despachos y
recepciones tiene — para saber qué tan "activo" está antes de tocarlo.

```bash
cd 02_codigo_fuente/backend
DATABASE_URL=<la de producción> python -m scripts.datos_prueba_produccion
```

No tengo acceso a la `DATABASE_URL` de producción desde este entorno —
ni debería tenerlo (ver la regla de secretos de producción en
`DESPLIEGUE.md`). Alguien del equipo con ese acceso tiene que correrlo y
revisar la lista.

**El filtro puede dar falsos positivos** (un cliente real llamado, por
ejemplo, "Pruebas Hidalgo S.A." calzaría). Por eso el script solo
informa — cada fila de la lista hay que revisarla a mano antes de decidir
qué hacer con ella, no se da de baja nada automáticamente.

## 2. Cómo darlos de baja (sin borrar)

### Clientes

Ya existe baja lógica para clientes (RF-12): `dar_de_baja(db, cliente_id)`
en `app/services/cliente.py`, o desde la pantalla de Clientes en la
interfaz. Pone `activo=False`; es reversible (se puede reactivar) y no
borra ningún dato — las cotizaciones y proyectos que ya tenga ese cliente
se conservan intactos.

### Proyectos

**Los proyectos no tienen baja lógica todavía.** `listar_proyectos` no
filtra por si el cliente está activo o no, así que dar de baja al
cliente no oculta sus proyectos de los listados ni del tablero — van a
seguir apareciendo. Dos caminos, a decidir con el equipo:

- **Agregar un campo `activo` a `Proyecto`** (como ya tiene `Cliente`) y
  filtrar los listados por defecto. Es el camino correcto a largo plazo,
  pero es un cambio de modelo con su propia migración — no algo para
  resolver en el mismo PR que este reporte.
- **Mientras tanto**, renombrar los proyectos de prueba con un prefijo
  claro (por ejemplo `[PRUEBA] Proyecto demo — Planta SolarAndes`) desde
  la pantalla de edición del proyecto. No los oculta, pero los hace
  obvios durante la revisión de aceptación sin tocar código ni esquema.

### Qué no hacer

**No borrar directamente de la base.** Un `DELETE` no se puede deshacer, y
un cliente o proyecto de prueba puede tener cotizaciones, despachos o
recepciones encadenados por llave foránea — borrarlo a mano puede romper
esas referencias o dejar huérfanos datos de validación. La baja lógica ya
es segura y reversible; no hace falta el riesgo de un borrado real para
dejar la base lista para la revisión.

## 3. Pendiente

- Correr el script contra producción (alguien del equipo con el acceso).
- Revisar la lista y decidir, cliente por cliente, cuáles dar de baja.
- Decidir si se agrega baja lógica a `Proyecto` ahora o se deja para
  después del cierre, y mientras tanto renombrar los proyectos de prueba
  encontrados.
