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

**Fecha:** septiembre 2026 · actualizada octubre 2026 (permisos, DS-06)
**Estado:** aceptada

### Decisión

El control de acceso se aplica en **ambas capas**, con responsabilidades
distintas.

**Backend (`app/core/dependencies.py`)** — es la autorización real. Cada
endpoint declara el permiso que exige con `requiere_permiso(...)`, que
rechaza con 403 antes de ejecutar el endpoint si el perfil del usuario no
lo tiene. Una prueba recorre todas las rutas de la API y verifica que
ninguna responde sin token, y que un perfil sin permisos recibe 403 en
todas (`tests/test_seguridad.py`).

**Frontend (`components/RutaProtegida.tsx`, `components/menu.ts`)** — es
únicamente comodidad de interfaz. Oculta del menú y bloquea la navegación
hacia las opciones que el perfil no puede usar.

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

bcrypt aplica un factor de trabajo deliberadamente costoso (factor 12, el
predeterminado: 2¹² rondas, del orden de 0,2 s por verificación), lo que
encarece los ataques de fuerza bruta. El salt se genera por contraseña y
queda incluido en el propio hash, así que dos usuarios con la misma
contraseña tienen hashes distintos. La base de datos nunca guarda la
contraseña ni nada reversible: si se filtrara la tabla `usuarios`, habría
que atacar cada hash por separado.

### Limitación conocida

bcrypt trunca las contraseñas que superan los 72 bytes. La política de
contraseñas (DS-07) rechaza las que superan ese límite, de modo que se
comunica al usuario en la validación en lugar de truncar la contraseña en
silencio.

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

### Ampliación (octubre 2026)

- **Mismo tiempo de respuesta.** Si el correo no existe, el servicio
  verifica igual la contraseña contra un hash señuelo
  (`verificar_password_señuelo`). Sin esto, la respuesta para un correo
  inexistente llegaría ~0,2 s antes y delataría qué correos existen.
- **Mismas sentencias en la base.** Con contraseña incorrecta se guarda
  el intento fallido (UPDATE + COMMIT), y con Neon cada viaje a la base
  suma milisegundos medibles. Por eso, si el correo no existe, se ejecuta
  la misma sentencia `UPDATE ... RETURNING` sobre un id inexistente, y la
  búsqueda del usuario no carga su perfil (una consulta, exista o no).
  Una prueba compara las sentencias de ambos casos y exige que sean
  idénticas. Hallazgo de la revisión del PR #31.
- **Cuenta desactivada.** Solo se informa "La cuenta está desactivada"
  (403) si la contraseña es correcta; con una contraseña incorrecta la
  respuesta es la genérica.

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

---

## DS-06 — Perfiles con permisos por opción de menú

**Fecha:** octubre 2026
**Estado:** aceptada (reemplaza los dos roles fijos)

### Contexto

En la revisión con el tutor se pidió que la seguridad funcione por
perfiles: cada perfil tiene permisos sobre las opciones del menú, cada
usuario tiene un perfil, y el menú muestra solo lo que su perfil permite.
Hasta ahora el usuario tenía un rol fijo (`gerente_general` o
`personal_produccion`).

### Decisión

Modelo híbrido:

| Perfil | Tipo | Permisos | ¿Se edita? | ¿Se elimina? |
|---|---|---|---|---|
| Gerente General | Sistema | Acceso total (incluye permisos futuros) | No | No |
| Personal de Producción | Sistema | Despacho y Recepción, ajustables | Solo permisos y descripción | No |
| Personalizados | Creados por el administrador | Los que se marquen | Sí | Sí, si no tiene usuarios |

Un permiso por opción del menú del prototipo (`app/core/permisos.py`):

| Grupo | Permisos |
|---|---|
| CÁLCULO | `generar_layout`, `cargar_boceto`, `historial` |
| OPERACIONES | `despacho`, `recepcion`, `clientes` |
| CONFIGURACIÓN | `inversores`, `materiales`, `precios`, `perfiles`, `usuarios` |

El Dashboard no es un permiso: lo ve todo usuario autenticado.

Los permisos se guardan como texto en `perfil_permisos`, no como ENUM de
Postgres: agregar una opción al menú no exige una migración que altere un
tipo. La API valida los códigos contra el catálogo.

### Permiso que exige cada endpoint

| Endpoints | Leer | Modificar |
|---|---|---|
| `/api/proyectos` | `generar_layout`, `cargar_boceto` o `historial` | `generar_layout` o `cargar_boceto` |
| Terreno, equipo y layout del proyecto | `generar_layout` | `generar_layout` |
| `/api/cotizacion` | — | `generar_layout` o `cargar_boceto` |
| `/api/clientes` | `clientes`, `generar_layout` o `cargar_boceto` (el alta de proyectos elige un cliente) | `clientes` |
| `/api/materiales` | `materiales` o `precios` | precio: `precios` |
| `/api/perfiles`, `/api/permisos` | `perfiles` o `usuarios` (el alta de usuarios elige un perfil) | `perfiles` |
| `/api/usuarios` | `usuarios` | `usuarios` |

### Reglas que evitan quedarse sin administrador o escalar privilegios

