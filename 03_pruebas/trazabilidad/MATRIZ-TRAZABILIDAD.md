# Matriz de trazabilidad requisitos → pruebas

Historia: SQ-135 · Corte: 5 de noviembre de 2026 (con el endpoint
`/health/servicios` del RNF-06) · Complementa la Tabla 44 del documento
de titulación (sección 7.3).

Esta matriz conecta cada requisito de la especificación (secciones 2.1.3 y
2.1.4 del documento: RF-01 a RF-16 y RNF-01 a RNF-06) con las pruebas
automatizadas que lo verifican. Para cada regla del requisito indica qué
prueba la cubre, y al final lista lo que todavía no está cubierto y por qué.

Todas las pruebas corren en el CI en cada pull request; la evidencia de un
requisito es la corrida verde del PR indicado.

---

## 1. Resumen

| Componente | Pruebas | Cobertura de líneas | Cómo se ejecutan |
|---|---|---|---|
| Backend (API principal) | 593 | 96 % | `pytest` en `02_codigo_fuente/backend` |
| calc-service | 32 | 100 % | `pytest` en `02_codigo_fuente/calc-service` |
| ia-service | 96 | 94 % | `pytest` en `02_codigo_fuente/ia-service` |
| Frontend (interfaz) | 237 | — | `npm test` en `02_codigo_fuente/frontend` |
| **Total** | **958** | | Las cuatro suites en cada PR (jobs `backend`, `calc-service`, `ia-service`, `frontend`) |

La cobertura se midió con `pytest --cov=app`. RNF-02 pide al menos 60 %
en el backend.

| Estado de los requisitos | Cantidad |
|---|---|
| Cubiertos por pruebas automatizadas | RF-01 a RF-16; RNF-01 (layout), RNF-02, RNF-03, RNF-04 |
| Implementación pendiente | Ninguna |
| Requieren verificación fuera del CI | RNF-01 (precisión con bocetos reales y del conteo de varillas con fotos reales) y RNF-03 (boceto con IA), con el [protocolo de aceptación](../aceptacion/PROTOCOLO-ACEPTACION.md); RNF-05, con la [checklist de compatibilidad](../compatibilidad/CHECKLIST-RNF-05.md); RNF-06, con el [procedimiento de disponibilidad](../fiabilidad/RNF-06-DISPONIBILIDAD.md) |

**Convenciones.** Los archivos `test_*.py` son del backend salvo que se
indique otro servicio. Los nombres terminados en `.test.tsx` son pruebas de
interfaz (`frontend/src/__tests__/`). `calc:` e `ia:` marcan las pruebas de
calc-service e ia-service.

---

## 2. Requisitos funcionales

### RF-01 Terreno y caminos

| Regla del requisito | Pruebas |
|---|---|
| Área del polígono en m², cualquier forma | `test_geometria`: `test_rectangulo`, `test_triangulo`, `test_orden_de_vertices_no_altera_el_area` |
| Mínimo tres vértices; polígono válido | `test_geometria`: `test_menos_de_tres_vertices`, `test_vertices_colineales`, `test_poligono_que_se_cruza`; `test_api_terreno`: `test_terreno_errores_traducidos` |
| El área de los caminos se descuenta (área neta) | `test_geometria`: `test_un_camino`, `test_caminos_que_se_cruzan_no_se_cuentan_dos_veces`, `test_camino_que_sobresale_solo_descuenta_la_parte_interior`; `test_api_terreno`: `test_terreno_y_caminos_ciclo_completo` |
| El área neta debe alcanzar para un panel | `test_geometria`: `test_camino_que_cubre_todo_el_terreno`; `test_layout`: `test_terreno_demasiado_chico` |
| Corregir el polígono antes de confirmar | `asistentePaso1.test.tsx` (dibujo, coordenadas y medidas) |
| Cada error junto a su campo y en rojo; obligatorios marcados; orientación entre 0 y 359,99; ancho y largo mayores que cero | `validacionPaso1.test.tsx` |
| Ubicación con un punto en el mapa satelital (norte arriba) en lugar de escribir latitud y longitud, al estilo de Smart Design: mapa grande con pestañas Mapa y Plano, búsqueda de la dirección (OpenStreetMap) y longitud siempre entre -180 y 180; sin punto se avisa que no habrá sombra | `mapaUbicacion.test.tsx`; `coordenadas.test.tsx`; `validacionPaso1.test.tsx` (ubicación en el mapa y búsqueda de la dirección) |
| Terreno dibujado sobre el mapa satelital (Lenin): largo de cada lado, ajuste a 90°, largo de cada lado editable, vértice en la mitad de un lado, mover y quitar vértices; el contorno se mide en metros desde el punto de ubicación | `terrenoMapa.test.tsx` (10 pruebas: conversión mapa y plano, ajuste a 90°, estirar un lado, Leaflet real); `pasoTerrenoMapa.test.tsx` (6 pruebas) |
| La medida de cada lado en el mapa va afuera del terreno, sin tapar el punto que agrega un vértice | `terrenoMapa.test.tsx`: etiqueta afuera del terreno |
| Solo con permiso | `test_api_terreno`: `test_terreno_exige_generar_layout` |

Evidencia: PR #1, #20, #34 y el PR de SQ-135.

### RF-02 Panel e inversor

