"""
Lógica del layout solar del proyecto — RF-03.

Une lo guardado en RF-01 (terreno y caminos) y RF-02 (equipo) con el
algoritmo puro de `calculo_layout`, y persiste el resultado.
"""

import hashlib
import json
import math
from dataclasses import asdict

from sqlalchemy.orm import Session

from app.models.equipo import ConfiguracionEquipo
from app.models.layout import BloqueLayout, Layout
from app.models.proyecto import Proyecto
from app.models.terreno import Terreno
from app.schemas.layout import (
    BloqueLeer,
    CapacidadLeer,
    ElectricaLeer,
    LayoutEditar,
    LayoutGenerar,
    LayoutLeer,
    TipoBloqueLeer,
)
from app.services.calculo_layout import (
    Bloque,
    InversorLayout,
    PanelLayout,
    ParametrosLayout,
    advertencia_proporcion,
    agrupar_por_tipo,
    configuracion_electrica,
    construir_bloque,
    cumple_proporcion,
    generar_layout,
    proporcion_bloque,
    validar_bloques,
    vertices_de,
)
from app.services.equipo import obtener_configuracion
from app.services.terreno import obtener_terreno


class FaltanDatos(ValueError):
    """El proyecto no tiene terreno o equipo: no hay con qué generar."""


class LayoutNoEditable(ValueError):
    """No hay layout, o está desactualizado: editarlo no tendría sentido."""


def obtener_layout(db: Session, proyecto_id: int) -> Layout | None:
    return db.query(Layout).filter(Layout.proyecto_id == proyecto_id).one_or_none()


# ─── Huella de las entradas ─────────────────────────────────────────


def calcular_huella(
    proyecto: Proyecto,
    terreno: Terreno | None,
    equipo: ConfiguracionEquipo | None,
) -> str:
    """
    SHA-256 de todo lo que el algoritmo lee de la base.

    Si cualquiera de estos datos cambia después de generar, la huella
    deja de coincidir y el layout se informa como desactualizado.
    Los caminos se ordenan por id para que la huella no dependa del
    orden en que los devuelva la consulta.
    """
    datos = {
        "latitud": float(proyecto.latitud) if proyecto.latitud is not None else None,
        "terreno": None
        if terreno is None
        else {
            "vertices": terreno.vertices,
            "orientacion_norte": terreno.orientacion_norte,
            "caminos": [c.vertices for c in sorted(terreno.caminos, key=lambda c: c.id)],
        },
        "equipo": None
        if equipo is None
        else {
            "panel": [
                equipo.panel_largo_mm,
                equipo.panel_ancho_mm,
                equipo.panel_potencia_wp,
                equipo.panel_voc_v,
                equipo.panel_vmp_v,
                equipo.angulo_montaje,
            ],
            "inversor": [
                equipo.inversor_vmax_v,
                equipo.inversor_vmin_v,
                equipo.inversor_mppts,
                equipo.inversor_strings_por_mppt,
            ],
        },
    }
    serializado = json.dumps(datos, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serializado.encode()).hexdigest()


def huella_actual(db: Session, proyecto: Proyecto) -> str:
    return calcular_huella(
        proyecto,
        obtener_terreno(db, proyecto.id),
        obtener_configuracion(db, proyecto.id),
    )


# ─── Generar ────────────────────────────────────────────────────────


