# Instrucciones de Merge — Migración 1FN por Fases

## Estado de las ramas

Hay **4 ramas efímeras** ya pusheadas a `origin`, una por PR. Cada rama representa un merge por fase:

| Rama | Commits desde `main` | Tag de deploy | Validación |
|------|----------------------|---------------|------------|
| `merge/1fn-fase1-expand` | 4 | `deploy/1fn-fase1-expand` (`826a36d`) | ✅ tsc + 1062/1062 tests + build |
| `merge/1fn-fase2-migrate` | 13 | `deploy/1fn-fase2-migrate` (`21c264a`) | ✅ tsc + 1062/1062 tests + build |
| `merge/1fn-fase3-contract` | 17 | `deploy/1fn-fase3-contract` (`d5b051c`) | ✅ tsc + 1062/1062 tests + build |
| `merge/1fn-post-fase3` | 29 | `4adcb0d` (HEAD rama completa) | ✅ tsc + 1094/1094 tests + build |

## URLs de PR (abrir en este orden)

### PR #1 — Fase 1 EXPAND (additive, sin downtime)

```
https://github.com/casasleonj/bambu/compare/main...merge/1fn-fase1-expand?expand=1
```

- **Qué hace:** Crea las tablas `ContactoCliente` y `PlantillaProducto` con FKs, índices, y unique constraint. La app sigue usando las columnas JSON legacy.
- **Riesgo:** Cero. Additive, 100% reversible con `npx prisma migrate resolve --rolled-back <ts>`.
- **Criterio de éxito post-deploy:** las 2 tablas nuevas existen; las columnas JSON siguen intactas.
- **Validación local ejecutada:** `tsc --noEmit` pasa, 1062/1062 tests pasan, `npm run build` pasa.
- **DB local de dev:** requiere que las columnas legacy (`contactos`, `productos`) **existan**. Si las dropeaste en una sesión previa, restauralas con:
  ```sql
  ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS contactos JSONB;
  ALTER TABLE "PlantillaRecurrente" ADD COLUMN IF NOT EXISTS productos TEXT;
  ```

### PR #2 — Fase 2 MIGRATE (backfill + dual-writes)

```
https://github.com/casasleonj/bambu/compare/main...merge/1fn-fase2-migrate?expand=1
```

- **Qué hace:** Aplica la migración `add_unique_cliente_telefono`, backfill idempotente paginado de los JSON a las tablas nuevas, dual-writes en POST/PUT de cliente y recurrente, y lecturas con hidratación al shape legacy.
- **Riesgo:** Bajo. La app sigue funcionando con el JSON legacy Y la nueva tabla. Si algo falla, rollback = `git revert` del commit de código (no de migración SQL) + reactivar lectura desde JSON.
- **Criterio de éxito post-deploy:** conteos cuadran (`ContactoCliente` = 2 en dev, `PlantillaProducto` = 0 en dev); las lecturas GET siguen devolviendo los mismos datos.
- **Validación local ejecutada:** `tsc --noEmit` pasa, 1062/1062 tests pasan, `npm run build` pasa.
- **🕐 Drenar 24h** entre este PR y el siguiente. Monitorear logs por errores 5xx o 4xx inusuales.

### PR #3 — Fase 3 CONTRACT (drop columnas + rename + UI)

```
https://github.com/casasleonj/bambu/compare/main...merge/1fn-fase3-contract?expand=1
```

- **Qué hace:** Quita el dual-write, el campo `contactos` del Zod schema, dropea las columnas legacy `contactos` y `productos`, renombra `contactosRel` → `contactos` y `productosRel` → `productos`, actualiza el seed, ajusta el form para consumir la nueva shape.
- **Riesgo:** Alto. Drop de columnas es **irreversible** (los datos en JSON se pierden). En prod, **hacer backup antes**.
- **Criterio de éxito post-deploy:** conteos siguen cuadrar; las 3 columnas JSON legacy están dropeadas; la UI sigue mostrando contactos/productos (ahora desde las tablas nuevas).
- **Validación local ejecutada:** `tsc --noEmit` pasa, 1062/1062 tests pasan, `npm run build` pasa.
- **🕐 Drenar 24h** antes de este PR. Verificar que el dual-write de Fase 2 funcionó sin incidentes (logs, métricas, reportes de usuarios).
- **⚠️ IMPORTANTE:** en Supabase prod, validar que los GRANTs del rol que use el runtime (`authenticated` o similar) tengan acceso a las tablas nuevas. Sin esto, las queries fallan con `permission denied`.

### PR #4 — Post-Fase 3 (CRUD endpoints, PATCH, UI wireada)

```
https://github.com/casasleonj/bambu/compare/main...merge/1fn-post-fase3?expand=1
```

