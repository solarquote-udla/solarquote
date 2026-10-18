# Diagrama entidad-relación

**Estado:** implementado. Refleja el esquema real en `develop` (después de
`alembic upgrade head`), no una propuesta.

Reemplaza el diagrama ASCII informal que había al final de
[MODELOS-COMPARTIDOS.md](MODELOS-COMPARTIDOS.md): este cubre las 16 tablas
del sistema completo (Módulo 1 de Joseph + Cotización/Materiales/Inversores/
Clientes de Esteban), no solo los modelos compartidos.

---

## Diagrama completo

```mermaid
erDiagram
    PERFILES {
        int id PK
        string nombre UK
        string descripcion
        string clave UK "null en perfiles personalizados"
        boolean acceso_total
        datetime created_at
        datetime updated_at
    }

    PERFIL_PERMISOS {
        int perfil_id PK, FK
        string codigo PK
    }

    USUARIOS {
        int id PK
        string nombre
        string email UK
        string password_hash
        int perfil_id FK
        boolean activo "baja lógica"
        boolean debe_cambiar_password
        datetime ultimo_acceso
        int intentos_fallidos
        datetime bloqueado_hasta
        int version_token "invalida JWT emitidos antes"
        datetime created_at
        datetime updated_at
    }

    CLIENTES {
        int id PK
        string nombre
        string tipo_identificacion "cedula | ruc | pasaporte"
        string identificacion UK
        string empresa
        string email
        string telefono
        string direccion
        boolean activo "baja lógica"
        datetime created_at
        datetime updated_at
    }

    PROYECTOS {
        int id PK
        string nombre
        int cliente_id FK
        int usuario_id FK "quién lo creó"
        string ubicacion
        decimal latitud
        decimal longitud
        string estado "borrador→en_diseno→disenado→cotizado"
        string notas
        datetime created_at
        datetime updated_at
    }

    TERRENOS {
        int id PK
        int proyecto_id FK, UK "1 a 1 con Proyecto"
        jsonb vertices "polígono, metros"
        float orientacion_norte
        string notas
        datetime created_at
        datetime updated_at
    }

    CAMINOS {
        int id PK
        int terreno_id FK
        string nombre
        string tipo "acceso | interno | mantenimiento"
        jsonb vertices
        datetime created_at
    }

    CONFIGURACIONES_EQUIPO {
        int id PK
        int proyecto_id FK, UK "1 a 1 con Proyecto"
        string panel_marca
        string panel_modelo
        float panel_potencia_wp
        float panel_largo_mm
        float panel_ancho_mm
        float panel_voc_v
        float panel_vmp_v
        float angulo_montaje
        float potencia_objetivo_kwp "opcional"
        datetime created_at
        datetime updated_at
    }

    INVERSORES_EQUIPO {
        int id PK
        int configuracion_id FK
        int orden "0 = Inversor 1; UK con configuracion_id"
        string marca
        string modelo
        float potencia_kw
        float vmax_v
        float vmin_v
        int mppts
        int strings_por_mppt
    }

    LAYOUTS {
        int id PK
        int proyecto_id FK, UK "1 a 1 con Proyecto"
        int paneles_largo
        float pasillo_m
        float tolerancia_proporcion
        float capacidad_deseada_kwp
        int total_paneles
        float potencia_kwp
        jsonb resumen "foto del momento de generar"
        string huella "SHA-256 de las entradas del algoritmo"
        datetime created_at
        datetime updated_at
    }

    BLOQUES_LAYOUT {
        int id PK
        int layout_id FK
        int orden
        jsonb vertices "4 esquinas, metros"
        int paneles_largo
        int paneles_ancho
        float proporcion
        boolean en_proporcion
        int inversor "orden de InversorEquipo; NO es FK real"
    }

    INVERSORES {
        int id PK
        string marca
        string modelo "UK junto con marca"
        float potencia_kw
        float vmax_v
        float vmin_v
        int mppts
        int strings_por_mppt
        boolean activo "baja lógica"
        datetime created_at
        datetime updated_at
    }

    MATERIALES {
        int id PK
        string codigo UK "usado por f(L,A,B)"
        string nombre
        string unidad
        boolean activo "baja lógica"
        datetime created_at
        datetime updated_at
    }

    PRECIOS_MATERIAL {
        int id PK
        int material_id FK
        decimal precio
        datetime vigente_desde
        datetime vigente_hasta "null = precio vigente; único por material"
        datetime created_at
    }

    COTIZACIONES {
        int id PK
        string numero_proforma UK "null en borrador"
        int usuario_id FK
        int cliente_id FK "nullable"
        int proyecto_id FK "nullable"
        string cliente_nombre "snapshot"
        string cliente_empresa "snapshot"
        string cliente_email "snapshot"
        string cliente_telefono "snapshot"
        string proyecto_nombre "snapshot"
        decimal addendum_porcentaje
        decimal subtotal "nullable"
        decimal addendum_monto "nullable"
        decimal iva_porcentaje "nullable"
        decimal iva_monto "nullable"
        decimal total "nullable"
        string estado "cotizada→despachada→recibida→instalada"
        datetime created_at
        datetime updated_at
    }

    ITEMS_COTIZACION {
        int id PK
        int cotizacion_id FK
        string descripcion
        int paneles_largo "L"
        int paneles_ancho "A"
        int bloques "B"
        datetime created_at
        datetime updated_at
    }

    MATERIALES_COTIZADOS {
        int id PK
        int cotizacion_id FK
        int material_id FK
        int cantidad
        decimal precio_unitario "snapshot del precio al emitir"
        datetime created_at
    }

    PERFILES ||--o{ PERFIL_PERMISOS : tiene
    PERFILES ||--o{ USUARIOS : "asignado a"
    USUARIOS ||--o{ PROYECTOS : crea
    USUARIOS ||--o{ COTIZACIONES : crea
    CLIENTES ||--o{ PROYECTOS : tiene
    CLIENTES o|--o{ COTIZACIONES : "tiene (opcional)"
    PROYECTOS ||--o| TERRENOS : "1 a 1"
    PROYECTOS ||--o| CONFIGURACIONES_EQUIPO : "1 a 1"
    PROYECTOS ||--o| LAYOUTS : "1 a 1"
    PROYECTOS o|--o{ COTIZACIONES : "tiene (opcional)"
    TERRENOS ||--o{ CAMINOS : tiene
    CONFIGURACIONES_EQUIPO ||--o{ INVERSORES_EQUIPO : tiene
    LAYOUTS ||--o{ BLOQUES_LAYOUT : tiene
    COTIZACIONES ||--o{ ITEMS_COTIZACION : tiene
    COTIZACIONES ||--o{ MATERIALES_COTIZADOS : tiene
    MATERIALES ||--o{ PRECIOS_MATERIAL : tiene
    MATERIALES ||--o{ MATERIALES_COTIZADOS : "aparece en"
```