def generar(db: Session, proyecto: Proyecto, datos: LayoutGenerar) -> Layout:
    """
    Ejecuta el algoritmo y guarda el resultado, reemplazando el anterior.

    Lanza `FaltanDatos` si no hay terreno o equipo, y `LayoutImposible`
    (del algoritmo) si no entra ningún bloque. Ambas son errores que el
    usuario puede corregir: el router los traduce a 409 y 422.
    """
    terreno = obtener_terreno(db, proyecto.id)
    equipo = obtener_configuracion(db, proyecto.id)

    faltan = []
    if terreno is None:
        faltan.append("el terreno (pestaña Terreno)")
    if equipo is None:
        faltan.append("el panel y el inversor (pestaña Equipo)")
    if faltan:
        raise FaltanDatos(f"Antes de generar el layout define {' y '.join(faltan)}.")

    resultado = generar_layout(
        terreno.vertices,
        [c.vertices for c in terreno.caminos],
        PanelLayout(
            largo_mm=equipo.panel_largo_mm,
            ancho_mm=equipo.panel_ancho_mm,
            potencia_wp=equipo.panel_potencia_wp,
            angulo_montaje=equipo.angulo_montaje,
        ),
        ParametrosLayout(
            paneles_largo=datos.paneles_largo,
            pasillo_m=datos.pasillo_m,
            tolerancia_proporcion=datos.tolerancia_proporcion,
            capacidad_deseada_kwp=datos.capacidad_deseada_kwp,
        ),
        orientacion_norte=terreno.orientacion_norte,
        latitud=float(proyecto.latitud) if proyecto.latitud is not None else None,
        inversor=InversorLayout(
            vmax_v=equipo.inversor_vmax_v,
            vmin_v=equipo.inversor_vmin_v,
            mppts=equipo.inversor_mppts,
            strings_por_mppt=equipo.inversor_strings_por_mppt,
        ),
        panel_voc=equipo.panel_voc_v,
        panel_vmp=equipo.panel_vmp_v,
    )

    layout = obtener_layout(db, proyecto.id)
    if layout is None:
        layout = Layout(proyecto_id=proyecto.id)
        db.add(layout)

    layout.paneles_largo = datos.paneles_largo
    layout.pasillo_m = datos.pasillo_m
    layout.tolerancia_proporcion = datos.tolerancia_proporcion
    layout.capacidad_deseada_kwp = datos.capacidad_deseada_kwp
    layout.total_paneles = resultado.total_paneles
    layout.potencia_kwp = resultado.potencia_kwp
    layout.resumen = {
        "paneles_ancho_ideal": resultado.paneles_ancho_ideal,
        "largo_bloque_m": resultado.largo_bloque_m,
        "ancho_bloque_m": resultado.ancho_bloque_m,
        "separacion_este_oeste_m": resultado.separacion_este_oeste_m,
        "separacion_norte_sur_m": resultado.separacion_norte_sur_m,
        "area_util_m2": resultado.area_util_m2,
        "area_ocupada_m2": resultado.area_ocupada_m2,
        "capacidad": asdict(resultado.capacidad) if resultado.capacidad else None,
        "electrica": asdict(resultado.electrica),
        "advertencias": resultado.advertencias,
        "angulo_norte": resultado.angulo_norte,
        "lado_menor_m": resultado.lado_menor_m,
        # Advertencias que no dependen de qué bloques hay (latitud,
        # orientación, sombra). Al editar se conservan y las de los
        # bloques se recalculan.
        "advertencias_base": [
            a
            for a in resultado.advertencias
            if a != advertencia_proporcion(resultado.tipos, datos.tolerancia_proporcion)
        ],
        # Generar de nuevo descarta las ediciones manuales
        "ediciones_manuales": 0,
    }
    layout.huella = calcular_huella(proyecto, terreno, equipo)

    # Reemplazo completo: generar de nuevo descarta los bloques anteriores.
    layout.bloques = [
        BloqueLayout(
            orden=i,
            vertices=b.vertices,
            paneles_largo=b.paneles_largo,
            paneles_ancho=b.paneles_ancho,
            proporcion=b.proporcion,
            en_proporcion=b.en_proporcion,
        )
        for i, b in enumerate(resultado.bloques)
    ]

    db.commit()
    db.refresh(layout)
    return layout


# ─── Edición manual (SQ-64) ─────────────────────────────────────────


def _angulo_del_layout(layout: Layout) -> float:
    """
    Orientación con la que se generó el layout.

    Los layouts generados antes de SQ-64 no la guardaban; se deduce del
    primer bloque: su lado sur (de la esquina SO a la SE) apunta al este
    del marco local girado −θ.
    """
    if "angulo_norte" in layout.resumen:
        return layout.resumen["angulo_norte"]
    if not layout.bloques:
        return 0.0
    se, _, _, so = layout.bloques[0].vertices
    return -math.degrees(math.atan2(se[1] - so[1], se[0] - so[0]))


