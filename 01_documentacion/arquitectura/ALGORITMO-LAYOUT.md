# Algoritmo de generación del layout — RF-03

Código: `backend/app/services/calculo_layout.py` (función pura) y
`backend/app/services/layout.py` (persistencia).
Pruebas: `backend/tests/test_layout.py`.

---

## Modelo del bloque

Notación de HEXtructure, tomada de la cotización EMIHANA (`L=4 A=28 BLOQUES=12`):

| Símbolo | Significado | Regla |
|---|---|---|
| **L** | Paneles en la dirección de la pendiente | Par: los paneles apoyan de a dos sobre soportes en A y en V (ficha HEX001, aletas de 7,5°) |
| **A** | Paneles a lo largo de la fila | Lo calcula el algoritmo |
| **B** | Repeticiones de un mismo tipo de bloque | Agrupación final |

El panel va con su lado mayor en la dirección de L:

```
largo_m = L · lado_mayor        ancho_m = A · lado_menor
```

Regla antisísmica del documento de titulación: **ancho = 3 · largo**. Con L
elegido por el usuario, A es el entero más cercano a esa proporción.

| Panel 2278 × 1134 mm, L = 4 | Valor |
|---|---|
| Largo | 4 × 2,278 = 9,112 m |
| A ideal | round(3 × 9,112 / 1,134) = 24 |
| Ancho | 24 × 1,134 = 27,216 m |
| Proporción | 2,987 |

## Decisiones (acordadas el 1 de octubre de 2026)

| Tema | Decisión | Motivo |
|---|---|---|
| Forma del bloque | L par elegido por el usuario (4 por defecto); A por proporción | Respeta la regla antisísmica sin pedir dos números |
| Tolerancia ámbar | ±20 %, configurable | El bloque real de EMIHANA (4 × 28) tiene proporción 3,48: con ±10 % saldría en ámbar. **Pendiente de confirmar con HEXtructure** |
| Separación | Pasillo configurable, 2 m por defecto | Medido en el plano de San Pablo del Lago. La sombra de RF-02 se usa solo si es mayor |
| Orientación | Filas norte-sur según `orientacion_norte` del terreno | Si no está definida se asume el norte arriba y se advierte |

`orientacion_norte` se mide en grados, en sentido horario desde el eje +Y
del plano (0 = arriba, 90 = derecha).

## Pasos

1. **Área útil** = terreno − unión de caminos (Shapely).
2. Se **rota** el área útil para que el norte quede hacia +Y.
3. Se recorre el terreno en **franjas verticales** del largo en planta del
   bloque (L · lado_mayor · cos β), separadas por la separación este-oeste.
4. En cada franja se calculan los **tramos libres**: los intervalos de Y en
   los que la franja entera cae dentro del área útil. Cada obstáculo conexo
   proyecta un intervalo sobre Y, así que el cálculo es exacto.
5. Cada tramo se llena **desde abajo** con bloques completos separados por
   el pasillo norte-sur. El sobrante se aprovecha con un **bloque corto**
   (menos paneles en A), que suele salir en ámbar.
6. Se prueban **24 desfases** de la primera franja y se elige el que ubica
   más paneles; a igualdad, el que tiene menos bloques cortos.
7. Si se pidió una **capacidad en kWp**, se recorta el layout a los paneles
   necesarios. Si no cabe, se entrega el máximo y se informa.
8. Se agrupan los bloques idénticos por tipo (A, B, C…, el más repetido
   primero) y se calcula la **configuración eléctrica**.

Dentro de un tramo, llenar desde el inicio es óptimo en una dimensión: el
único grado de libertad real es el desfase horizontal, y por eso es lo que
se busca.

## Configuración eléctrica

- Paneles por string: el máximo permitido, `floor(Vmax / Voc)`, con mínimo
  `ceil(Vmin / Vmp)`. Menos strings, menos cableado.
- Strings totales = paneles // paneles por string. El resto se informa.
- Inversores = ceil(paneles / 400), la regla de HEXtructure.
- Strings por MPPT = ceil(strings / (inversores × MPPTs)). Si supera lo que
  admite el inversor, se indica cuántos inversores harían falta.

