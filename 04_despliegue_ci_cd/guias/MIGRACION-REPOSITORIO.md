# Migración del repositorio

Procedimiento para trasladar SolarQuote a una organización de GitHub con la
estructura de entrega institucional.

---

## Por qué una organización

El repositorio anterior era personal. En ese modelo, los permisos de
colaborador son limitados y la revisión de pull requests no funciona de
forma confiable: fue justamente lo que impidió que Esteban pudiera aprobar
los cambios.

En una organización de GitHub:

- Los roles son explícitos y se aplican correctamente
- Las aprobaciones de pull request funcionan sin restricciones
- Las reglas de protección de ramas están completas
- El repositorio no depende de una cuenta personal

Las organizaciones son **gratuitas** con colaboradores ilimitados en
repositorios públicos.

---

## 1. Crear la organización

1. https://github.com/organizations/plan → **Free**
2. Configura:

| Campo | Valor |
|---|---|
| Organization name | `solarquote-udla` |
| Contact email | Tu correo |
| This organization belongs to | **My personal account** |

3. En la pantalla de invitación, agrega a **Estebin21**
4. Omite el resto del cuestionario

> Si el nombre está ocupado, prueba `hextructure-solarquote` o
> `solarquote-capstone`.

---

## 2. Crear el repositorio

Dentro de la organización: **New repository**

| Campo | Valor |
|---|---|
| Owner | `solarquote-udla` |
| Repository name | `solarquote` |
| Description | `Sistema de gestión y cotización de estructuras fotovoltaicas — HEXtructure S.A.S.` |
| Visibility | **Public** |
| Add README | ❌ No marcar |
| Add .gitignore | ❌ No marcar |
| Add license | ❌ None |

---

## 3. Dar permisos a Esteban

Aquí está la corrección al problema anterior.

**Settings** → **Collaborators and teams** → **Add people** → `Estebin21`

| Rol | Puede aprobar PRs | Puede administrar |
|---|---|---|
| Read | ❌ | ❌ |
| Triage | ❌ | ❌ |
| **Write** | ✅ | ❌ |
| **Maintain** | ✅ | Parcialmente |
| Admin | ✅ | ✅ |

Asigna **Write** como mínimo. Con `Read` o `Triage` no puede aprobar, que es
lo que ocurría antes.

> Verifica también que haya **aceptado la invitación** a la organización.
> Una invitación pendiente no otorga permisos.

---

## 4. Subir el proyecto

Desde la carpeta con la estructura nueva:

```bash
cd "<ruta>/solarquote"
```

```bash
git init
```

```bash
git config user.name "Joseph Flores"
git config user.email "josephaugustoflores@gmail.com"
```

```bash
git add .
```

Antes de commitear, **verifica que no se cuele nada sensible**:

```bash
git status
```

```powershell
git diff --cached --name-only | Select-String -Pattern "\.env$|venv/|node_modules"
```

No debe devolver nada.

```bash
git commit -m "chore: estructura inicial del proyecto con formato de entrega institucional"
```

```bash
git branch -M main
git remote add origin https://github.com/solarquote-udla/solarquote.git
git push -u origin main
```

```bash
git checkout -b develop
git push -u origin develop
```

---

## 5. Proteger las ramas

**Settings** → **Rules** → **Rulesets** → **New branch ruleset**

### Regla para `develop`

| Campo | Valor |
|---|---|
| Ruleset Name | `proteger-develop` |
| Enforcement status | **Active** |
| Target branches | Add target → Include by pattern → `develop` |

Marcar:
- ✅ Restrict deletions
- ✅ Require a pull request before merging → Required approvals: **1**
- ✅ Block force pushes

### Regla para `main`

Idéntica, con nombre `proteger-main` y patrón `main`.

> **Bypass list:** déjala vacía. Si incluye "Repository admin", podrás
> saltarte tu propia regla sin darte cuenta.

### Rama por defecto

**Settings** → **General** → **Default branch** → `develop`

Así los pull requests apuntan a `develop` automáticamente.

---

## 6. Reconfigurar Railway

Los servicios existentes apuntan al repositorio anterior y a rutas que
cambiaron. Hay que actualizar ambas cosas.

Por cada servicio: **Settings** → **Source**

| Servicio | Repositorio | Root Directory | Branch |
|---|---|---|---|
| `solarquote-backend` | `solarquote-udla/solarquote` | `02_codigo_fuente/backend` | `develop` |
| `solarquote-calc` | `solarquote-udla/solarquote` | `02_codigo_fuente/calc-service` | `develop` |

> Railway pedirá autorizar el acceso a la organización. Acepta cuando lo
> solicite.

**Las variables de entorno se conservan.** No hay que volver a cargar
`DATABASE_URL` ni `SECRET_KEY`.

---

## 7. Reconfigurar Vercel

**Settings** → **Git** → **Disconnect** → conectar el repositorio nuevo.

| Campo | Valor |
|---|---|
| Repository | `solarquote-udla/solarquote` |
| Root Directory | `02_codigo_fuente/frontend` |
| Production Branch | `develop` |

`VITE_API_URL` se conserva.

> Si Vercel no ve la organización: **Settings** → **Git** →
> **Manage GitHub App Permissions** y concede acceso a la organización.

---

## 8. Archivar el repositorio anterior

En `NotGuatas/solarquote`: **Settings** → **General** → baja hasta
**Danger Zone** → **Archive this repository**

Queda en solo lectura, conservando commits y pull requests como respaldo.
No se puede confundir con el repositorio activo porque GitHub lo marca
visiblemente como archivado.

---

## Verificación final

- [ ] Organización creada y Esteban la aceptó
- [ ] Repositorio creado dentro de la organización
- [ ] Esteban con rol **Write** confirmado
- [ ] Código subido a `main` y `develop`
- [ ] Ramas protegidas con 1 aprobación requerida
- [ ] `develop` como rama por defecto
- [ ] Railway desplegando desde las rutas nuevas
- [ ] Vercel desplegando desde la ruta nueva
- [ ] `/health/db` responde en producción
- [ ] El login funciona desde la URL de Vercel
- [ ] Repositorio anterior archivado

---

## Prueba del flujo de revisión

Antes de dar por cerrada la migración, comprueba que el problema original
quedó resuelto:

1. Crea una rama cualquiera y abre un pull request hacia `develop`
2. Pídele a Esteban que lo apruebe
3. Confirma que el botón de merge se habilita tras su aprobación

Si sigue sin poder aprobar, revisa que su rol sea **Write** y que haya
aceptado la invitación a la organización.