def _lado_menor_del_layout(layout: Layout) -> float:
    if "lado_menor_m" in layout.resumen:
        return layout.resumen["lado_menor_m"]
    return layout.resumen["ancho_bloque_m"] / layout.resumen["paneles_ancho_ideal"]


def editar_bloques(db: Session, proyecto: Proyecto, datos: LayoutEditar) -> Layout:
    """
    Reemplaza los bloques por los editados a mano y recalcula todo lo
    que depende de ellos: tipos, potencia, capacidad y eléctrica.

    Lanza `LayoutNoEditable` si no hay layout o si está desactualizado
    (editar sobre un terreno que ya cambió guardaría bloques que quizás
    ya no caben), y `EdicionInvalida` si algún bloque no se puede
    construir.
    """
    layout = obtener_layout(db, proyecto.id)
    if layout is None:
        raise LayoutNoEditable("El proyecto todavía no tiene layout generado.")
    if layout.huella != huella_actual(db, proyecto):
        raise LayoutNoEditable(
            "El terreno, los caminos, el equipo o la latitud cambiaron después de generar "
            "el layout. Vuelve a generarlo antes de editarlo."
        )

    terreno = obtener_terreno(db, proyecto.id)
    equipo = obtener_configuracion(db, proyecto.id)

    L = layout.paneles_largo
    lado_mayor = max(equipo.panel_largo_mm, equipo.panel_ancho_mm) / 1000
    lado_menor = _lado_menor_del_layout(layout)
    largo_planta = L * lado_mayor * math.cos(math.radians(equipo.angulo_montaje))
    angulo = _angulo_del_layout(layout)

    poligonos = [
        construir_bloque(tuple(b.origen), largo_planta, b.paneles_ancho * lado_menor, angulo)
        for b in datos.bloques
    ]
    advertencias_pasillo = validar_bloques(
        terreno.vertices,
        [c.vertices for c in terreno.caminos],
        poligonos,
        layout.pasillo_m,
        angulo,
    )

    # ─── Cuántas ediciones hubo ──────────────────────────────────
    # Un bloque se identifica por su esquina SO y su A. Mover o cambiar
    # A cuenta como una edición; eliminar, también.
    clave = lambda origen, a: (round(origen[0], 2), round(origen[1], 2), a)  # noqa: E731
    previos = {clave(b.vertices[3], b.paneles_ancho) for b in layout.bloques}
    nuevos = {clave(b.origen, b.paneles_ancho) for b in datos.bloques}
    ediciones = max(len(nuevos - previos), len(previos - nuevos))

    # ─── Recalcular ─────────────────────────────────────────────
    bloques = []
    for poligono, b in zip(poligonos, datos.bloques):
        prop = proporcion_bloque(L, b.paneles_ancho, lado_mayor, lado_menor)
        bloques.append(
            Bloque(
                vertices=vertices_de(poligono),
                paneles_largo=L,
                paneles_ancho=b.paneles_ancho,
                proporcion=round(prop, 3),
                en_proporcion=cumple_proporcion(prop, layout.tolerancia_proporcion),
            )
        )
    bloques, tipos = agrupar_por_tipo(bloques)
    total = sum(b.paneles for b in bloques)
    potencia = total * equipo.panel_potencia_wp / 1000

    resumen = dict(layout.resumen)
    advertencias = list(resumen.get("advertencias_base", []))
    if aviso := advertencia_proporcion(tipos, layout.tolerancia_proporcion):
        advertencias.append(aviso)
    advertencias.extend(advertencias_pasillo)

    if resumen.get("capacidad"):
        capacidad = dict(resumen["capacidad"])
        capacidad["instalada_kwp"] = round(potencia, 2)
        capacidad["remanente_kwp"] = round(capacidad["maxima_kwp"] - potencia, 2)
        if potencia < capacidad["deseada_kwp"]:
            advertencias.append(
                f"Tras la edición, la capacidad instalada ({potencia:.1f} kWp) queda por debajo "
                f"de la deseada ({capacidad['deseada_kwp']:g} kWp)."
            )
        resumen["capacidad"] = capacidad

    resumen.update(
        area_ocupada_m2=round(sum(p.area for p in poligonos), 2),
        electrica=asdict(
            configuracion_electrica(
                total,
                equipo.panel_voc_v,
                equipo.panel_vmp_v,
                InversorLayout(
                    vmax_v=equipo.inversor_vmax_v,
                    vmin_v=equipo.inversor_vmin_v,
                    mppts=equipo.inversor_mppts,
                    strings_por_mppt=equipo.inversor_strings_por_mppt,
                ),
            )
        ),
        advertencias=advertencias,
        angulo_norte=angulo,
        lado_menor_m=lado_menor,
        ediciones_manuales=resumen.get("ediciones_manuales", 0) + ediciones,
    )

    layout.total_paneles = total
    layout.potencia_kwp = round(potencia, 2)
    # Asignar un dict nuevo: SQLAlchemy no detecta cambios dentro del JSONB
    layout.resumen = resumen
    layout.bloques = [
        BloqueLayout(
            orden=i,
            vertices=b.vertices,
            paneles_largo=b.paneles_largo,
            paneles_ancho=b.paneles_ancho,
            proporcion=b.proporcion,
            en_proporcion=b.en_proporcion,
        )
        for i, b in enumerate(bloques)
    ]

    db.commit()
    db.refresh(layout)
    return layout


