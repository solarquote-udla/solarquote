"""
Lógica de la configuración de equipo — RF-02.
"""

from sqlalchemy.orm import Session

from app.models.equipo import ConfiguracionEquipo, InversorEquipo
from app.models.proyecto import Proyecto
from app.schemas.equipo import (
    AnalisisInversoresLeer,
    CalculosEquipo,
    ConfiguracionEquipoGuardar,
    ConfiguracionEquipoLeer,
    Inversor,
    LimitesStringLeer,
    OcupacionLeer,
    Panel,
)
from app.services.calculo_equipo import (
    InversorElectrico,
    analizar_inversores,
    area_panel_m2,
    limites_string,
    ocupacion_terreno,
    paneles_para_potencia,
)
from app.services.proyecto import avanzar_a_en_diseno
from app.services.terreno import areas_de, obtener_terreno


def obtener_configuracion(db: Session, proyecto_id: int) -> ConfiguracionEquipo | None:
    return (
        db.query(ConfiguracionEquipo)
        .filter(ConfiguracionEquipo.proyecto_id == proyecto_id)
        .one_or_none()
    )


def guardar_configuracion(
    db: Session,
    proyecto: Proyecto,
    datos: ConfiguracionEquipoGuardar,
) -> ConfiguracionEquipo:
    """
    Crea o reemplaza la configuración del proyecto.

    Es un reemplazo completo y no una modificación parcial: panel e
    inversores se validan como conjunto (el Voc contra el Vmp, los
    voltajes de cada inversor entre sí), así que se envían siempre
    enteros.

    Si el proyecto ya tiene layout y cambió la cantidad de inversores,
    sus bloques se reparten de nuevo entre los inversores nuevos. Los
    inversores no cambian la geometría del layout: no hace falta volver
    a generarlo.
    """
    configuracion = obtener_configuracion(db, proyecto.id)
    if configuracion is None:
        configuracion = ConfiguracionEquipo(proyecto_id=proyecto.id)
        db.add(configuracion)
    cantidad_anterior = len(configuracion.inversores)

    panel = datos.panel
    configuracion.panel_marca = panel.marca.strip()
    configuracion.panel_modelo = panel.modelo.strip()
    configuracion.panel_potencia_wp = panel.potencia_wp
    configuracion.panel_largo_mm = panel.largo_mm
    configuracion.panel_ancho_mm = panel.ancho_mm
    configuracion.panel_voc_v = panel.voc_v
    configuracion.panel_vmp_v = panel.vmp_v
    configuracion.angulo_montaje = datos.angulo_montaje
    configuracion.potencia_objetivo_kwp = datos.potencia_objetivo_kwp

    _reemplazar_inversores(db, configuracion, datos.inversores)

    if cantidad_anterior != len(datos.inversores):
        # Importado aquí: el layout depende del equipo, no al revés
        from app.services.layout import reagrupar_si_hay_layout

        reagrupar_si_hay_layout(db, proyecto, configuracion)

    avanzar_a_en_diseno(proyecto)
    db.commit()
    db.refresh(configuracion)
    return configuracion


def _reemplazar_inversores(
    db: Session,
    configuracion: ConfiguracionEquipo,
    inversores: list[Inversor],
) -> None:
    """
    Deja en la configuración exactamente estos inversores, en este orden.

    Reutiliza las filas existentes en lugar de borrarlas y crear otras:
    al vaciar la colección, SQLAlchemy insertaría las nuevas antes de
    borrar las viejas y chocaría con la unicidad de (configuración,
    orden).
    """
    actuales = list(configuracion.inversores)
    for orden, datos in enumerate(inversores):
        if orden < len(actuales):
            fila = actuales[orden]
        else:
            fila = InversorEquipo(orden=orden)
            configuracion.inversores.append(fila)
        fila.marca = datos.marca.strip()
        fila.modelo = datos.modelo.strip()
        fila.potencia_kw = datos.potencia_kw
        fila.vmax_v = datos.vmax_v
        fila.vmin_v = datos.vmin_v
        fila.mppts = datos.mppts
        fila.strings_por_mppt = datos.strings_por_mppt
    for sobrante in actuales[len(inversores):]:
        configuracion.inversores.remove(sobrante)
    db.flush()


