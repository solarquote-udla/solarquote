"""
Paneles de referencia para agilizar la captura en RF-02.

El documento de titulación lo define así: "no existe un panel estándar
[...] se ingresan manualmente, ofreciendo presets de marcas comunes
(Canadian Solar, Jinko, Risen)". Estos presets solo rellenan el
formulario; el usuario puede editar cualquier valor antes de guardar.

Criterio de selección
─────────────────────
Dos modelos por marca, uno de cada clase de tamaño usada en montaje
sobre suelo:

  - Clase 2278 × 1134 mm (72 celdas completas / 144 medias celdas,
    ~580 W): la más difundida en instalaciones de mediana escala.
  - Clase grande (2382 × 1134 o 2384 × 1303 mm, 670–710 W): la
    generación vigente en plantas de mayor tamaño.

Las medidas del panel condicionan directamente la estructura que
fabrica HEXtructure, por eso importa cubrir ambas clases.

De cada ficha se tomó una sola potencia, la de un escalón intermedio.
Si el lote real es de otro escalón (por ejemplo 585 W en vez de 580 W),
hay que ajustar potencia, Voc y Vmp con la ficha de ese lote.

Fuentes (consultadas en septiembre de 2026)
───────────────────────────────────────────
Fichas técnicas de los fabricantes, leídas en su transcripción tabular
del directorio ENF Solar. Para el CS7N se contrastó además con la ficha
PDF oficial de Canadian Solar (v1.61, marzo 2024): voltajes y medidas
coinciden.

Todos los valores eléctricos están en condiciones estándar de prueba
(STC: 1000 W/m², 25 °C de celda, AM 1.5).
"""

from typing import TypedDict


class PanelReferencia(TypedDict):
    clave: str
    marca: str
    modelo: str
    potencia_wp: float
    largo_mm: float
    ancho_mm: float
    voc_v: float
    vmp_v: float
    fuente: str


PANELES_REFERENCIA: list[PanelReferencia] = [
    # ─── Clase 2278 × 1134 mm ────────────────────────────────────
    {
        "clave": "jinko-jkm580n-72hl4",
        "marca": "Jinko Solar",
        "modelo": "Tiger Neo JKM580N-72HL4-V",
        "potencia_wp": 580,
        "largo_mm": 2278,
        "ancho_mm": 1134,
        "voc_v": 52.31,
        "vmp_v": 43.35,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/55990",
    },
    {
        "clave": "canadian-cs6w-580tb-ag",
        "marca": "Canadian Solar",
        "modelo": "TOPBiHiKu6 CS6W-580TB-AG",
        "potencia_wp": 580,
        "largo_mm": 2278,
        "ancho_mm": 1134,
        "voc_v": 52.2,
        "vmp_v": 43.1,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/69188",
    },
    {
        "clave": "risen-rsm144-9-580bndg",
        "marca": "Risen Energy",
        "modelo": "RSM144-9-580BNDG",
        "potencia_wp": 580,
        "largo_mm": 2278,
        "ancho_mm": 1134,
        "voc_v": 52.17,
        "vmp_v": 43.8,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/61380",
    },
    # ─── Clase grande ────────────────────────────────────────────
    {
        "clave": "jinko-jkm670n-66ql6-bdv",
        "marca": "Jinko Solar",
        "modelo": "Tiger Neo 3.0 JKM670N-66QL6-BDV",
        "potencia_wp": 670,
        "largo_mm": 2382,
        "ancho_mm": 1134,
        "voc_v": 50.98,
        "vmp_v": 43.09,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/69165",
    },
    {
        "clave": "canadian-cs7n-700tb-ag",
        "marca": "Canadian Solar",
        "modelo": "TOPBiHiKu7 CS7N-700TB-AG",
        "potencia_wp": 700,
        "largo_mm": 2384,
        "ancho_mm": 1303,
        "voc_v": 47.9,
        "vmp_v": 40.0,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/60160",
    },
    {
        "clave": "risen-rsm132-8-710bhdg",
        "marca": "Risen Energy",
        "modelo": "Hyper-ion RSM132-8-710BHDG",
        "potencia_wp": 710,
        "largo_mm": 2384,
        "ancho_mm": 1303,
        "voc_v": 50.01,
        "vmp_v": 41.93,
        "fuente": "https://www.enfsolar.com/pv/panel-datasheet/crystalline/58434",
    },
]