# ─── Respuesta ──────────────────────────────────────────────────────


def a_respuesta(layout: Layout, huella: str) -> LayoutLeer:
    """
    Arma la respuesta. Los tipos se recalculan desde los bloques
    guardados, para que sigan siendo correctos cuando RF-05 permita
    editarlos.
    """
    bloques, tipos = agrupar_por_tipo(
        [
            Bloque(
                vertices=b.vertices,
                paneles_largo=b.paneles_largo,
                paneles_ancho=b.paneles_ancho,
                proporcion=b.proporcion,
                en_proporcion=b.en_proporcion,
            )
            for b in layout.bloques
        ]
    )
    resumen = layout.resumen

    return LayoutLeer(
        proyecto_id=layout.proyecto_id,
        parametros=LayoutGenerar(
            paneles_largo=layout.paneles_largo,
            pasillo_m=layout.pasillo_m,
            tolerancia_proporcion=layout.tolerancia_proporcion,
            capacidad_deseada_kwp=layout.capacidad_deseada_kwp,
        ),
        bloques=[
            BloqueLeer(
                vertices=b.vertices,
                paneles_largo=b.paneles_largo,
                paneles_ancho=b.paneles_ancho,
                paneles=b.paneles,
                proporcion=b.proporcion,
                en_proporcion=b.en_proporcion,
                tipo=b.tipo,
            )
            for b in bloques
        ],
        tipos=[
            TipoBloqueLeer(
                tipo=t.tipo,
                paneles_largo=t.paneles_largo,
                paneles_ancho=t.paneles_ancho,
                repeticiones=t.repeticiones,
                paneles=t.paneles,
                proporcion=t.proporcion,
                en_proporcion=t.en_proporcion,
            )
            for t in tipos
        ],
        total_paneles=layout.total_paneles,
        potencia_kwp=layout.potencia_kwp,
        paneles_ancho_ideal=resumen["paneles_ancho_ideal"],
        largo_bloque_m=resumen["largo_bloque_m"],
        ancho_bloque_m=resumen["ancho_bloque_m"],
        separacion_este_oeste_m=resumen["separacion_este_oeste_m"],
        separacion_norte_sur_m=resumen["separacion_norte_sur_m"],
        area_util_m2=resumen["area_util_m2"],
        area_ocupada_m2=resumen["area_ocupada_m2"],
        capacidad=CapacidadLeer(**resumen["capacidad"]) if resumen["capacidad"] else None,
        electrica=ElectricaLeer(**resumen["electrica"]),
        advertencias=resumen["advertencias"],
        angulo_norte=_angulo_del_layout(layout),
        lado_menor_m=_lado_menor_del_layout(layout),
        ediciones_manuales=resumen.get("ediciones_manuales", 0),
        desactualizado=layout.huella != huella,
        created_at=layout.created_at,
        updated_at=layout.updated_at,
    )
