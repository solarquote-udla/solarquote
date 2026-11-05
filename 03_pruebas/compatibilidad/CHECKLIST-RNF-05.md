# Checklist de compatibilidad — RNF-05

RNF-05 exige que el sistema funcione igual en Chrome, Firefox, Edge y
Safari. Esta checklist recorre el flujo completo del Gerente General
sobre la URL pública de producción en cada navegador, y deja el
resultado registrado en [REGISTRO-RNF-05.md](REGISTRO-RNF-05.md).

> Chrome es el navegador de referencia: es con el que se desarrolla y
> prueba el frontend día a día. Esta checklist existe para confirmar que
> **los otros tres no se quedan atrás**, no para descubrir cómo se ve el
> sistema por primera vez.

## Flujos a recorrer, en este orden

Con un usuario Gerente General de prueba (no uno real de HEXtructure):

1. **Login** — correo y contraseña; mensaje de error claro con credenciales
   incorrectas.
2. **Generar el layout solar** (RF-03) — un terreno simple basta: definir
   terreno, panel e inversor, generar y confirmar el layout.
3. **Calcular y guardar una cotización** (RF-06) a partir de ese layout.
4. **Descargar la proforma** en Word y en Excel (RF-07) desde el detalle
   de la cotización.
5. **Validación de materiales** (RF-14 a RF-16): registrar un despacho con
   el conteo de varillas y su recepción.

No hace falta repetir los cinco flujos completos si uno falla antes de
tiempo — anota dónde se detuvo y sigue con el siguiente navegador; no
tiene sentido medir los flujos 2 a 5 si el login ya falló.

## Navegadores

| Navegador | Qué versión probar |
|---|---|
| Chrome | la más reciente estable |
| Firefox | la más reciente estable |
| Edge | la más reciente estable |
| Safari, o si no hay Mac/iPhone a mano, el navegador del celular (Chrome o Safari móvil) | la más reciente disponible |

## Qué marcar por cada casilla

- ✅ **Igual que en Chrome.** Sin diferencia visible ni funcional.
- ⚠️ **Funciona, con una diferencia menor** (un estilo que se ve distinto,
  un desfase de unos píxeles). Anota cuál en la columna de observaciones.
- ❌ **No funciona** — el flujo no se puede completar. Anota el error
  exacto y, si se puede, lo que muestra la consola del navegador
  (F12 → Console).

## Capturas

Una captura por cada ⚠️ o ❌, guardada en `capturas/<navegador>/<flujo>.png`
(por ejemplo `capturas/firefox/descarga-proforma.png`). Esa carpeta está
excluida de git (ver `.gitignore` de aquí mismo): una cotización de
prueba hecha con datos reales de un cliente no debe quedar en capturas
versionadas. Usa un cliente y un proyecto de demostración, no uno real.

## Dónde probar

La URL de producción (`04_despliegue_ci_cd/README.md` tiene el dominio
actual). Si production todavía no tiene un usuario de prueba, pide uno al
Gerente General del equipo o créalo con `python -m scripts.crear_admin`
contra la base de desarrollo y prueba ahí — lo que importa es el
navegador, no contra qué base corre.