1. Solo un usuario con acceso total puede crear, modificar o restablecer
   la contraseña de un Gerente General, o asignar ese perfil.
2. Nadie cambia su propio perfil ni desactiva su propia cuenta.
3. **Nadie se otorga más de lo que tiene** (para quien no tiene acceso
   total):
   - no modifica su propio perfil;
   - no agrega a un perfil permisos que su perfil no tiene (quitarlos sí
     puede);
   - no asigna a un usuario un perfil con permisos que él no tiene, ni
     modifica o restablece la contraseña de un usuario cuyo perfil tiene
     permisos que él no tiene (sería tomar una cuenta con más acceso).
4. Siempre queda al menos un Gerente General activo. El conteo bloquea
   las filas de los gerentes (`SELECT ... FOR UPDATE`): si A desactiva a
   B mientras B desactiva a A, la segunda operación espera a la primera
   y se rechaza.
5. Los usuarios no se eliminan: se desactivan (baja lógica), porque
   proyectos y cotizaciones los referencian.

Las reglas 3 y 4 se agregaron tras la revisión del PR #31 (Esteban): sin
la regla 3, quien tuviera el permiso `perfiles` podía editar su propio
perfil y agregarse todo el catálogo; sin el bloqueo de la regla 4, dos
desactivaciones simultáneas podían dejar al sistema sin ningún gerente.
Cada caso tiene su prueba en `tests/test_seguridad.py`, incluida una con
dos transacciones concurrentes reales.

### Cambios de permisos

El token no lleva el perfil ni los permisos: se leen de la base en cada
petición. Un cambio de permisos aplica en la siguiente petición del
usuario, sin que tenga que volver a iniciar sesión.

### Migración

`9c1e4b7a2d50` crea los dos perfiles del sistema y asigna a cada usuario
existente el que corresponde a su rol. El `downgrade` devuelve un rol a
cada usuario: Gerente General si su perfil tiene acceso total, Personal de
Producción en cualquier otro caso (el menor privilegio).

---

## DS-07 — Contraseñas temporales y política de contraseñas

**Fecha:** octubre 2026
**Estado:** aceptada

### Decisión

- El administrador crea al usuario con una **contraseña temporal** y se
  la comunica por un canal aparte. El usuario queda en estado
  **pendiente** (`debe_cambiar_password`).
- Mientras esté pendiente, el usuario puede iniciar sesión, pero el
  backend le niega todo salvo `GET /api/auth/yo` y
  `POST /api/auth/cambiar-password` (403 con un mensaje que el frontend
  reconoce para llevarlo a la pantalla de cambio).
- **"¿Olvidaste tu contraseña?"** no envía correos: el usuario contacta al
  administrador, que le asigna una nueva contraseña temporal desde
  Usuarios. Restablecerla también desbloquea la cuenta (DS-08).
- **Política:** mínimo 8 caracteres, al menos una letra y un número, sin
  espacios al inicio o al final, máximo 72 bytes (límite de bcrypt). La
  nueva contraseña debe ser distinta de la actual.

### Justificación

Que el administrador conozca la contraseña definitiva de otra persona
rompe la responsabilidad individual: cualquier acción podría atribuirse a
cualquiera de los dos. Con la temporal, solo el usuario conoce su
contraseña definitiva.

El restablecimiento por correo exige un servicio de correo, tokens de un
solo uso y su expiración. Para un equipo de pocas personas en una misma
empresa, el restablecimiento por el administrador cubre la necesidad con
menos superficie de ataque.

---

## DS-08 — Bloqueo temporal por intentos fallidos

**Fecha:** octubre 2026
**Estado:** aceptada

### Decisión

Tras **5** contraseñas incorrectas seguidas, la cuenta se bloquea
**15 minutos** (`MAX_INTENTOS_LOGIN`, `MINUTOS_BLOQUEO_LOGIN`,
configurables). Durante el bloqueo, el login responde 429 sin verificar la
contraseña, así que seguir probando no sirve de nada. Un login correcto
reinicia el contador.

### Compromiso conocido

El mensaje de bloqueo revela que el correo existe, pero solo después de
cinco intentos sobre esa cuenta, y no ayuda a adivinar la contraseña. Se
prefirió decirle al usuario legítimo por qué no puede entrar.

Un atacante podría bloquear a propósito la cuenta de otro (denegación de
servicio). El bloqueo es temporal y el administrador lo levanta al
restablecer la contraseña.

---

## DS-09 — Invalidación de tokens emitidos

**Fecha:** octubre 2026
**Estado:** aceptada

### Problema

Un JWT es válido hasta que expira (8 horas). Si un usuario cambia su
contraseña porque sospecha que alguien la conoce, las sesiones que ese
alguien ya abrió seguirían activas.

### Decisión

Cada usuario tiene un `version_token` que viaja dentro del JWT (`ver`). Se
incrementa al cambiar la contraseña, al restablecerla y al desactivar la
cuenta. `get_usuario_actual` compara la versión del token con la del
usuario en cada petición: si no coinciden, responde 401. Cambiar la
contraseña entrega un token nuevo, así que la sesión del propio usuario
sigue abierta.