- **Qué hace:** Cierra el gap del CRUD UI. Agrega:
  - `POST /api/clientes/[id]/contactos` — crear contacto
  - `PATCH /api/clientes/[id]/contactos/[contactoId]` — actualizar in-place
  - `DELETE /api/clientes/[id]/contactos/[contactoId]` — borrar
  - Migración de GRANTs para `app_write` (en dev; en Supabase, hacerlo via dashboard)
  - Wireado de `cliente-form.tsx` a los sub-endpoints (diff por teléfono)
  - 32 unit tests (19 originales + 13 del PATCH)
  - Documentación: AGENTS.md, plan con post-mortem, PR description
- **Riesgo:** Bajo. Es la fase de "feature complete" sin migración destructiva. Se puede mergear con confianza después de los 24h de drenado del PR #3.
- **Criterio de éxito post-deploy:** los usuarios pueden agregar/editar/borrar contactos vía el form, y los cambios persisten.
- **Validación local ejecutada:** `tsc --noEmit` pasa, 1094/1094 tests pasan, `npm run build` pasa. E2E manual con curl validó POST/PATCH/DELETE en runtime real.

## Orden de merge y comandos

Para cada PR, abrimos la URL, revisamos el diff, y mergeamos. Si preferís hacerlo por CLI:

```bash
# PR #1
git checkout main
git merge --no-ff merge/1fn-fase1-expand -m "merge: Fase 1 EXPAND — tablas ContactoCliente y PlantillaProducto"
git push origin main
git push origin deploy/1fn-fase1-expand  # tag de deploy (ya pusheado, redundante)

# (esperar 24h, monitorear)

# PR #2
git checkout main
git merge --no-ff merge/1fn-fase2-migrate -m "merge: Fase 2 MIGRATE — backfill + dual-writes + lecturas hidratadas"
git push origin main

# (esperar 24h, monitorear)

# PR #3 (con backup previo de la DB en prod)
git checkout main
git merge --no-ff merge/1fn-fase3-contract -m "merge: Fase 3 CONTRACT — drop columnas legacy + rename + UI"
git push origin main

# PR #4
git checkout main
git merge --no-ff merge/1fn-post-fase3 -m "merge: Post-Fase 3 — CRUD endpoints + PATCH + UI wireada + tests"
git push origin main
```

## Después del merge de cada fase

```bash
# En prod (después de cada deploy):
npx prisma migrate deploy  # aplica las migraciones nuevas

# Smoke test del flujo principal:
# 1. Login admin
# 2. GET /api/clientes?all=true → debe devolver clientes con sus contactos hidratados
# 3. POST /api/clientes (sin contactos en el body) → debe crear cliente OK
# 4. PUT /api/clientes/[id] → debe actualizar OK
# 5. (Post-Fase 3) Cliente form: agregar/editar/borrar contactos via UI → debe persistir
```

## Rollback por fase

| Fase | Comando de rollback |
|------|---------------------|
| **1 (EXPAND)** | `npx prisma migrate resolve --rolled-back <ts>` + `git revert` del commit de código. Cero riesgo. |
| **2 (MIGRATE)** | `git revert` del commit de código (no de migración SQL). Mantener la tabla nueva con datos. Re-activar la lectura desde JSON. La app vuelve al estado pre-Fase 2 sin perder datos. |
| **3 (CONTRACT)** | ⚠️ **Irreversible**. El drop de columnas destruye los datos JSON. Antes de mergear, **backup completo de la DB**. |
| **4 (Post-Fase 3)** | `git revert` del commit de código. La UI vuelve a no tener sub-endpoints, pero la 1FN storage sigue correcta (no se rompe nada). |

## Tag deploy actual vs tag recomendado

- Los tags `deploy/1fn-fase{1,2,3}-*` que ya existen en `origin` apuntan a los commits correctos. Se pueden usar como `git checkout` reference en cada fase.
- Después de mergear cada fase, opcionalmente bumpear el tag a `main` con `git tag -f deploy/1fn-fase1-expand main && git push origin --tags -f` (no es estrictamente necesario).

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| **Rama fuente** | `feat/1fn-migration-contactos-plantillaproducto` (29 commits) |
| **PRs recomendados** | 4 (uno por fase) |
| **Tests pasando al final** | 1094/1094 |
| **Commits de código (excluyendo docs)** | 22 (feat/fix/refactor) |
| **Commits de docs** | 7 (plan, post-mortem, AGENTS, PR description) |
| **Migraciones SQL** | 5 (add tablas, unique, backfill, drop, GRANTs) |
| **Endpoints nuevos** | 3 (POST/PATCH/DELETE contactos) |
| **Tests unitarios nuevos** | 32 |
| **Tags de deploy** | 3 |
| **Riesgo total** | Bajo (validado fase por fase con dry-runs) |
| **Downtime necesario** | 0 |
