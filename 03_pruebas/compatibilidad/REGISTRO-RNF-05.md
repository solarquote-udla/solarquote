# Registro de compatibilidad — RNF-05

Protocolo: [CHECKLIST-RNF-05.md](CHECKLIST-RNF-05.md).

| | |
|---|---|
| Fecha | 11 de noviembre de 2026 |
| URL probada | https://solarquote-hextructure.vercel.app (producción) |
| Commit / versión | `develop` en `95e4df1` (PR #70), el desplegado ese día |
| Quién probó | Joseph Flores |
| Datos | Cliente y proyectos de prueba (`RNF05 <navegador>`, terreno de 50 × 30 m), sin datos de clientes reales |

Versiones de los navegadores:

| Navegador | Versión |
|---|---|
| Google Chrome | 157.0.8103.40 (64 bits) |
| Mozilla Firefox | 159.0.1 (64 bits) |
| Microsoft Edge | 157.0.4341.46 (64 bits) |
| Celular | Navegador del celular, en lugar de Safari |

## Resultado por navegador

✅ igual que en Chrome · ⚠️ diferencia menor (ver observaciones) · ❌ no funciona · — no probado

| Flujo | Chrome | Firefox | Edge | Safari / celular | Observaciones |
|---|---|---|---|---|---|
| 1. Login | ✅ | ✅ | ✅ | ⚠️ | Con credenciales incorrectas los tres muestran "Correo o contraseña incorrectos" |
| 2. Generar el layout (RF-03) | ✅ | ✅ | ✅ | ⚠️ | Terreno de 50 × 30 m: 4 bloques de 4 × 24, 384 paneles, 222,7 kWp en los tres |
| 3. Cotización (RF-06) | ✅ | ✅ | ✅ | ⚠️ | |
| 4. Descargar proforma Word/Excel (RF-07) | ✅ | ✅ | ✅ | ⚠️ | |
| 5. Validación de materiales (RF-14 a RF-16) | ✅ | ✅ | ✅ | ⚠️ | Despacho y recepción registrados; la propuesta pasa a Despachada y Recibida. Se registró sin foto, así que no se ejercitó el conteo por IA (queda para SQ-201, con fotos reales) |

**Celular.** La aplicación funciona, pero las pantallas se ven
apretadas y algunos elementos no se alcanzan a ver. SolarQuote está
pensado para usarse en computador: el diseño de layouts, la
confirmación de bocetos y las tablas de materiales necesitan una
pantalla de escritorio. El uso en celular queda fuera del alcance.

**Safari.** No se probó: el equipo no tiene un Mac ni un iPhone a mano. El
celular se usó en su lugar, como prevé la checklist.

## Conclusión

RNF-05 **cumple en Chrome, Firefox y Edge de escritorio**: los cinco
flujos se completaron igual en los tres.

Queda pendiente probar **Safari en un Mac**, por ejemplo en un equipo de
la UDLA o de un compañero, con el mismo recorrido. En celular la
aplicación funciona con limitaciones de espacio y no es un caso de uso
del sistema.
