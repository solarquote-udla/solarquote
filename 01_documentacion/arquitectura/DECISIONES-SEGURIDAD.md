# Decisiones de seguridad

Registro de decisiones técnicas de seguridad, con su justificación y las
alternativas evaluadas. Material de respaldo para RF-11 y para la sección
de requerimientos no funcionales del documento capstone.

---

## DS-01 — Almacenamiento del token JWT en el cliente

**Fecha:** septiembre 2026
**Estado:** aceptada

### Contexto

El frontend necesita conservar el token JWT entre recargas de página para
no pedir credenciales en cada navegación.

### Alternativas evaluadas

| Opción | Ventaja | Desventaja |
|---|---|---|
| `localStorage` | Simple; funciona entre dominios distintos | Accesible desde JavaScript: vulnerable a XSS |
| Cookie `httpOnly` | Inaccesible desde JavaScript | Requiere CSRF; problemas con dominios cruzados |
| Token en memoria + refresh en cookie | Máxima seguridad | Complejidad alta; misma limitación de dominios |

### Decisión

Se almacena el token en `localStorage`.

### Justificación

El factor determinante es la arquitectura desplegada: el frontend reside en
**Vercel** y el backend en **Railway**, en dominios distintos. Una cookie
compartida entre ambos exige `SameSite=None; Secure`, configuración que los
navegadores restringen de forma creciente por las políticas contra cookies
de terceros. Además obligaría a implementar protección CSRF, que con
autenticación por cabecera `Authorization` no es necesaria.

El riesgo asociado a `localStorage` es el robo del token mediante XSS. Ese
riesgo no se elimina cambiando el lugar de almacenamiento: un atacante con
ejecución de JavaScript en la página puede realizar peticiones autenticadas
igual, aunque la cookie sea `httpOnly`. La mitigación efectiva es evitar la
vulnerabilidad XSS de origen.

### Mitigaciones aplicadas

1. **Escapado automático.** React escapa todo el contenido interpolado. El
   proyecto no utiliza `dangerouslySetInnerHTML` en ningún componente.
2. **Vigencia acotada.** El token expira a las 8 horas
   (`ACCESS_TOKEN_EXPIRE_MINUTES=480`), cubriendo una jornada laboral sin
   prolongar indefinidamente la ventana de exposición.
3. **Invalidación en el servidor.** La dependencia `get_usuario_actual`
   consulta el estado del usuario en cada petición: desactivar una cuenta
   revoca el acceso de inmediato, sin esperar a que expire el token.
4. **Verificación de dependencias.** `npm audit` se ejecuta en cada
   instalación; las vulnerabilidades de severidad alta se resuelven antes
   de desplegar.

### Consecuencias

- Si se detectara una vulnerabilidad XSS, el token quedaría comprometido
  hasta su expiración.
- Migrar a cookies `httpOnly` exigiría alojar frontend y backend bajo el
  mismo dominio, o configurar un subdominio compartido con un proxy inverso.

---

## DS-02 — Autorización en frontend y backend

**Fecha:** septiembre 2026
**Estado:** aceptada

### Decisión

El control de acceso por rol se aplica en **ambas capas**, con
responsabilidades distintas.

**Backend (`app/core/dependencies.py`)** — es la autorización real. La
dependencia `requiere_roles` rechaza con 403 cualquier petición cuyo rol no
corresponda, antes de ejecutar el endpoint.

**Frontend (`components/RutaProtegida.tsx`)** — es únicamente comodidad de
interfaz. Oculta del menú y bloquea la navegación hacia secciones que el rol
no puede usar.

### Justificación

El código del navegador es modificable por el usuario: cualquiera puede
alterar el JavaScript y forzar la navegación a una ruta restringida. Por
eso el frontend **no** constituye un control de seguridad. Su función es
evitar que el usuario llegue a pantallas que de todos modos recibirían un
403, lo que mejora la experiencia sin sustituir la verificación del
servidor.

---

## DS-03 — Hashing de contraseñas

**Fecha:** septiembre 2026
**Estado:** aceptada

### Decisión

Se usa **bcrypt** directamente (biblioteca `bcrypt`), sin `passlib`.

### Justificación

`passlib` 1.7.4 es incompatible con `bcrypt` 4.1 y superiores: intenta leer
un atributo de versión que fue eliminado, lo que produce un error en cada
operación de hashing. Utilizar `bcrypt` directamente elimina una capa de
abstracción innecesaria y una fuente de fallos.

bcrypt aplica un factor de trabajo deliberadamente costoso, lo que encarece
los ataques de fuerza bruta. El salt se genera por contraseña y queda
incluido en el propio hash.

### Limitación conocida

bcrypt trunca las contraseñas que superan los 72 bytes. El schema
`UsuarioCrear` impone `max_length=72`, de modo que el límite se comunica al
usuario en la validación en lugar de truncar la contraseña en silencio.

---

## DS-04 — Mensajes de error en el inicio de sesión

**Fecha:** septiembre 2026
**Estado:** aceptada

### Decisión

El endpoint de login devuelve el mismo mensaje —"Correo o contraseña
incorrectos"— tanto si el correo no existe como si la contraseña es errónea.

### Justificación

Distinguir ambos casos permitiría enumerar usuarios: un atacante podría
probar correos y determinar cuáles están registrados en el sistema, lo que
facilita ataques dirigidos de fuerza bruta o phishing.

---

## DS-05 — Autenticación entre servicios

**Fecha:** septiembre 2026 · implementada octubre 2026
**Estado:** aceptada

### Problema

`calc-service` no exige autenticación. Al desplegarlo en Railway queda
expuesto públicamente y cualquiera puede consumir el endpoint de cálculo.

### Impacto

Bajo: el servicio no accede a la base de datos ni expone información de
clientes; únicamente realiza operaciones aritméticas sobre los parámetros
recibidos. Aun así, permite consumo no autorizado de recursos.

### Decisión

Cabecera `X-Internal-Secret` con un secreto compartido entre el backend
principal y `calc-service`, validada por la dependencia
`requiere_secreto_compartido` (`app/core/dependencies.py` de calc-service)
en el router de cotización. El secreto vive en la variable de entorno
`CALC_SERVICE_SECRET`, con el mismo valor en el `.env` de los dos
servicios — sin default en ninguno de los dos, para que falte el secreto
tumbe el arranque en vez de dejar el endpoint sin protección.

### Por qué no protege `/health` ni `/`

El healthcheck de Railway (`railway.json` → `healthcheckPath`) y el
diagnóstico de la raíz los llama la plataforma sin ninguna cabecera
custom. Protegerlos tumbaría los despliegues. Solo el router
`/api/cotizacion` — el que de verdad expone cómputo — exige el secreto.

### Comparación con `==`

Se usa `hmac.compare_digest` en vez de `==` para comparar el secreto: una
comparación normal de strings corta en el primer carácter distinto, lo que
en teoría permite inferir el secreto midiendo el tiempo de respuesta
carácter por carácter (*timing attack*). `compare_digest` compara en
tiempo constante.

### Pendiente operativo

Configurar `CALC_SERVICE_SECRET` (mismo valor) en las variables de Railway
de los dos servicios antes de que este cambio llegue a producción.

**Responsable:** Esteban · **Sprint:** 2 (atrasado a Sprint 3 por el
alcance del sprint)
