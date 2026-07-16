# M3 — Validación de datos: Reporte de Hallazgos

**Fecha:** 2026-07-16  
**Rama:** `feat/qa-03-validacion`  
**Auditor:** au.md v2.0

## Resumen Ejecutivo

Se auditó la capa de validación de datos enfocándose en **mass assignment** y **validación de URLs**. Se confirmaron **2 findings reales** y se aplicaron fixes. Todos los tests pasan sin regresiones.

## Findings Confirmados

### VAL-CLIENTE-MASS-ASSIGNMENT
- **Archivo:** `src/lib/validators.ts`, `src/app/api/clientes/[id]/route.ts`
- **Problema:** `ClienteUpdateSchema = ClienteCreateSchema.partial()` permitía actualizar campos internos/controlados (`verificado`, `bloqueado`, `offlineId`) vía `PUT /api/clientes/[id]`.
- **Impacto:** Un ASISTENTE podía marcar clientes como verificados/bloqueados o corromper `offlineId`.
- **Fix:** Reemplazar por `ClienteCreateSchema.omit({ verificado, bloqueado, offlineId }).partial().extend({ activo, updatedAt }).strict()`.
- **Test:** `e2e/qa/03-validacion/cliente-mass-assignment.spec.ts`

### VAL-NEGOCIO-LINK
- **Archivo:** `src/app/api/negocios/route.ts`
- **Problema:** `linkUbicacion: z.string().url()` aceptaba URLs con scheme `javascript:`, `data:`, etc.
- **Impacto:** Stored XSS potencial (aunque React 19 lo bloquea en renderizado).
- **Fix:** Reutilizar `SafeUrlSchema` exportado desde `src/lib/validators.ts`, que solo permite `http:` / `https:`.
- **Test:** `e2e/qa/03-validacion/negocio-link-ubicacion.spec.ts`

## Archivos Modificados

- `src/lib/validators.ts` — `SafeUrlSchema` exportado; `ClienteUpdateSchema` restringido.
- `src/app/api/negocios/route.ts` — usa `SafeUrlSchema` para `linkUbicacion`.

## Tests Añadidos

- `e2e/qa/03-validacion/cliente-mass-assignment.spec.ts` — 3 tests.
- `e2e/qa/03-validacion/negocio-link-ubicacion.spec.ts` — 1 test.

## Resultados de Ejecución

```bash
npx playwright test e2e/qa/03-validacion --project=chromium
  4 passed (0 failed) ✅

npm run test
  1983 passed (0 failed) ✅

npx playwright test e2e/qa/02-rbac --project=chromium
  11 passed (0 failed) ✅
```

## Cómo Ejecutar

```bash
npx playwright test e2e/qa/03-validacion --project=chromium --workers=1
```
