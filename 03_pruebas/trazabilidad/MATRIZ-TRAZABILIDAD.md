# Matriz de trazabilidad requisitos → pruebas

Historia: SQ-135 · Corte: 26 de octubre de 2026 (con el documento de la
proforma y el módulo de validación de materiales) · Complementa la Tabla 44
del documento de titulación (sección 7.3).

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
| Backend (API principal) | 455 | 96 % | `pytest` en `02_codigo_fuente/backend` |
| calc-service | 32 | 100 % | `pytest` en `02_codigo_fuente/calc-service` |
| ia-service | 52 | 94 % | `pytest` en `02_codigo_fuente/ia-service` |
| Frontend (interfaz) | 171 | — | `npm test` en `02_codigo_fuente/frontend` |
| **Total** | **710** | | Las cuatro suites en cada PR (jobs `backend`, `calc-service`, `ia-service`, `frontend`) |

La cobertura se midió con `pytest --cov=app`. RNF-02 pide al menos 60 %
en el backend.

| Estado de los requisitos | Cantidad |
|---|---|
| Cubiertos por pruebas automatizadas | RF-01 a RF-16; RNF-01 (layout), RNF-02, RNF-03, RNF-04 |
| Implementación pendiente | Ninguna |
| Requieren verificación fuera del CI | RNF-01 (precisión con bocetos reales y del conteo de varillas con fotos reales), RNF-03 (boceto con IA y documento), RNF-05, RNF-06 |

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
| Solo con permiso | `test_api_terreno`: `test_terreno_exige_generar_layout` |

Evidencia: PR #1, #20, #34 y el PR de SQ-135.

### RF-02 Panel e inversor

| Regla del requisito | Pruebas |
|---|---|
| Área por panel y separación entre filas por trigonometría | `test_calculo_equipo`: `test_panel_clase_2278`, `test_caso_calculado_a_mano`, `test_ibarra`, `test_panel_plano_no_proyecta_sombra` |
| Límites de string floor(Vmax/Voc), ceil(Vmin/Vmp) | `test_calculo_equipo`: `test_caso_del_documento`, `test_division_exacta_no_pierde_un_panel`, `test_incompatible_cuando_el_rango_se_cruza` |
| Sugerencia de ~400 paneles por inversor | `test_calculo_equipo`: `test_regla_400`, `test_ejemplo_del_prototipo`, `test_potencia_exacta_no_suma_un_panel_por_redondeo`; paridad con `utils/inversores.ts` |
| Ángulo entre 0 y 90; Voc mayor que Vmp | `test_calculo_equipo`: `test_angulo_fuera_de_rango`, `test_voc_debe_superar_vmp` |
| Presets de paneles comunes | `test_calculo_equipo`: `test_cada_preset_pasa_las_validaciones`, `test_claves_unicas` |
| Varios inversores por proyecto | `test_varios_inversores` (17 pruebas); `inversores.test.tsx` |

Evidencia: PR #2 y #38.

### RF-03 Generación del layout

| Regla del requisito | Pruebas |
|---|---|
| Bloques L × A con ancho = 3 × largo; aviso de los que se apartan | `test_layout`: `test_a_ideal_para_l4`, `test_proporcion_del_bloque_ideal`, `test_bloque_real_de_emihana_pasa_con_20_por_ciento` |
| Respeta el polígono y los caminos | `test_layout`: `test_terreno_irregular_con_caminos_cruzados`, `test_camino_que_cubre_todo_el_terreno` |
| Separación por pasillo o sombra, la mayor | `test_layout`: `test_pasillo_configurable_se_respeta`, `test_la_sombra_reemplaza_al_pasillo_si_es_mayor`, `test_inclinacion_reduce_el_largo_en_planta` |
| Capacidad deseada opcional: cabe o se informa la máxima | `test_layout`: `test_capacidad_que_cabe_recorta_el_layout`, `test_capacidad_que_no_cabe_devuelve_la_maxima` |
| Validación eléctrica: strings y strings por MPPT | `test_layout`: `test_electrica_inversor_*` (6 pruebas) |
| Reparto de bloques entre inversores | `test_layout`: `test_dos_inversores_iguales_se_reparten_mitad_y_mitad`, `test_cada_inversor_recibe_un_sector_seguido`; `test_varios_inversores` |
| L par | `test_layout`: `test_l_impar_o_cero_se_rechaza` |
| Edición manual (SQ-64) | `test_layout_edicion` (23 pruebas), paridad con `utils/edicionLayout.ts`; `asistentePasos2y3.test.tsx` |