def inversores_electricos(configuracion: ConfiguracionEquipo) -> list[InversorElectrico]:
    return [
        InversorElectrico(
            potencia_kw=i.potencia_kw,
            vmax_v=i.vmax_v,
            vmin_v=i.vmin_v,
            mppts=i.mppts,
            strings_por_mppt=i.strings_por_mppt,
        )
        for i in configuracion.inversores
    ]


def analisis_inversores(configuracion: ConfiguracionEquipo, paneles: int) -> AnalisisInversoresLeer | None:
    """Relación DC/AC y sugerencia para `paneles`: la usan el Paso 2 (potencia objetivo) y el Paso 3 (layout)."""
    analisis = analizar_inversores(
        paneles,
        configuracion.panel_potencia_wp,
        inversores_electricos(configuracion),
        configuracion.panel_voc_v,
        configuracion.panel_vmp_v,
    )
    return AnalisisInversoresLeer(**vars(analisis)) if analisis else None


def _calculos(configuracion: ConfiguracionEquipo, area_terreno_m2: float | None) -> CalculosEquipo:
    advertencias: list[str] = []

    # ─── Límites de string, por inversor ─────────────────────
    strings: list[LimitesStringLeer | None] = []
    for inversor in configuracion.inversores:
        if inversor.vmax_v is None or inversor.vmin_v is None:
            strings.append(None)
            continue
        limites = limites_string(
            vmax_inversor=inversor.vmax_v,
            vmin_inversor=inversor.vmin_v,
            voc_panel=configuracion.panel_voc_v,
            vmp_panel=configuracion.panel_vmp_v,
        )
        strings.append(
            LimitesStringLeer(
                paneles_min=limites.paneles_min,
                paneles_max=limites.paneles_max,
                compatible=limites.compatible,
                motivo=limites.motivo,
            )
        )
        # Solo se avisa cuando hay un problema real: el inversor no admite el panel
        if not limites.compatible:
            advertencias.append(f"Inversor {len(strings)}: {limites.motivo}")

    # ─── Potencia objetivo: inversores y terreno ─────────────
    inversores = None
    ocupacion = None
    if configuracion.potencia_objetivo_kwp:
        paneles = paneles_para_potencia(configuracion.potencia_objetivo_kwp, configuracion.panel_potencia_wp)
        inversores = analisis_inversores(configuracion, paneles)
        if inversores:
            advertencias.extend(inversores.mensajes)
        if area_terreno_m2:
            resultado = ocupacion_terreno(
                paneles,
                configuracion.panel_largo_mm,
                configuracion.panel_ancho_mm,
                configuracion.panel_potencia_wp,
                area_terreno_m2,
            )
            if resultado:
                ocupacion = OcupacionLeer(**vars(resultado))
                if resultado.mensaje:
                    advertencias.insert(0, resultado.mensaje)

    return CalculosEquipo(
        area_panel_m2=round(area_panel_m2(configuracion.panel_largo_mm, configuracion.panel_ancho_mm), 4),
        strings=strings,
        inversores=inversores,
        ocupacion=ocupacion,
        advertencias=advertencias,
    )


def a_respuesta(configuracion: ConfiguracionEquipo, db: Session) -> ConfiguracionEquipoLeer:
    """Arma la respuesta de la API: forma anidada más los cálculos (con el área útil del terreno, si hay)."""
    terreno = obtener_terreno(db, configuracion.proyecto_id)
    area_terreno = areas_de(terreno)["area_util"] if terreno is not None else None
    return ConfiguracionEquipoLeer(
        proyecto_id=configuracion.proyecto_id,
        panel=Panel(
            marca=configuracion.panel_marca,
            modelo=configuracion.panel_modelo,
            potencia_wp=configuracion.panel_potencia_wp,
            largo_mm=configuracion.panel_largo_mm,
            ancho_mm=configuracion.panel_ancho_mm,
            voc_v=configuracion.panel_voc_v,
            vmp_v=configuracion.panel_vmp_v,
        ),
        angulo_montaje=configuracion.angulo_montaje,
        inversores=[
            Inversor(
                marca=i.marca,
                modelo=i.modelo,
                potencia_kw=i.potencia_kw,
                vmax_v=i.vmax_v,
                vmin_v=i.vmin_v,
                mppts=i.mppts,
                strings_por_mppt=i.strings_por_mppt,
            )
            for i in configuracion.inversores
        ],
        potencia_objetivo_kwp=configuracion.potencia_objetivo_kwp,
        calculos=_calculos(configuracion, area_terreno),
        created_at=configuracion.created_at,
        updated_at=configuracion.updated_at,
    )