| Regla del requisito | Pruebas |
|---|---|
| Área por panel; el cálculo del sol y la separación entre filas se quitó (revisión del 25 de noviembre: Lenin lo considera "un simulador" y no cambia la estructura) | `test_calculo_equipo`: `test_panel_clase_2278`; `test_layout`: `test_la_latitud_ya_no_cambia_la_separacion` |
| Límites de string floor(Vmax/Voc), ceil(Vmin/Vmp) | `test_calculo_equipo`: `test_caso_del_documento`, `test_division_exacta_no_pierde_un_panel`, `test_incompatible_cuando_el_rango_se_cruza` |
| Inversores sin la regla de 400 paneles (Lenin, Santi y Anita, 25 de noviembre): relación DC/AC (reserva si es menor que 1, recorte si supera 1,3, según EIA y NREL), paneles que admiten las entradas (MPPT × strings × paneles por string) y sugerencia con el modelo del inversor 1 con su cuenta; nunca bloquea. Se calcula con la potencia objetivo (Paso 2) y con los paneles del layout (Paso 3) | `test_calculo_equipo`: `TestPanelesParaPotencia`, `TestPanelesQueAdmite`, `TestAnalisisInversores` (incluido el caso de Anita de 6 × 300 kW para 1.500 kWp); `test_varios_inversores`: `test_analisis_de_inversores_con_potencia_objetivo`, `test_mas_potencia_en_inversores_es_reserva`; paridad con `utils/inversores.ts` (`inversores.test.tsx`) |
| La potencia objetivo cabe en el terreno: paneles × largo × ancho frente al área útil; si no caben ni pegados, se avisa con el máximo de paneles (el caso de Anita de 1.500 kWp en 3.536 m²) | `test_calculo_equipo`: `TestOcupacionTerreno`; `test_varios_inversores`: `test_potencia_objetivo_que_no_cabe_en_el_terreno`; `inversores.test.tsx` |
| Ángulo de montaje fijo en 7,5° (aletas de los soportes A y V, ficha Hex001), ya no se escribe; Voc mayor que Vmp | `test_calculo_equipo`: `test_angulo_fuera_de_rango`, `test_voc_debe_superar_vmp`; `test_varios_inversores`: `test_angulo_de_montaje_por_defecto_es_el_de_la_estructura`; `inversores.test.tsx` (se envía 7,5) |
| Presets de paneles comunes | `test_calculo_equipo`: `test_cada_preset_pasa_las_validaciones`, `test_claves_unicas` |
| Varios inversores por proyecto | `test_varios_inversores` (17 pruebas); `inversores.test.tsx` |
| Catálogo de paneles administrable, con búsqueda por marca, modelo y potencia (la búsqueda libre también compara contra la potencia cuando el texto es un número) | `test_panel_administracion` (25 pruebas); `test_api_administracion`: `test_panel_ciclo_completo_y_errores`, `test_panel_busqueda_y_filtros`, `test_panel_busqueda_libre_tambien_encuentra_por_potencia`, `test_paneles_por_permiso`; `test_seguridad`: `test_generar_layout_puede_leer_paneles_pero_no_administrarlos`, `test_sin_ningun_permiso_relacionado_no_lee_paneles` |
| El Paso 2 elige el panel del catálogo, con búsqueda por marca, modelo o potencia; pantalla Configuración, Paneles con el error de cada dato junto a su campo | `catalogoPaneles.test.tsx` |
| Catálogo inicial según Producción: paneles de más de 600 W de LONGi, Jinko, JA Solar y Canadian Solar; los demás quedan desactivados | `test_catalogo_produccion`: cada panel pasa las validaciones de la API y es compatible con cada inversor (migración `e7b2a9c41d06`) |
| Mensajes de validación en español, con el campo (`loc`) correcto — tanto en las restricciones de Pydantic (rango, obligatorio, tipo) como en las reglas entre dos campos (Voc/Vmp, largo/ancho, Vmax/Vmin) | `test_errores_validacion` (11 pruebas) |
| Paso 2: cada error junto a su campo (panel, ángulo, potencia objetivo e inversores), también los del servidor por su `loc`; la potencia objetivo (kWp de paneles) va aparte de los inversores (kW) | `pasos12Revision.test.tsx` (Paso 2); `inversores.test.tsx` |

Evidencia: PR #2, #38 y los del catálogo de paneles y los mensajes de validación.

### RF-03 Generación del layout

