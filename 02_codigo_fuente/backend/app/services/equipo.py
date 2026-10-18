"""
Lógica de la configuración de equipo — RF-02.
"""

from sqlalchemy.orm import Session

from app.models.equipo import ConfiguracionEquipo, InversorEquipo
from app.models.proyecto import Proyecto
from app.schemas.equipo import (
    CalculosEquipo,
    ConfiguracionEquipoGuardar,
    ConfiguracionEquipoLeer,
    Inversor,
    LimitesStringLeer,
    Panel,
    SeparacionFilas,
    SugerenciaLeer,
)
from app.services.calculo_equipo import (
    area_panel_m2,
    limites_string,
    separacion_entre_filas,
    sugerencia_inversores,
)
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

    # ─── Límites de string, por inversor ─────────────────────
    strings: list[LimitesStringLeer | None] = []
    sin_voltajes: list[int] = []
    for numero, inversor in enumerate(configuracion.inversores, start=1):
        if inversor.vmax_v is None or inversor.vmin_v is None:
            strings.append(None)
            sin_voltajes.append(numero)
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
    if sin_voltajes:
        cuales = ", ".join(str(n) for n in sin_voltajes)
        advertencias.append(
            f"Sin los voltajes máximo y mínimo del inversor {cuales} no se pueden "
            f"validar sus límites de string ni la compatibilidad con el panel."
        )
    if any(limite is not None for limite in strings):
        advertencias.append(ADVERTENCIA_VOC_STC)

    # ─── Sugerencia de inversores ────────────────────────────
    sugerencia = None
    if configuracion.potencia_objetivo_kwp:
        sug = sugerencia_inversores(configuracion.potencia_objetivo_kwp, configuracion.panel_potencia_wp)
        sugerencia = SugerenciaLeer(
            paneles=sug.paneles,
            potencia_kwp=round(sug.potencia_kwp, 2),
            inversores=sug.inversores,
            paneles_por_inversor=sug.paneles_por_inversor,
            kwp_por_inversor=round(sug.kwp_por_inversor, 2),
        )
        if sug.inversores != len(configuracion.inversores):
            advertencias.append(
                f"Para {configuracion.potencia_objetivo_kwp:g} kWp (~{sug.paneles} paneles) se sugieren "
                f"{sug.inversores} inversor(es), a razón de ~400 paneles cada uno; configuraste "
                f"{len(configuracion.inversores)}."
            )

    return CalculosEquipo(
        area_panel_m2=round(
            area_panel_m2(configuracion.panel_largo_mm, configuracion.panel_ancho_mm), 4
        ),
        separacion=separacion,
        strings=strings,
        sugerencia=sugerencia,
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
        calculos=_calculos(configuracion, proyecto),
        created_at=configuracion.created_at,
        updated_at=configuracion.updated_at,
    )