Evidencia: PR #14, #27, #34 y #38.

### RF-04 Carga y procesamiento del boceto

| Regla del requisito | Pruebas |
|---|---|
| Formatos PDF, JPG, PNG y DXF, detectados por contenido | `ia: test_endpoint_bocetos`: `test_el_formato_se_detecta_por_contenido_y_no_por_extension`, `test_formato_desconocido` |
| Tamaño máximo 10 MB; archivo vacío | `ia: test_endpoint_bocetos`: `test_archivo_demasiado_grande`, `test_archivo_vacio`; `test_boceto`: `test_archivo_vacio_o_demasiado_grande`; `bocetos.test.tsx` |
| DXF por geometría (ezdxf): L, A, B y orientación | `ia: test_dxf` (10 pruebas: rotación, bloques insertados, incompletos, L impar) |
| PDF e imagen con IA, respuesta validada | `ia: test_ia` (15 pruebas, API simulada) |
| Mensaje claro si no se puede procesar | `test_boceto`: `test_errores_de_ia_service_se_reenvian_con_su_mensaje`, `test_error_interno_de_ia_service_no_se_reenvia` |
| Resultado disponible para RF-05; reemplazo del anterior | `test_boceto`: `test_cargar_guarda_el_archivo_y_los_bloques`, `test_un_boceto_nuevo_reemplaza_al_anterior`, `test_dos_cargas_simultaneas_se_ordenan_y_gana_la_ultima` |
| Solo con permiso | `test_boceto`: `test_requiere_permiso_de_cargar_boceto` |

Evidencia: PR #44.

### RF-05 Confirmación y edición del diseño

| Regla del requisito | Pruebas |
|---|---|
| Diagrama con bloques y su estado de proporción | `confirmacion.test.tsx`, `bocetos.test.tsx` (confirmación del boceto) |
| Confirmación explícita antes de calcular | `test_confirmacion`: `test_bloques_fuera_de_proporcion_exigen_aceptarlos`; `test_boceto`: `test_fuera_de_proporcion_exige_aceptarlos` |
| Editar L, A, orientación y repeticiones; agregar y quitar | `test_boceto`: `test_editar_reemplaza_los_tipos_*`, `test_editar_valida_cada_tipo`; `bocetos.test.tsx`: orientación y agregar/quitar tipos |
| No se confirma un diseño desactualizado | `test_confirmacion`: `test_layout_desactualizado_no_se_cotiza` |
| Una cotización por proyecto | `test_confirmacion`: `test_un_proyecto_se_cotiza_una_sola_vez`; `test_boceto`: `test_cotizado_queda_congelado` |

Evidencia: PR #42 y #44.

### RF-06 Cálculo de materiales

| Regla del requisito | Pruebas |
|---|---|
| Las diez fórmulas f(L, A, B) | `calc: test_calculo_materiales` (13 pruebas, casos a mano y EMIHANA) |
| Varios ítems; total = suma | `calc: test_endpoint_cotizacion`; `test_confirmacion`: `test_items_del_layout_agrupa_bloques_iguales` |
| Addendum e IVA | `calc: test_endpoint_cotizacion`; `test_cotizacion_servicio`: `test_persiste_el_desglose_en_la_cotizacion` |
| L par | `calc: test_calculo_materiales` |
| Precios vigentes; material nuevo sin precio no bloquea | `test_cotizacion_servicio`: `test_lanza_si_falta_precio_vigente_*`, `test_un_material_nuevo_sin_precio_no_bloquea_la_cotizacion` |
| Comunicación segura con calc-service | `calc: test_autenticacion`; `test_calc_service` |

Evidencia: PR #5, #10 a #13, #16, #19, #28.

### RF-07 Documento de cotización

| Regla del requisito | Pruebas |
|---|---|
| Documento Word con el detalle de materiales | `test_proforma_documentos`: `test_word_incluye_cliente_materiales_y_totales` |
| Hoja de cálculo Excel con las mismas cantidades | `test_proforma_documentos`: `test_excel_incluye_cliente_materiales_y_totales` |
| Ambos con datos del cliente, subtotal, addendum, IVA y total | mismas pruebas; `test_word_sin_proforma_ni_datos_opcionales_no_falla` cubre los campos opcionales |
| El número de proforma se asigna al emitir | Ya cubierto (SQ-82): `test_confirmacion`: `siguiente_numero_proforma` |
| Los archivos se descargan desde la interfaz | `test_proforma_documentos`: `test_descarga_responde_el_archivo_con_su_tipo_y_nombre`; botón en `CotizacionDetallePage` (`cotizacion-detalle.test.tsx`) |
| Documento de cotización en menos de 10 s (RNF-03) | `test_rnf`: `test_rnf03_documento_de_cotizacion_en_menos_de_10_s` |