| Regla del requisito | Pruebas |
|---|---|
| L y A los elige el Gerente (L par hasta 40); aviso de bloque compacto A = 3 × L, contado en paneles, sin bloquear (revisión con HEXtructure del 17 de noviembre de 2026) | `test_layout`: `test_bloque_compacto_es_a_igual_a_tres_l`, `test_bloques_reales_de_clientes_no_son_compactos`, `test_la_tolerancia_decide_el_borde`, `test_sin_a_se_usa_el_bloque_compacto`, `test_a_manual_no_compacto_avisa_pero_genera`; `test_api_layout_bloque_manual`; `bloqueCompacto.test.tsx` |
| Separación entre paneles dentro del bloque (6 cm a lo largo, 2 cm entre paneles), configurable | `test_layout`: `test_separacion_entre_paneles_agranda_el_bloque`, `test_bloque_corto_cuenta_la_separacion`, `test_medida_fila_y_paneles_que_entran_son_inversas`; `test_api_layout_bloque_manual`: `test_editar_reconstruye_el_bloque_con_la_separacion`; `bloqueCompacto.test.tsx` (paridad de `anchoBloque`) |
| Paneles dibujados dentro de cada bloque en el plano | `bloqueCompacto.test.tsx`: "cada bloque lleva sus paneles dibujados" |
| Respeta el polígono y los caminos | `test_layout`: `test_terreno_irregular_con_caminos_cruzados`, `test_camino_que_cubre_todo_el_terreno` |
| Layout sobre la imagen satelital (pestaña Mapa en el Paso 3 y la confirmación) y caminos dibujados en el mapa por su eje y su ancho, con el largo de cada tramo y ajuste a 90°; la sección de caminos va junto a la vista (revisión de UX del 21 de noviembre) | `caminosMapa.test.tsx` (8 pruebas); `mapaLayout.test.tsx` (2 pruebas, Leaflet real) |
| Separación entre bloques por el pasillo (sin sombra desde el 25 de noviembre) | `test_layout`: `test_pasillo_configurable_se_respeta`, `test_la_latitud_ya_no_cambia_la_separacion`, `test_inclinacion_reduce_el_largo_en_planta` |
| Capacidad deseada opcional: cabe o se informa la máxima | `test_layout`: `test_capacidad_que_cabe_recorta_el_layout`, `test_capacidad_que_no_cabe_devuelve_la_maxima` |
| Al recortar a la capacidad se eligen los bloques completos más cercanos al centro; los bloques cortos de las puntas solo entran si hacen falta | `test_layout`: `test_capacidad_elige_bloques_completos_en_el_centro_y_no_las_puntas` |
| Validación eléctrica: strings y strings por MPPT | `test_layout`: `test_electrica_inversor_*` (6 pruebas) |
| Reparto de bloques entre inversores | `test_layout`: `test_dos_inversores_iguales_se_reparten_mitad_y_mitad`, `test_cada_inversor_recibe_un_sector_seguido`; `test_varios_inversores` |
| L par | `test_layout`: `test_l_impar_o_cero_se_rechaza` |
| A mínimo de los bloques cortos (SQ-170): sin él se aprovecha todo; con él no se generan bloques más cortos, tampoco al recortar por capacidad | `test_layout`: `test_a_minimo_*` (4 pruebas), `test_capacidad_con_a_minimo_no_deja_un_bloque_chico_al_final`; `test_api_layout_a_minimo` (4 pruebas); `layoutAMinimo.test.tsx` |
| La capacidad deseada parte de la potencia objetivo del Paso 2; si esa potencia cambia, el layout queda desactualizado | `test_layout_edicion`: `test_cambiar_la_potencia_objetivo_desactualiza_el_layout`; `potenciaObjetivo.test.tsx` |
| Al recortar a la capacidad deseada, el último bloque nunca queda más angosto que 3 paneles (ni un candidato ya angosto por un camino se instala tal cual), aunque "A mínimo" esté en 1: una estructura de soporte para 1 o 2 paneles no es construible, aunque la potencia cuadre (revisión de UX del 21 de noviembre de 2026) | `test_layout`: `test_capacidad_nunca_deja_un_bloque_mas_angosto_que_3_aunque_a_minimo_este_en_1` |
| Edición manual (SQ-64) | `test_layout_edicion` (23 pruebas), paridad con `utils/edicionLayout.ts`; `asistentePasos2y3.test.tsx` |
| Orientación de los bloques: norte, o alineados al terreno (revisión del 25 de noviembre): el sistema prueba cada dirección de lado con las filas a lo largo y de través y se queda con la que más paneles ubica; siempre informa cuántos paneles entran con cada orientación y sugiere la mejor. Con el terreno real de Envasur (coordenadas UTM del plano 1899-ARQ-PL-001) reproduce los 6 bloques de 10 × 28 de la CT203A | `test_layout_orientacion_bloques` (14 pruebas, incluida `test_envasur_alineado_al_terreno_da_los_seis_bloques_de_la_ct203a`); `orientacionBloques.test.tsx` (4 pruebas) |
| Revisión de Esteban del #107: si se pide alinear al terreno y así no entra ningún bloque, se usa el norte, se avisa y se guarda la orientación usada (no la pedida) | `test_layout_orientacion_bloques`: `test_si_alineado_no_entra_nada_se_usa_el_norte_y_se_avisa`, `test_se_guarda_la_orientacion_que_se_uso` |
| Vista 3D del layout (Lenin): terreno, caminos y bloques con los paneles en la estructura en casita (soportes en V y en A) con el ángulo de montaje del Paso 2; se gira y acerca con el mouse; aviso si no hay WebGL | `vista3d.test.tsx` (8 pruebas: geometría de soportes y paneles, inclinación, base derecha, pestañas Plano y 3D) |

Evidencia: PR #14, #27, #34, #38 y el de SQ-170.

### RF-04 Carga y procesamiento del boceto

