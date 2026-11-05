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

Se corre desde **Railway → el servicio `backend` → pestaña Console**:
ese entorno ya tiene la `DATABASE_URL` de producción puesta, así que no
hace falta copiarla a ningún lado ni sacarla de Railway.

```bash
python -m scripts.datos_prueba_produccion
```

No tengo acceso a la `DATABASE_URL` de producción desde este entorno —
ni debería tenerlo (ver la regla de secretos de producción en
`DESPLIEGUE.md`). Alguien del equipo con acceso a Railway tiene que
correrlo desde ahí y revisar la lista.

**El filtro puede dar falsos positivos** (un cliente real llamado, por
ejemplo, "Pruebas Hidalgo S.A." calzaría). Por eso el script solo
informa — cada fila de la lista hay que revisarla a mano antes de decidir
qué hacer con ella, no se da de baja nada automáticamente.

## 2. Qué hacer con el resultado

### Recomendado: si el reporte confirma que solo hay datos de prueba

Si al correr el script contra producción no aparece ningún cliente o
proyecto real — todo lo que hay hasta ahora en Railway es de validar el
despliegue o de demo — la opción recomendada **no es dar de baja nada**:
es arrancar la aceptación con una base de producción nueva en Neon.

1. Crear la base nueva en Neon (o una base limpia dentro del mismo
   proyecto) y correr `alembic upgrade head` — mismo esquema, sin
   ninguna fila.
2. Crear ahí el primer gerente (acceso total) y el catálogo real de
   materiales e inversores de HEXtructure — ya no el de demo.
3. Apuntar `DATABASE_URL` del backend en Railway a la base nueva y
   redesplegar.
4. Dejar la base vieja como respaldo (sin borrarla): si algo de la
   migración salió mal, está ahí para comparar o volver atrás.

**Por qué es mejor que la baja lógica para este caso:** el tablero no
suma cotizaciones de prueba a las métricas desde el día uno de la
aceptación, las proformas empiezan a numerarse en `CT-001` (no
heredan números de las cotizaciones de prueba), y no hace falta
decidir ni construir nada para los proyectos — no importa que
`listar_proyectos` no filtre por cliente activo, porque no hay
proyectos de prueba que ocultar. Resuelve de una vez el problema que
"Proyectos", más abajo, describe para la alternativa, sin tocar el
modelo.

**Cuándo no aplica:** si el reporte encuentra que un cliente o proyecto
real ya se mezcló con los de prueba (por ejemplo, alguien empezó a
cargar un proyecto real antes de este reporte), arrancar de cero
perdería ese dato real — ahí corresponde la baja lógica caso por caso
de la alternativa, no una base nueva.

### Alternativa: baja lógica caso por caso (si hay datos reales mezclados)

#### Clientes

Ya existe baja lógica para clientes (RF-12): `dar_de_baja(db, cliente_id)`
en `app/services/cliente.py`, o desde la pantalla de Clientes en la
interfaz. Pone `activo=False`; es reversible (se puede reactivar) y no
borra ningún dato — las cotizaciones y proyectos que ya tenga ese cliente
se conservan intactos.

#### Proyectos

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

#### Qué no hacer

**No borrar directamente de la base.** Un `DELETE` no se puede deshacer, y
un cliente o proyecto de prueba puede tener cotizaciones, despachos o
recepciones encadenados por llave foránea — borrarlo a mano puede romper
esas referencias o dejar huérfanos datos de validación. La baja lógica ya
es segura y reversible; no hace falta el riesgo de un borrado real para
dejar la base lista para la revisión.

## 3. Pendiente

- Correr el script contra producción, desde Railway → backend →
  Console (ya tiene la `DATABASE_URL` ahí; no hace falta copiarla a
  ningún lado).
- Revisar la lista: si todo es de prueba, preparar la base nueva en
  Neon (opción recomendada); si hay algo real mezclado, decidir caso
  por caso con la baja lógica.
- Si se usa la alternativa de baja lógica: decidir si se agrega
  `activo` a `Proyecto` ahora o se deja para después del cierre, y
  mientras tanto renombrar los proyectos de prueba encontrados.