Evidencia: PR de SQ-79/SQ-80/SQ-81/SQ-83/SQ-84.

### RF-08 Lista de referencia de inversores

| Regla del requisito | Pruebas |
|---|---|
| Registrar, consultar, actualizar, dar de baja | `test_inversor_administracion` (25 pruebas); `test_api_administracion`: `test_inversor_ciclo_completo_y_errores` |
| Búsqueda por marca o modelo | `inversores-catalogo.test.tsx` |
| Vmax mayor que Vmin cuando se registran | `test_inversor_administracion`: `test_rechaza_vmax_menor_o_igual_que_vmin`; `test_api_administracion` (422) |
| Marca y modelo únicos | `test_api_administracion` (409) |
| Solo con permiso de parametrización | `test_api_administracion`: `test_inversores_por_permiso`; `test_seguridad`: `test_generar_layout_puede_leer_inversores_pero_no_administrarlos` |
| Selector en RF-02 | `inversores.test.tsx` |

Evidencia: PR #37 y el PR de SQ-135.

### RF-09 Materiales y precios

| Regla del requisito | Pruebas |
|---|---|
| Precio con fecha de vigencia e historial | `test_material_administracion`: `test_actualizar_precio_cierra_el_anterior_y_crea_uno_nuevo`, `test_historial_queda_ordenado_*`; `test_api_administracion`: `test_material_ciclo_completo` |
| Las cotizaciones emitidas conservan sus precios | `test_cotizacion_servicio`: `test_persiste_la_cantidad_y_precio_unitario_de_cada_material` |
| Los materiales de las fórmulas no se desactivan | `test_material_administracion`: `test_desactivar_un_codigo_de_formula_*`; `test_api_administracion` (409) |
| Precio mayor o igual a cero | `test_material_administracion`: `test_acepta_cero`, `test_rechaza_negativo`; `test_api_administracion` (422) |
| Precios y catálogo con permisos separados | `test_api_administracion`: `test_precios_y_materiales_por_permiso`; `test_seguridad`: `test_ver_materiales_no_permite_cambiar_precios` |

Evidencia: PR #23 a #25, #35 y el PR de SQ-135.

### RF-10 Historial de cotizaciones

| Regla del requisito | Pruebas |
|---|---|
| Listado filtrado por fechas, cliente, estado y proforma | `test_cotizacion_historial`: `test_filtra_por_rango_de_fechas_inclusive`, `test_filtra_por_estado`, `test_buscar_*` |
| Detalle con materiales, cantidades y L/A/B | `test_cotizacion_historial`: `test_obtener_cotizacion_trae_items_y_materiales`; `historial.test.tsx` |
| Solo con permiso | `test_seguridad`: `test_historial_lo_lee_quien_tiene_*`, `test_historial_no_lo_lee_cualquier_otro_permiso` |
| Descargar de nuevo el documento | `test_proforma_documentos`: `test_descarga_responde_el_archivo_con_su_tipo_y_nombre` |

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
| Registrar, consultar, actualizar, dar de baja | `test_cliente_servicio` (26 pruebas); `test_api_administracion`: `test_cliente_ciclo_completo` |
| Correo y teléfono con formato válido; cédula y RUC | `test_validaciones_identificacion` (21 pruebas), paridad con `utils/identificacion.ts`; `test_api_administracion`: `test_cliente_errores_traducidos` |
| La baja conserva las cotizaciones | `test_cliente_servicio`: `test_marca_inactivo`; `test_cotizacion_servicio`: `test_snapshot_del_cliente_viene_de_la_base_y_no_del_request` |
| Solo con permiso | `test_api_administracion`: `test_clientes_lectura_y_administracion_por_permiso` |

Evidencia: PR #17, #18, #22 y el PR de SQ-135.

### RF-13 Tablero de indicadores