---

## Notas sobre relaciones que no son llaves foráneas

El diagrama de arriba solo dibuja relaciones con llave foránea real en la
base. Dos casos quedan fuera a propósito, y conviene explicarlos en el
capítulo 7 para que no se confundan con un olvido:

### `Inversor` (catálogo, RF-08) no tiene FK hacia ni desde ningún lado

`Inversor` es un catálogo de referencia. Sirve para **prellenar** el
formulario de `ConfiguracionEquipo` / `InversorEquipo` al configurar el
equipo de un proyecto (RF-02, de Joseph), pero esos datos se copian como
snapshot — no se guarda una referencia (`inversor_id`) al registro del
catálogo. Si más adelante se corrige un inversor en la lista de RF-08, los
proyectos ya configurados no cambian. Es el mismo patrón de snapshot que usa
`Cotizacion` con los datos del cliente.

En términos de ER: `INVERSORES` es una entidad aislada, sin relaciones con
el resto del esquema. La conexión con `CONFIGURACIONES_EQUIPO` /
`INVERSORES_EQUIPO` ocurre solo en la capa de aplicación (el formulario lee
el catálogo), nunca en la base de datos.

### `BloqueLayout.inversor` no es una FK hacia `InversorEquipo`

Cada bloque del layout queda "conectado" a uno de los inversores de la
planta, pero ese campo (`inversor`, un entero) guarda el **`orden`** de
`InversorEquipo` (0 = "Inversor 1"), no su `id`. Es una decisión deliberada
de Joseph (Módulo 1): si el Gerente reemplaza la lista de inversores de un
proyecto, los bloques ya ubicados no deben quedar huérfanos — deben seguir
apuntando al "Inversor 2" de la nueva lista, sea cual sea su fila real. Una
FK real a `inversores_equipo.id` rompería esa garantía.

---

## Patrones del esquema, vistos en el diagrama

- **Baja lógica, nunca `DELETE`:** `activo` en `Usuario`, `Inversor`,
  `Material`, `Cliente`. Ninguna de estas cuatro tablas borra filas.
- **Snapshot al emitir un documento comercial:** `Cotizacion` congela los
  datos del cliente (`cliente_nombre`, `cliente_email`, …) y
  `MaterialCotizado.precio_unitario` congela el precio vigente al momento
  de cotizar, aunque `PrecioMaterial` cambie después.
- **1 a 1 por `unique=True` en la FK**, no por un modelo de herencia:
  `Terreno`, `ConfiguracionEquipo` y `Layout` son, cada uno, como mucho uno
  por `Proyecto`.
- **Un solo precio "vigente" por material:** índice único parcial en
  `precios_material` (`WHERE vigente_hasta IS NULL`), no una columna de
  precio en `Material`.
- **JSONB para geometría y datos de forma libre:** `Terreno.vertices`,
  `Camino.vertices`, `BloqueLayout.vertices` (polígonos) y `Layout.resumen`
  (resultado completo del algoritmo, que no se consulta por partes).
