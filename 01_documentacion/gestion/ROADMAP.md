# Roadmap — 8 semanas hasta el 50%

**Objetivo:** al final de la semana 8, el flujo completo
`cliente → proyecto → layout → cotización → proforma` funciona **desplegado
y navegable**, no solo en local.

**Meta de alcance:** 11 de 16 RFs ≈ 69%

---

## Criterio de priorización

Se prioriza la **espina dorsal del sistema** sobre la cantidad de módulos.
Un sistema al 50% desplegado y navegable demuestra más que uno al 60% que
solo corre en una máquina.

**Dentro del alcance de estas 8 semanas:**

| RF | Descripción | Responsable |
|---|---|---|
| RF-01 | Terreno y caminos | Joseph |
| RF-02 | Panel e inversor | Joseph |
| RF-03 | Generación de layout solar | Joseph |
| RF-06 | Cálculo de materiales f(L,A,B) | Esteban |
| RF-07 | Generación de proforma Word/Excel | Esteban |
| RF-08 | Administración de inversores | Esteban |
| RF-09 | Administración de precios | Esteban |
| RF-10 | Historial de cotizaciones | Esteban |
| RF-11 | Seguridad / usuarios | ✅ hecho |
| RF-12 | Administración de clientes | Esteban |
| RF-13 | Tablero | Esteban |

**Fuera del alcance de estas 8 semanas (se retoman después):**

| RF | Descripción | Por qué se posterga |
|---|---|---|
| RF-04, RF-05 | Módulo Boceto (IA) | Alto riesgo técnico, bajo valor de demo por hora invertida |
| RF-14, RF-15, RF-16 | Módulo Validación (IA) | Depende de que exista Cotización funcionando |

---

## Semana 0 — Desbloqueo (1–2 días, ahora)

Antes de arrancar el Sprint 2:

- [ ] Joseph revisa y mergea PR #3 (calc-service)
- [ ] Joseph revisa y mergea PR #4 (Cotizacion, ItemCotizacion)
- [ ] Esteban rebasa el `down_revision` del PR #5 y se mergea
- [ ] **PR conjunto: modelos compartidos `Cliente` y `Proyecto`**
- [ ] Fix: ENUM huérfano en el `downgrade()` de la migración de usuarios

> **Regla acordada:** `Cliente` y `Proyecto` son modelos compartidos.
> Ninguno los modifica sin avisar al otro.

---

## Sprint 2 (semanas 1–2) — "Que se vea y que esté en línea"

El objetivo no es funcionalidad, es **infraestructura visible**.

### Joseph — Frontend base
- Proyecto React + Vite configurado
- React Router con rutas públicas y privadas
- Pantalla de login consumiendo `POST /api/auth/login`
- Cliente HTTP que adjunta el JWT automáticamente
- Guardado de sesión y logout
- Shell de la aplicación: sidebar, header, área de contenido
- Despliegue del frontend en Vercel

### Esteban — Cotización backend + despliegue
- Endpoint en el backend que orquesta: resuelve precios vigentes → llama a `calc-service` → guarda la `Cotizacion`
- Autenticación entre backend y calc-service (header con secreto compartido)
- IVA configurable, no hardcodeado
- Definir cómo entra `LOG` (logística) al total
- Despliegue de backend y calc-service en Railway

### ✅ Criterio de aceptación del sprint
Entrar a una URL pública, hacer login con un usuario real, y ver el shell
de la aplicación. El backend responde desde Railway, no desde localhost.

---

## Sprint 3 (semanas 3–4) — "CRUD y catálogos"

### Joseph — RF-01 y RF-02
- Modelo y endpoints de terreno (geometría, caminos)
- Modelo y endpoints de panel e inversor asociados al proyecto
- Pantallas de configuración de terreno y de selección de equipo
- Canvas básico con Konva.js mostrando el terreno dibujado

### Esteban — RF-08, RF-09, RF-12
- CRUD de inversores
- CRUD de precios (aprovechando el historial de `PrecioMaterial` ya hecho)
- CRUD de clientes
- Pantallas de administración para los tres

### ✅ Criterio de aceptación del sprint
Se puede crear un cliente, crear un proyecto para ese cliente, definir su
terreno con caminos, y elegir panel e inversor. Todo desde la interfaz.

---

## Sprint 4 (semanas 5–6) — "El corazón"

Este es el sprint de mayor riesgo. RF-03 es la pieza algorítmica más difícil
del proyecto.

### Joseph — RF-03 (generación de layout solar)
- Algoritmo que, dado el terreno y los caminos, distribuye bloques de paneles
- Validación de la proporción antisísmica (ancho = 3 × largo)
- Marcado en ámbar de los bloques fuera de proporción
- Visualización del layout generado en el canvas

> **Estrategia anti-riesgo:** empezar con terreno rectangular y extender
> después a geometría libre. Construir el algoritmo como función pura con
> tests antes de conectarlo a la interfaz — igual que hizo Esteban con
> `calcular_materiales`.

### Esteban — RF-06 y RF-07
- Pantalla de cotización que consume el cálculo
- Generación de proforma en Word (`python-docx`) y Excel (`openpyxl`)
- Descarga del archivo desde la interfaz

### ✅ Criterio de aceptación del sprint
Se genera un layout visible en pantalla, y se descarga una proforma
editable con los materiales calculados.

---

## Sprint 5 (semanas 7–8) — "Cerrar el circuito"

### Joseph — Integración layout → cotización
- Los bloques generados por el layout alimentan el cálculo f(L,A,B)
- Edición manual de bloques sobre el canvas

### Esteban — RF-10 y RF-13
- Historial de cotizaciones con filtros
- Tablero con indicadores

### Ambos
- Pruebas E2E del flujo completo
- Corrección de defectos
- Preparación de evidencias para el documento

### ✅ Criterio de aceptación del sprint
Un usuario entra, crea un cliente, arma un proyecto, genera el layout,
obtiene la cotización y descarga la proforma. Sin intervención manual
en la base de datos.

---

## Riesgos identificados

| Riesgo | Impacto | Mitigación |
|---|---|---|
| RF-03 (algoritmo de layout) toma más de 2 semanas | Alto | Empezar con terreno rectangular; función pura con tests antes de UI |
| Conflictos en modelos compartidos | Alto | PR conjunto en semana 0; nadie los toca sin avisar |
| Despliegue dejado para el final | Alto | Desplegar en Sprint 2, no en Sprint 5 |
| Railway ya no tiene plan gratuito | Medio | Presupuestar ~$5/mes por servicio, o evaluar alternativa |
| Módulos IA quedan sin empezar | Medio | Están fuera de alcance a propósito; se retoman en semana 9 |

---

## Costos de infraestructura

| Servicio | Plan | Costo aproximado |
|---|---|---|
| Vercel | Hobby | Gratis |
| Neon | Free | Gratis (0.5 GB) |
| Railway | Hobby | ~$5/mes por servicio |

Con backend + calc-service en Railway, calcular alrededor de **$10/mes**.
El `ia-service` se suma cuando se retomen los módulos de IA.

---

## Seguimiento

Al cierre de cada sprint:

1. Merge de `develop` → `main`
2. Despliegue de la versión estable
3. Revisión de lo cumplido contra el criterio de aceptación
4. Captura de evidencias (PRs, tablero, pruebas) para la sección 7.2
   del documento capstone