## Verificación (RNF-01)

RNF-01 pide una variación ≤ 5 % respecto al óptimo calculado a mano. Casos
de prueba con el óptimo contado:

| Terreno | Óptimo a mano | Resultado |
|---|---|---|
| 31,336 × 56,432 m (encaje exacto 3 × 2) | 576 paneles, 6 bloques A | 576 |
| 100 × 60 m | 9 franjas × (2 × 96 + 4) = 1764 | 1764 |
| 60 × 100 m con norte a 90° | Mismo terreno girado: 1764 | 1764 |

Rendimiento: un terreno irregular de ~75 ha con dos caminos cruzados
(≈206 000 paneles) se resuelve en 0,6 s.

## Layout desactualizado

El layout guarda una huella SHA-256 de terreno, caminos, orientación,
latitud, panel e inversor. Si cualquiera cambia, la respuesta trae
`desactualizado: true` y la pantalla pide volver a generar. No se borra
automáticamente: el Gerente puede querer compararlo.

## Edición manual (SQ-64)

El Gerente puede **mover**, **cambiar A** (de a un panel) y **eliminar**
bloques sobre el plano. L queda fijo. No se agregan bloques nuevos.

| Decisión | Detalle |
|---|---|
| Qué viaja | Por bloque, solo la esquina suroeste y A. El backend reconstruye el rectángulo con L, el panel y la orientación guardada al generar, así que no puede llegar un bloque deformado o girado distinto al resto |
| Qué se bloquea | Bloque fuera del terreno, sobre un camino o encima de otro (422) |
| Qué solo advierte | Pasillo más angosto que el configurado |
| Tolerancia | 5 mm de **penetración**, no de área: dos bloques que se rozan 0,5 mm a lo largo de 27 m suman 0,0135 m² y no deberían rechazarse por redondeo |
| Guardado | Borrador local con botón Guardar / Descartar. Al guardar se recalculan tipos, potencia, capacidad y eléctrica |
| Regenerar | Pide confirmación si hay ediciones manuales; regenerar las reemplaza |
| Layout desactualizado | No se puede editar (409): primero hay que regenerar |

La validación se hace en el marco local del layout, donde los bloques son
rectángulos alineados a los ejes. La pantalla aplica **la misma regla**
(`frontend/src/utils/edicionLayout.ts`) para marcar en rojo, mientras se
arrastra, lo que el backend va a rechazar. Se verificó la paridad en 4 000
escenarios aleatorios —terrenos cóncavos, caminos, ángulos y casos a
milímetros del límite— sin ninguna diferencia.

**Mismos números en los dos lados.** No basta con que la regla sea igual:
también tienen que serlo los datos de entrada. El backend reconstruye los
bloques con los valores que entrega la API (`largo_bloque_m`,
`lado_menor_m`, `angulo_norte`), no con valores recalculados. En la
revisión del PR #27, Esteban detectó que el backend recalculaba el largo a
precisión completa mientras la pantalla usaba el valor redondeado al
milímetro: hasta 0,5 mm de diferencia, justo en el borde de la tolerancia.
La prueba de paridad no lo vio porque alimentaba ambos lados con el mismo
número. Hay una prueba de regresión (`test_backend_valida_con_el_mismo_largo_que_entrega_la_api`)
que reproduce el caso a 22° de montaje.

Endpoint: `PUT /api/proyectos/{id}/layout/bloques`.

## Limitaciones conocidas

- La sombra entre bloques usa la fórmula de RF-02 (sol al mediodía del peor
  día). Para estructuras a dos aguas de 7,5° es despreciable frente al
  pasillo de 2 m, pero no modela sombras de primera y última hora.
- Las franjas son paralelas al eje norte-sur. En terrenos muy alargados en
  diagonal se pierde área en los bordes; RF-05 permite ajustar a mano.
- No hay retiro perimetral: los bloques pueden tocar el lindero. Si
  HEXtructure exige un retiro, se agrega como parámetro.
