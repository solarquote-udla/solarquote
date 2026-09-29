"""
Lógica de la configuración de equipo — RF-02.
"""

from sqlalchemy.orm import Session

from app.models.equipo import ConfiguracionEquipo
from app.models.proyecto import Proyecto
from app.schemas.equipo import (
    CalculosEquipo,
    ConfiguracionEquipoGuardar,
    ConfiguracionEquipoLeer,
    Inversor,
    LimitesStringLeer,
    Panel,
    SeparacionFilas,
)
from app.services.calculo_equipo import area_panel_m2, limites_string, separacion_entre_filas
from app.services.proyecto import avanzar_a_en_diseno

ADVERTENCIA_VOC_STC = (
    "Los límites de string usan el Voc de la ficha, medido a 25 °C. En frío "
    "el Voc sube: con temperaturas cercanas a 5 °C, un string en el límite "
    "máximo puede superar el voltaje del inversor. El dimensionamiento "
    "eléctrico definitivo corresponde al instalador."
)


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
    inversor se validan como conjunto (el Voc contra el Vmp, los
    voltajes del inversor entre sí), así que se envían siempre enteros.
    """
    configuracion = obtener_configuracion(db, proyecto.id)
    if configuracion is None:
        configuracion = ConfiguracionEquipo(proyecto_id=proyecto.id)
        db.add(configuracion)

    panel, inversor = datos.panel, datos.inversor

    configuracion.panel_marca = panel.marca.strip()
    configuracion.panel_modelo = panel.modelo.strip()
    configuracion.panel_potencia_wp = panel.potencia_wp
    configuracion.panel_largo_mm = panel.largo_mm
    configuracion.panel_ancho_mm = panel.ancho_mm
    configuracion.panel_voc_v = panel.voc_v
    configuracion.panel_vmp_v = panel.vmp_v
    configuracion.angulo_montaje = datos.angulo_montaje

    configuracion.inversor_marca = inversor.marca.strip()
    configuracion.inversor_modelo = inversor.modelo.strip()
    configuracion.inversor_potencia_kw = inversor.potencia_kw
    configuracion.inversor_vmax_v = inversor.vmax_v
    configuracion.inversor_vmin_v = inversor.vmin_v
    configuracion.inversor_mppts = inversor.mppts
    configuracion.inversor_strings_por_mppt = inversor.strings_por_mppt

    avanzar_a_en_diseno(proyecto)
    db.commit()
    db.refresh(configuracion)
    return configuracion


def _calculos(configuracion: ConfiguracionEquipo, proyecto: Proyecto) -> CalculosEquipo:
    advertencias: list[str] = []

    # ─── Separación entre filas ──────────────────────────────
    separacion = None
    if proyecto.latitud is None:
        advertencias.append(
            "Registra la latitud del proyecto para calcular la separación "
            "mínima entre filas: depende de la altura del sol en el sitio."
        )
    else:
        resultado = separacion_entre_filas(
            profundidad_m=configuracion.panel_largo_mm / 1000,
            angulo_montaje=configuracion.angulo_montaje,
            latitud=float(proyecto.latitud),
        )
        separacion = SeparacionFilas(
            elevacion_solar_grados=round(resultado.elevacion_solar_grados, 2),
            altura_m=round(resultado.altura_m, 3),
            proyeccion_m=round(resultado.proyeccion_m, 3),
            sombra_m=round(resultado.sombra_m, 3),
            paso_minimo_m=round(resultado.paso_minimo_m, 3),
            factor_sombra=round(resultado.factor_sombra, 5),
        )

    # ─── Límites de string ───────────────────────────────────
    strings = None
    if configuracion.inversor_vmax_v is None or configuracion.inversor_vmin_v is None:
        advertencias.append(
            "Sin los voltajes máximo y mínimo del inversor no se pueden "
            "validar los límites de string ni la compatibilidad con el panel."
        )
    else:
        limites = limites_string(
            vmax_inversor=configuracion.inversor_vmax_v,
            vmin_inversor=configuracion.inversor_vmin_v,
            voc_panel=configuracion.panel_voc_v,
            vmp_panel=configuracion.panel_vmp_v,
        )
        strings = LimitesStringLeer(
            paneles_min=limites.paneles_min,
            paneles_max=limites.paneles_max,
            compatible=limites.compatible,
            motivo=limites.motivo,
        )
        advertencias.append(ADVERTENCIA_VOC_STC)

    return CalculosEquipo(
        area_panel_m2=round(
            area_panel_m2(configuracion.panel_largo_mm, configuracion.panel_ancho_mm), 4
        ),
        separacion=separacion,
        strings=strings,
        advertencias=advertencias,
    )


def a_respuesta(configuracion: ConfiguracionEquipo, proyecto: Proyecto) -> ConfiguracionEquipoLeer:
    """Arma la respuesta de la API: forma anidada más los cálculos."""
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
        inversor=Inversor(
            marca=configuracion.inversor_marca,
            modelo=configuracion.inversor_modelo,
            potencia_kw=configuracion.inversor_potencia_kw,
            vmax_v=configuracion.inversor_vmax_v,
            vmin_v=configuracion.inversor_vmin_v,
            mppts=configuracion.inversor_mppts,
            strings_por_mppt=configuracion.inversor_strings_por_mppt,
        ),
        calculos=_calculos(configuracion, proyecto),
        created_at=configuracion.created_at,
        updated_at=configuracion.updated_at,
    )