| Regla del requisito | Pruebas |
|---|---|
| Número y monto de cotizaciones, kWp cotizados | `test_tablero`: `test_resumen_*` (4 pruebas) |
| Gráficos por período y por estado | `test_tablero`: `test_cotizaciones_por_periodo_*`, `test_cotizaciones_por_estado_*`; `tablero.test.tsx` |
| Rango de fechas válido | `test_tablero`: `test_desde_posterior_a_hasta_*`, `test_rango_de_mas_de_24_meses_*` |
| Solo con permiso | `test_seguridad`: `test_tablero_lo_lee_quien_tiene_*` |
| Bocetos procesados | `test_tablero`: `test_resumen_cuenta_los_bocetos_procesados_en_el_rango`; `tablero.test.tsx` |
| Lotes despachados y recibidos | `test_validacion`: `test_tablero_cuenta_lotes_despachados_y_recibidos`; `tablero.test.tsx` |

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
| | Detección de bloques ≥ 90 % en bocetos reales | DXF: `ia: test_dxf` con planos sintéticos de resultado conocido. PDF e imagen: medición con los bocetos reales de HEXtructure | Pendiente de medición |
| **RNF-02** Mantenibilidad | Cobertura del backend ≥ 60 % | `pytest --cov`: 96 % backend, 100 % calc-service, 93 % ia-service | Cumple |
| | Separación frontend, backend, base y documentación técnica | Arquitectura de servicios; `01_documentacion/arquitectura` | Cumple |
| **RNF-03** Desempeño | Layout con validación eléctrica y capacidad ≤ 15 s | `test_rnf`: terreno de 16 ha con caminos, 48 000 paneles y 70 inversores, directo y por la API (≈ 0,5 s) | Cumple |
| | Boceto procesado ≤ 30 s | DXF: `ia: test_dxf`: `test_planta_grande_en_tiempo_razonable` (< 3 s). PDF e imagen con IA: medición con la clave real | Parcial |
| | Documento de cotización ≤ 10 s | `test_rnf`: `test_rnf03_documento_de_cotizacion_en_menos_de_10_s` | Cumple |
| **RNF-04** Seguridad | 100 % de las funcionalidades autenticadas | `test_seguridad`: `test_ningun_endpoint_queda_abierto` | Cumple |
| | bcrypt con factor ≥ 10 | `test_rnf`: `test_rnf04_bcrypt_con_factor_de_al_menos_10` (factor 12) | Cumple |
| | Expiración tras 30 minutos de inactividad | `inactividad.test.tsx` | Cumple desde este corte |
| **RNF-05** Compatibilidad | Chrome, Firefox, Safari y Edge recientes | Revisión manual en cada navegador (etapa de pruebas de sistema) | Pendiente |
| **RNF-06** Fiabilidad | Disponibilidad ≥ 99 %, recuperación ≤ 5 min | Endpoints `/health` probados (`calc: test_health`, `test_cors`); medición con el monitoreo de Railway | Pendiente de medición |

---

## 4. Huecos encontrados y qué se hizo

| # | Hueco | Acción |
|---|---|---|
| 1 | Los routers de clientes, materiales, inversores y terreno tenían entre 49 % y 67 % de cobertura: las reglas se probaban en los servicios, pero no la traducción de errores a códigos HTTP ni los permisos por operación | Nuevas `test_api_administracion` y `test_api_terreno` (12 pruebas); los cuatro routers quedan entre 95 % y 100 % |
| 2 | RNF-04 pedía cerrar la sesión tras 30 minutos de inactividad; el sistema solo vencía el token a las 8 horas | Cierre por inactividad en el frontend (`useCierrePorInactividad`), compartido entre pestañas, con aviso en el login; `inactividad.test.tsx` |
| 3 | El factor de bcrypt (RNF-04) no tenía prueba | `test_rnf04_bcrypt_con_factor_de_al_menos_10` |
| 4 | RNF-03 no tenía ninguna medición automatizada | Dos pruebas de tiempo del layout en `test_rnf` |
| 5 | RF-09 dice "precio mayor o igual a cero", pero la API rechazaba 0 (`gt=0`), y la logística (LOG) nace en $0 | La API y la pantalla de precios aceptan 0 (`ge=0`); `test_acepta_cero` |
| 6 | RF-04 lista DWG entre los formatos; el sistema pide exportarlo a DXF porque ezdxf no lee DWG | Decisión de diseño (PR #44); el requisito se corrigió en la tesis (sección 2.1.3, control de cambios CC-09) |
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