| Regla del requisito | Pruebas |
|---|---|
| Formatos PDF, JPG, PNG y DXF, detectados por contenido | `ia: test_endpoint_bocetos`: `test_el_formato_se_detecta_por_contenido_y_no_por_extension`, `test_formato_desconocido` |
| Tamaño máximo 10 MB; archivo vacío | `ia: test_endpoint_bocetos`: `test_archivo_demasiado_grande`, `test_archivo_vacio`; `test_boceto`: `test_archivo_vacio_o_demasiado_grande`; `bocetos.test.tsx` |
| DXF por geometría (ezdxf): L, A, B y orientación | `ia: test_dxf` (10 pruebas: rotación, bloques insertados, incompletos, L impar) |
| Planos reales de HEXtructure (revisión del 25 de noviembre): paneles dibujados como polilíneas 3D (inclinados), bloques escalonados que siguen las curvas de nivel partidos en bloques rectangulares sin perder paneles, cada bloque contado con su propio giro, y avisos de zonas separadas y de giros distintos (varias fases). Con el DXF de Incubandina lee los 1.284 paneles; con el de Ecuahielos, los 30 bloques de 18 × 26 y 16 de 18 × 28 de las dos fases | `ia: test_dxf` (+8: `test_paneles_dibujados_en_3d_se_proyectan_al_plano`, `test_bloque_escalonado_como_en_incubandina`, `test_cada_bloque_se_cuenta_con_su_propio_giro`, zonas, `test_rectangulos_de_grupo`) |
| Paneles repetidos en la misma posición (copiados encima de otro) se cuentan una vez y se avisa (revisión de Esteban del #108; el plano de Ecuahielos tiene 208) | `ia: test_dxf`: `test_panel_repetido_en_la_misma_posicion_se_cuenta_una_vez_y_se_avisa` |
| DWG de AutoCAD: se convierte a DXF con LibreDWG (`dwg2dxf`) y se lee por geometría; sin convertidor, o si falla, pide guardarlo como DXF | `ia: test_dwg` (4 pruebas); `test_boceto`: `test_un_dwg_convertido_se_guarda_como_dwg_y_se_descarga_tal_cual`; `bocetos.test.tsx` (se puede elegir un DWG) |
| PDF de CAD por geometría, sin IA (paneles dibujados como vectores); si no hay geometría, pasa a la IA | `ia: test_pdf_vectorial` (PDF vectoriales generados en la prueba: rectángulos `re` y polilíneas, panel parado, varias páginas, escaneo y PDF ilegible sin geometría, sin llamada a la API); `test_boceto`: `test_pdf_leido_por_geometria_se_guarda_con_su_metodo`; `bocetos.test.tsx` (etiqueta del método) |
| PDF e imagen con IA, respuesta validada | `ia: test_ia` (API simulada: herramienta en modo auto con un reintento, errores de Anthropic al log sin la clave) |
| PDF enviado como imágenes para que el modelo vea la grilla (página completa + 4 ampliaciones) | `ia: test_mosaico` (PDF reales generados en la prueba: tamaños, rótulos, límite de páginas, JPEG para escaneos pesados); `ia: test_ia`: `test_pdf_real_se_envia_como_mosaico_de_imagenes`, `test_pdf_que_no_se_puede_renderizar_va_como_documento` |
| Mensaje claro si no se puede procesar | `test_boceto`: `test_errores_de_ia_service_se_reenvian_con_su_mensaje`, `test_error_interno_de_ia_service_no_se_reenvia` |
| Resultado disponible para RF-05; reemplazo del anterior | `test_boceto`: `test_cargar_guarda_el_archivo_y_los_bloques`, `test_un_boceto_nuevo_reemplaza_al_anterior`, `test_dos_cargas_simultaneas_se_ordenan_y_gana_la_ultima` |
| Solo con permiso | `test_boceto`: `test_requiere_permiso_de_cargar_boceto` |

Evidencia: PR #44, `fix/ia-tool-choice-auto`, `feat/ia-pdf-mosaico` y `feat/ia-pdf-vectorial`.

### RF-05 Confirmación y edición del diseño

| Regla del requisito | Pruebas |
|---|---|
| Diagrama con bloques y su estado de proporción | `confirmacion.test.tsx`, `bocetos.test.tsx` (confirmación del boceto) |
| Confirmación explícita antes de calcular | `test_confirmacion`: `test_bloques_fuera_de_proporcion_exigen_aceptarlos`; `test_boceto`: `test_fuera_de_proporcion_exige_aceptarlos` |
| Editar L, A, orientación y repeticiones; agregar y quitar | `test_boceto`: `test_editar_reemplaza_los_tipos_*`, `test_editar_valida_cada_tipo`; `bocetos.test.tsx`: orientación y agregar/quitar tipos |
| No se confirma un diseño desactualizado | `test_confirmacion`: `test_layout_desactualizado_no_se_cotiza` |
| La latitud ya no desactualiza el layout (revisión de Esteban del #109: la sombra se quitó); los layouts guardados con la huella anterior, que incluía la latitud, siguen al día mientras no cambie otra cosa | `test_layout_orientacion_bloques`: `test_corregir_la_latitud_no_desactualiza_el_layout`, `test_layout_con_la_huella_anterior_sigue_al_dia` |
| Una cotización por proyecto | `test_confirmacion`: `test_un_proyecto_se_cotiza_una_sola_vez`; `test_boceto`: `test_cotizado_queda_congelado` |

Evidencia: PR #42 y #44.

### RF-06 Cálculo de materiales

| Regla del requisito | Pruebas |
|---|---|
| Las diez fórmulas f(L, A, B) | `calc: test_calculo_materiales` (13 pruebas, casos a mano y EMIHANA) |
| Varios ítems; total = suma | `calc: test_endpoint_cotizacion`; `test_confirmacion`: `test_items_del_layout_agrupa_bloques_iguales` |
| Subtotal e IVA (sin addendum, decisión de reunión con Santi: SQ-213) | `calc: test_endpoint_cotizacion`; `test_cotizacion_servicio`: `test_persiste_el_desglose_en_la_cotizacion` |
| L par | `calc: test_calculo_materiales` |
| Precios vigentes; material nuevo sin precio no bloquea | `test_cotizacion_servicio`: `test_lanza_si_falta_precio_vigente_*`, `test_un_material_nuevo_sin_precio_no_bloquea_la_cotizacion` |
| Comunicación segura con calc-service | `calc: test_autenticacion`; `test_calc_service` |

Evidencia: PR #5, #10 a #13, #16, #19, #28, y el de SQ-213 (quita el addendum).

### RF-07 Documento de cotización

Formato institucional, calcado de la proforma real (CT-129-2025, proyecto
EMIHANA): datos del oferente, concepto, potencia en kWp, notas con la
configuración L/A/bloques de cada ítem, materiales en el orden de esa
proforma (no alfabético), condiciones comerciales, tabla de pagos y
datos bancarios con la firma del representante legal. Los datos del
oferente (RUC, teléfono, correo, cuenta) se cargan de `settings` (.env
local o variables de Railway), nunca hardcodeados: el repositorio es
público.

| Regla del requisito | Pruebas |
|---|---|
| Documento Word con el detalle de materiales | `test_proforma_documentos`: `test_word_materiales_en_orden_con_codigos_y_descripciones`, `test_word_resumen_notas_pagos_y_vigencia` |
| Hoja de cálculo Excel con las mismas cantidades, editable | `test_excel_incluye_encabezado_materiales_figura_y_datos_bancarios`, `test_excel_subtotales_y_totales_son_formulas` (fórmulas, no valores fijos: cantidad × precio, `SUM`, IVA sobre el subtotal; sin addendum, SQ-213) |
| Materiales en el orden de la proforma real, no alfabético | `test_materiales_en_el_orden_de_la_proforma_real`, `test_material_fuera_del_orden_conocido_cae_al_final` |
| Ambos con datos del cliente, subtotal, IVA y total (sin addendum ni empresa, SQ-213) | mismas pruebas; `test_word_sin_proforma_ni_datos_opcionales_del_cliente_no_falla` cubre los campos opcionales |
| Datos del oferente, condiciones, pagos y banco sin romper si no están configurados | `test_word_sin_datos_del_oferente_no_falla_y_omite_las_secciones`, `test_excel_sin_datos_del_oferente_no_falla` |
| Dinero en `Decimal`, formato de Ecuador ($ 5.025,60) | `test_moneda_formato_ecuador` |
| El número de proforma se asigna al emitir | Ya cubierto (SQ-82): `test_confirmacion`: `siguiente_numero_proforma` |
| Los archivos se descargan desde la interfaz | `test_proforma_documentos`: `test_descarga_responde_el_archivo_con_su_tipo_y_nombre`; botón en `CotizacionDetallePage` (`cotizacion-detalle.test.tsx`) |
| Documento de cotización en menos de 10 s (RNF-03) | `test_rnf`: `test_rnf03_documento_de_cotizacion_en_menos_de_10_s` |
| Condiciones (plazo, validez, garantía) editables por cotización, no fijas en `settings`; forma de pago como lista de tramos (nombre y %) sobre el subtotal sin IVA; precio por Wp calculado, no editable (SQ-214) | `test_cotizacion_servicio`: `test_sin_condiciones_usa_los_valores_de_settings`, `test_condiciones_editadas_pisan_las_de_settings`, `test_precio_por_wp_se_calcula_del_subtotal_y_la_potencia`, `test_forma_de_pago_debe_sumar_cien` |
| Logística editable por cotización (acuerdo con Santi, 27 de noviembre: depende del lugar de entrega, a veces es 0); ya no es el precio del catálogo del material LOG | `test_cotizacion_servicio`: `test_logistica_usa_el_valor_de_settings_por_defecto`, `test_persiste_la_cantidad_y_precio_unitario_de_cada_material`, `test_no_manda_cargo_fijo_de_logistica_si_el_material_no_existe` |
| Campo "Logística (USD)" en las condiciones de la confirmación (Paso 3 y boceto), desde 0 y con hasta dos decimales; parte del valor de la configuración (`GET /api/proforma/condiciones` devuelve `logistica_monto`) | `test_condiciones_proforma`: `test_valores_por_defecto_de_la_configuracion`; `condicionesProforma.test.tsx` (+2) |
| Formulario de condiciones en la confirmación del Paso 3 y del boceto: parte de la configuración (`GET /api/proforma/condiciones`), formas de pago 40 / 60 y 30 / 25 / 25 / 20, errores junto a cada campo y no confirma si los tramos no suman 100; las condiciones se ven en el detalle de la cotización con los pagos sin IVA | `test_condiciones_proforma` (4 pruebas); `condicionesProforma.test.tsx` (9 pruebas) |
| Formato de la proforma de HEXtructure (CT519 y CT521A, revisión del 23 de noviembre): logo, recuadros del oferente y del cliente, franja con potencia, paneles, plazo y garantía, códigos y descripciones de HEXtructure (VARL1, VARL2, HEX1_B), resumen con el precio por Wp, notas con la distribución de bloques, vigencia y figura de los elementos | `test_codigos_y_descripciones_de_la_proforma_de_hextructure`, `test_word_encabezado_recuadros_concepto_y_franja`, `test_word_figura_de_elementos_y_distribucion`, `test_word_vigencia_con_la_nota_configurada`, `test_word_sin_potencia_ni_paneles_deja_la_franja_con_guion`, `test_word_cero_paneles_o_cero_potencia_se_muestran_como_cero`, `test_la_unidad_sale_del_material`, `test_excel_recuadros_y_franja_simetricos`, `test_excel_descripcion_en_dos_columnas_combinadas` |
| En el Excel, el precio por Wp y la fila final "Total sin IVA" de la tabla de pagos son fórmulas (recalculan si cambia una cantidad); una cotización anterior a SQ-213/214 sin tramos propios usa los de la configuración en el Word y el Excel, en vez de la tabla de pagos vacía | `test_excel_precio_por_wp_es_formula_sobre_el_subtotal`, `test_excel_sin_potencia_no_rompe_el_precio_por_wp`, `test_excel_total_sin_iva_suma_los_tramos_de_pago`, `test_excel_sin_tramos_propios_usa_los_de_la_configuracion`, `test_word_resumen_notas_pagos_y_vigencia` (fila "Total sin I.V.A."), `test_word_sin_tramos_propios_usa_los_de_la_configuracion` |

Evidencia: PR de SQ-79/SQ-80/SQ-81/SQ-83/SQ-84, el de SQ-213 (quita el addendum y el campo Empresa) y el de SQ-214 (condiciones editables por cotización).

### RF-08 Lista de referencia de inversores

| Regla del requisito | Pruebas |
|---|---|
| Registrar, consultar, actualizar, dar de baja | `test_inversor_administracion` (25 pruebas); `test_api_administracion`: `test_inversor_ciclo_completo_y_errores` |
| Búsqueda por marca o modelo | `inversores-catalogo.test.tsx` |
| Vmax mayor que Vmin cuando se registran | `test_inversor_administracion`: `test_rechaza_vmax_menor_o_igual_que_vmin`; `test_api_administracion` (422) |
| Marca y modelo únicos | `test_api_administracion` (409) |
| Solo con permiso de parametrización | `test_api_administracion`: `test_inversores_por_permiso`; `test_seguridad`: `test_generar_layout_puede_leer_inversores_pero_no_administrarlos` |
| Selector en RF-02 | `inversores.test.tsx` |
| Catálogo inicial según Producción: Huawei SUN2000-100KTL-M2, 330KTL-H1 y 506KTL-H1 | `test_catalogo_produccion`: `test_cada_inversor_nuevo_pasa_las_validaciones_de_la_api` |
| Error de validación (propio o del backend, por `loc`) junto al campo correspondiente; en el mensaje general (pantallas que todavía no muestran el error por campo) se antepone el campo solo si no es un `value_error` propio — esos ya lo mencionan en el texto —, legible en vez de `snake_case` | `inversores-catalogo.test.tsx` ("Configuración, Inversores: alta con error por campo", 5 pruebas); `api.test.tsx` (`mensajeDeError`/`erroresDeCampo`, 9 pruebas) |

Evidencia: PR #37, el PR de SQ-135, el PR de SQ-209 y su corrección (SQ-210).

### RF-09 Materiales y precios

| Regla del requisito | Pruebas |
|---|---|
| Precio con fecha de vigencia e historial | `test_material_administracion`: `test_actualizar_precio_cierra_el_anterior_y_crea_uno_nuevo`, `test_historial_queda_ordenado_*`; `test_api_administracion`: `test_material_ciclo_completo` |
| Las cotizaciones emitidas conservan sus precios | `test_cotizacion_servicio`: `test_persiste_la_cantidad_y_precio_unitario_de_cada_material` |
| Cualquier material se puede desactivar, incluido uno de las fórmulas; una cotización nueva simplemente lo excluye (pedido de Santi en la reunión del 17 de noviembre) | `test_material_administracion`: `test_se_puede_desactivar_un_codigo_de_formula`; `test_cotizacion_servicio`: `test_material_de_formula_desactivado_se_excluye_de_la_cotizacion`; `test_api_administracion`; calc-service `test_endpoint_cotizacion`: `test_material_sin_precio_se_excluye_de_la_cotizacion`, `test_cargo_fijo_sin_precio_se_excluye_de_la_cotizacion` |
| Precio mayor o igual a cero | `test_material_administracion`: `test_acepta_cero`, `test_rechaza_negativo`; `test_api_administracion` (422) |
| Precios y catálogo con permisos separados | `test_api_administracion`: `test_precios_y_materiales_por_permiso`; `test_seguridad`: `test_ver_materiales_no_permite_cambiar_precios` |
| Error de validación (propio o del backend, por `loc`) junto al campo correspondiente, en Materiales y en Precios | `catalogoMateriales.test.tsx` (5 pruebas) |

Evidencia: PR #23 a #25, #35, el PR de SQ-135, el PR de SQ-211 y el PR de SQ-212.

### RF-10 Historial de cotizaciones

| Regla del requisito | Pruebas |
|---|---|
| Listado filtrado por fechas, cliente, estado y proforma | `test_cotizacion_historial`: `test_filtra_por_rango_de_fechas_inclusive`, `test_filtra_por_estado`, `test_buscar_*` |
| Detalle con materiales, cantidades y L/A/B | `test_cotizacion_historial`: `test_obtener_cotizacion_trae_items_y_materiales`; `historial.test.tsx` |
| Solo con permiso | `test_seguridad`: `test_historial_lo_lee_quien_tiene_*`, `test_historial_no_lo_lee_cualquier_otro_permiso` |
| Descargar de nuevo el documento | `test_proforma_documentos`: `test_descarga_responde_el_archivo_con_su_tipo_y_nombre` |
| Ver la planta del proyecto desde el detalle (pedido de Santi): terreno, caminos y bloques con sus paneles, de solo lectura y con el permiso del historial; aviso si el plano cambió después de cotizar | `test_planta` (6 pruebas); `plantaCotizacion.test.tsx` (6 pruebas) |

Evidencia: PR #39.

### RF-11 Seguridad

| Regla del requisito | Pruebas |
|---|---|
| Todas las funcionalidades exigen autenticación | `test_seguridad`: `test_ningun_endpoint_queda_abierto` (recorre todas las rutas) |
| Contraseñas con bcrypt, factor de al menos 10 | `test_rnf`: `test_rnf04_bcrypt_con_factor_de_al_menos_10` |
| Cierre por 30 minutos de inactividad | `inactividad.test.tsx` (5 pruebas) |
| Perfiles con permisos; acceso por módulo | `test_seguridad`: `test_perfil_personalizado_y_cambio_de_permisos_inmediato`, `test_un_perfil_sin_permisos_no_entra_a_ningun_modulo`; `aplicacion.test.tsx` (menú) |
| Producción solo accede a Validación | `test_seguridad`: `test_personal_de_produccion_solo_ve_validacion` |
| Bloqueo por intentos; mensaje que no revela correos | `test_seguridad`: `test_bloqueo_tras_intentos_fallidos`, `test_login_no_revela_si_el_correo_existe`, `test_login_hace_el_mismo_trabajo_exista_o_no_el_correo` |
| Nadie se otorga más permisos de los que tiene | `test_seguridad`: `test_solo_se_otorgan_permisos_propios`, `test_no_se_asigna_ni_administra_un_perfil_con_mas_permisos`, `test_dos_desactivaciones_simultaneas_no_dejan_sin_gerente` |
| Doble envío y cambios sin guardar | `escrituras.test.tsx`, `concurrencia.test.tsx` |

Evidencia: PR #30 a #33, #36 y el PR de SQ-135.

### RF-12 Clientes

| Regla del requisito | Pruebas |
|---|---|
| Registrar, consultar, actualizar, dar de baja | `test_cliente_servicio` (31 pruebas); `test_api_administracion`: `test_cliente_ciclo_completo` |
| Correo y teléfono obligatorios (pedido de Anita, 25 de noviembre: los necesita «Enviar cotización»), con formato válido; cédula y RUC | `test_cliente_servicio`: `test_rechaza_telefono_vacio`, `test_rechaza_telefono_faltante`, `test_rechaza_email_invalido`, `test_rechaza_email_faltante`, `test_rechaza_email_nulo`, `test_rechaza_telefono_nulo`; `test_validaciones_identificacion` (21 pruebas), paridad con `utils/identificacion.ts`; `test_api_administracion`: `test_cliente_errores_traducidos` |
| La baja conserva las cotizaciones | `test_cliente_servicio`: `test_marca_inactivo`; `test_cotizacion_servicio`: `test_snapshot_del_cliente_viene_de_la_base_y_no_del_request` |
| Solo con permiso | `test_api_administracion`: `test_clientes_lectura_y_administracion_por_permiso` |
| Crear el cliente desde el Paso 1 (Lenin): el alta también la puede hacer quien tiene permiso de generar layout, no solo quien administra clientes | `test_api_administracion`: `test_crear_cliente_desde_el_proyecto` |
| Pantalla: botón «Nuevo cliente» en el Paso 1 que registra y deja elegido al cliente sin salir del asistente | `pasos12Revision.test.tsx` (Paso 1) |
| Botón «Enviar cotización» por correo o WhatsApp con el mensaje prellenado, desde el detalle de la cotización (idea de Esteban, pedido de Anita del 25 de noviembre); el documento se descarga aparte, no se adjunta solo | `cotizacion-detalle.test.tsx` (3 pruebas) |

Evidencia: PR #17, #18, #22, el PR de SQ-135 y el de crear cliente desde el proyecto.

### RF-13 Tablero de indicadores

| Regla del requisito | Pruebas |
|---|---|
| Número y monto de cotizaciones, kWp cotizados | `test_tablero`: `test_resumen_*` (4 pruebas) |
| Gráficos por período y por estado | `test_tablero`: `test_cotizaciones_por_periodo_*`, `test_cotizaciones_por_estado_*`; `tablero.test.tsx` |
| Rango de fechas válido | `test_tablero`: `test_desde_posterior_a_hasta_*`, `test_rango_de_mas_de_24_meses_*` |
| Solo con permiso | `test_seguridad`: `test_tablero_lo_lee_quien_tiene_*` |
| Bocetos procesados | `test_tablero`: `test_resumen_cuenta_los_bocetos_procesados_en_el_rango`; `tablero.test.tsx` |
| Lotes despachados y recibidos | `test_validacion`: `test_tablero_cuenta_lotes_despachados_y_recibidos`; `tablero.test.tsx` |
| Accesos según el perfil y proyectos recientes para retomar | `inicio.test.tsx` (8 pruebas) |

Evidencia: PR #40 y #43.

### RF-14 Validación de despacho y conteo de varillas por IA

| Regla del requisito | Pruebas |
|---|---|
| El despacho cubre exactamente los materiales cotizados | `test_validacion`: `test_el_despacho_debe_cubrir_exactamente_los_materiales_cotizados` (3 casos), `test_trazabilidad_obligatoria_y_cantidades_no_negativas` |
| Diferencia contra lo cotizado exige justificación | `test_validacion`: `test_diferencia_en_el_despacho_exige_justificacion`; `validacion.test.tsx`: "una cantidad distinta a la cotizada exige justificación" |
| Trazabilidad: fabricó, soldó, contó, despachó, destino, fecha | `test_validacion`: `test_despacho_sin_diferencias_pasa_a_despachada`, `test_trazabilidad_obligatoria_y_cantidades_no_negativas` |
| Conteo con IA de los extremos de varilla | `ia: test_conteo` (14 pruebas, API de Claude simulada); `test_validacion`: `test_conteo_de_varillas_reenvia_la_foto_a_ia_service`, `test_conteo_errores`; `validacion.test.tsx`: "el conteo de la IA llena la cantidad despachada", "si la IA no está disponible la foto queda como evidencia" |
| Fotos JPG o PNG hasta 10 MB, guardadas como evidencia | `test_validacion`: `test_fotos_del_despacho_se_guardan_y_se_pueden_ver`, `test_fotos_invalidas_se_rechazan_sin_despachar`, `test_foto_de_mas_de_10_mb` |
| Un solo despacho por propuesta, también con dos confirmaciones a la vez | `test_validacion`: `test_no_se_despacha_dos_veces`, `test_dos_despachos_simultaneos_solo_uno_gana`; `validacion.test.tsx`: "confirma una sola vez" |
| Reporte de despacho | `validacion.test.tsx`: "muestra la línea de tiempo y los reportes de despacho y recepción" |
| Solo con permiso (Personal de Producción por defecto) | `test_validacion`: `test_permisos_de_cada_opcion` |

### RF-15 Validación de recepción en terreno

| Regla del requisito | Pruebas |
|---|---|
| Checklist por material con OK, Diferencia o Pendiente | `test_validacion`: `test_checklist_con_ok_diferencia_y_pendiente`; `validacion.test.tsx`: "espera lo despachado, no lo cotizado" |
| Toda diferencia con cantidad y observación | `test_validacion`: `test_checklist_incoherente_se_rechaza` (6 casos), `test_la_base_rechaza_un_item_de_recepcion_incoherente`; `validacion.test.tsx`: "una diferencia exige la cantidad recibida y la observación" |
| Se compara contra lo despachado | `test_validacion`: `test_checklist_con_ok_diferencia_y_pendiente` |
| Solo después del despacho; confirmada no se modifica | `test_validacion`: `test_recepcion_antes_del_despacho`, `test_la_recepcion_confirmada_no_se_modifica` |
| Reporte de recepción con evidencia fotográfica | `test_validacion`: `test_checklist_con_ok_diferencia_y_pendiente`; `validacion.test.tsx`: "confirma el checklist una sola vez y abre el seguimiento" |

### RF-16 Seguimiento del estado de la propuesta

| Regla del requisito | Pruebas |
|---|---|
| Transiciones en orden: cotizada, despachada, recibida, instalada | `test_validacion`: `test_ciclo_completo_hasta_instalada`, `test_la_base_exige_fecha_de_instalacion_coherente` |
| Línea de tiempo con fecha y responsable | `test_validacion`: `test_ciclo_completo_hasta_instalada`, `test_consultar_seguimiento`; `historial.test.tsx`: "muestra la línea de tiempo de la propuesta" |
| Instalación registrada a mano por quien tiene permiso | `test_validacion`: `test_permisos_de_cada_opcion`; `validacion.test.tsx`: "marca la propuesta recibida como instalada", "sin el permiso no ofrece marcarla" |
| Visible en el historial y en el tablero | `historial.test.tsx`; `test_validacion`: `test_tablero_cuenta_lotes_despachados_y_recibidos` |
| Listas de lotes por despachar y por recibir | `test_validacion`: `test_listas_de_despacho_y_recepcion` |

---

## 3. Requisitos no funcionales

| Requisito | Métrica | Cómo se verifica | Estado |
|---|---|---|---|
| **RNF-01** Adecuación funcional | Layout con variación ≤ 5 % frente al óptimo calculado a mano | `test_layout`: `test_cumple_rnf01_frente_al_optimo_teorico`, `test_rectangulo_100_por_60`, `test_encaje_exacto_sin_bloques_cortos` | Cumple |
| | Detección de bloques ≥ 90 % en bocetos reales | DXF: `ia: test_dxf` con planos sintéticos de resultado conocido. PDF e imagen: `ia: scripts/evaluar_ia.py bocetos` con los bocetos reales de HEXtructure (M1 del protocolo de aceptación); sus cuentas, en `ia: test_evaluar_ia` | Pendiente de medición |
| **RNF-02** Mantenibilidad | Cobertura del backend ≥ 60 % | `pytest --cov`: 96 % backend, 100 % calc-service, 93 % ia-service | Cumple |
| | Separación frontend, backend, base y documentación técnica | Arquitectura de servicios; `01_documentacion/arquitectura` | Cumple |
| **RNF-03** Desempeño | Layout con validación eléctrica y capacidad ≤ 15 s | `test_rnf`: terreno de 16 ha con caminos, 48 000 paneles y 70 inversores, directo y por la API (≈ 0,5 s) | Cumple |
| | Boceto procesado ≤ 30 s | DXF: `ia: test_dxf`: `test_planta_grande_en_tiempo_razonable` (< 3 s). PDF e imagen con IA: `ia: scripts/evaluar_ia.py bocetos` con la clave real (M2 del protocolo de aceptación) | Parcial |
| | Documento de cotización ≤ 10 s | `test_rnf`: `test_rnf03_documento_de_cotizacion_en_menos_de_10_s` | Cumple |
| **RNF-04** Seguridad | 100 % de las funcionalidades autenticadas | `test_seguridad`: `test_ningun_endpoint_queda_abierto` | Cumple |
| | bcrypt con factor ≥ 10 | `test_rnf`: `test_rnf04_bcrypt_con_factor_de_al_menos_10` (factor 12) | Cumple |
| | Expiración tras 30 minutos de inactividad | `inactividad.test.tsx` | Cumple desde este corte |
| **RNF-05** Compatibilidad | Chrome, Firefox, Safari y Edge recientes | Revisión manual en cada navegador, con la [checklist de compatibilidad](../compatibilidad/CHECKLIST-RNF-05.md) | Pendiente de medición |
| **RNF-06** Fiabilidad | Disponibilidad ≥ 99 %, recuperación ≤ 5 min | Endpoints `/health` probados (`calc: test_health`, `test_cors`, `test_health`: `/health/servicios`); medición con el [procedimiento de disponibilidad](../fiabilidad/RNF-06-DISPONIBILIDAD.md) (UptimeRobot) | Pendiente de medición |

---

## 4. Huecos encontrados y qué se hizo

| # | Hueco | Acción |
|---|---|---|
| 1 | Los routers de clientes, materiales, inversores y terreno tenían entre 49 % y 67 % de cobertura: las reglas se probaban en los servicios, pero no la traducción de errores a códigos HTTP ni los permisos por operación | Nuevas `test_api_administracion` y `test_api_terreno` (12 pruebas); los cuatro routers quedan entre 95 % y 100 % |
| 2 | RNF-04 pedía cerrar la sesión tras 30 minutos de inactividad; el sistema solo vencía el token a las 8 horas | Cierre por inactividad en el frontend (`useCierrePorInactividad`), compartido entre pestañas, con aviso en el login; `inactividad.test.tsx` |
| 3 | El factor de bcrypt (RNF-04) no tenía prueba | `test_rnf04_bcrypt_con_factor_de_al_menos_10` |
| 4 | RNF-03 no tenía ninguna medición automatizada | Dos pruebas de tiempo del layout en `test_rnf` |
| 5 | RF-09 dice "precio mayor o igual a cero", pero la API rechazaba 0 (`gt=0`), y la logística (LOG) nace en $0 | La API y la pantalla de precios aceptan 0 (`ge=0`); `test_acepta_cero` |
| 6 | RF-04 lista DWG entre los formatos; ezdxf no lee DWG | Al principio se pedía exportarlo a DXF (PR #44, CC-09); desde el 23 de noviembre el DWG se convierte en el servidor con LibreDWG |
| 7 | RF-13 pide bocetos procesados y lotes despachados y recibidos | Bocetos procesados agregado al tablero; lotes despachados y recibidos con el módulo de validación |
| 8 | RF-07 y RF-14 a RF-16 sin implementar; sin pruebas de extremo a extremo | Todos implementados con sus pruebas; las de extremo a extremo, en el Sprint 7 |
| 9 | RF-08 pide buscar inversores por marca o modelo; la pantalla no tenía búsqueda | Búsqueda en el catálogo de inversores; `inversores-catalogo.test.tsx` |

---

## 5. Cómo mantener esta matriz

- Cada PR que agregue o cambie un requisito actualiza su fila.
- Al cerrar cada sprint se vuelven a contar las pruebas y la cobertura:

```bash
cd 02_codigo_fuente/backend && pytest --cov=app
cd ../calc-service && pytest --cov=app
cd ../ia-service && pytest --cov=app
cd ../frontend && npm test
```

- `pytest-cov` no está en `requirements.txt`; se instala aparte para medir
  (`pip install pytest-cov`).
