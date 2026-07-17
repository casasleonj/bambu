# M2 — RBAC & Seguridad: Reporte de Hallazgos

**Fecha:** 2026-07-15  
**Rama:** `feat/qa-02-rbac`  
**Auditor:** au.md v2.0

## Resumen Ejecutivo

Se verificaron 9 findings de RBAC/seguridad reportados en la exploración inicial. De ellos, **5 se confirmaron como bugs reales**, 4 fueron falsos positivos (el código ya tenía role checks o permisos). Además se identificó **1 nuevo finding de XSS** no reportado en la exploración inicial.

## Estado de los Findings

| ID | Descripción original | Estado | Notas |
|---|---|---|---|
| #1 | `/api/trabajadores` POST/PUT/DELETE sin role check | FALSO | Ya requiere `ADMIN` |
| #2 | `/api/produccion/[id]` GET sin role check | FALSO/PARCIAL | `[id]` no existe; el listado `GET /api/produccion` sí solo requiere auth |
| #3 | `/api/facturas/[id]` GET sin role check | CONFIRMADO | Solo `requireAuth()` |
| #4 | `/api/clientes/[id]` GET sin role check | CONFIRMADO | Solo `requireAuth()` |
| #5 | `/api/trabajadores` GET y `[id]` GET sin role check | CONFIRMADO | PII leak |
| #6 | `DescuentoRepartidor.motivo` unvalidated | PENDIENTE | No se encontró endpoint de persistencia en esta ronda |
| #7 | `EMPACADOR/ENTUBADOR` redirect loop | PENDIENTE | Falta reproducir con worker real |
| #8 | `__PLAYWRIGHT_TEST__` branches in production | INFO | Son defensivos (skip polling), no bug directo |
| #9 | `POST /api/casos` sin permiso | FALSO | Ya usa `requirePermission('view:casos')` |
| #10 | `/api/realtime` sin auth | FALSO | Usa `auth()` correctamente |
| #11 | `linkUbicacion` acepta `javascript:` | CONFIRMADO | Nuevo finding; XSS potencial |

## Bugs Confirmados (esperan fix)

### RBAC-FACTURA-DETAIL
- **Archivo:** `src/app/api/facturas/[id]/route.ts`
- **Problema:** `GET` solo llama `requireAuth()`; lista completa de la factura (saldo, cliente, pedido) accesible a cualquier rol.
- **Fix:** Agregar `requireRole(['ADMIN', 'CONTADOR'])` igual que `GET /api/facturas`.
- **Test:** `e2e/qa/02-rbac/api-rbac.spec.ts`.

### RBAC-CLIENTE-DETAIL
- **Archivo:** `src/app/api/clientes/[id]/route.ts`
- **Problema:** `GET` solo llama `requireAuth()`; cualquier rol puede leer datos completos del cliente.
- **Fix:** Definir qué roles pueden leer (ADMIN/ASISTENTE/CONTADOR) y agregar `requireRole`.
- **Test:** `e2e/qa/02-rbac/api-rbac.spec.ts`.

### RBAC-PRODUCCION-LIST
- **Archivo:** `src/app/api/produccion/route.ts`
- **Problema:** `GET` solo llama `requireAuth()`; expone comisiones y producción.
- **Fix:** Agregar `requireRole(['ADMIN'])` al GET.
- **Test:** `e2e/qa/02-rbac/api-rbac.spec.ts`.

### RBAC-TRABAJADORES-LIST / RBAC-TRABAJADOR-DETAIL
- **Archivo:** `src/app/api/trabajadores/route.ts` y `src/app/api/trabajadores/[id]/route.ts`
- **Problema:** `GET` solo `requireAuth()`; expone datos laborales, comisiones y `userId`.
- **Fix:** Restringir a roles administrativos.
- **Test:** `e2e/qa/02-rbac/api-rbac.spec.ts`.

### XSS-LINK-UBICACION
- **Archivos:** `src/app/(app)/clientes/clientes-client/index.tsx`, `src/components/negocio-detail-modal.tsx`
- **Problema:** `linkUbicacion` se renderiza directamente en `href` sin sanitizar; acepta `javascript:`.
- **Fix:** Validar URL en el servidor (solo `http/https`) y/o sanitizar en renderizado.
- **Test:** `e2e/qa/02-rbac/xss-link-ubicacion.spec.ts`.

## Tests Añadidos

- `e2e/qa/02-rbac/api-rbac.spec.ts` — 8 tests (5 negativos + 3 positivos).
- `e2e/qa/02-rbac/xss-link-ubicacion.spec.ts` — 1 test (UI; React 19 bloquea el scheme).
- `e2e/qa/02-rbac/xss-link-ubicacion-api.spec.ts` — 1 test (API acepta `javascript:`).

## Resultados de Ejecución

```
npx playwright test e2e/qa/02-rbac --project=chromium
  6 failed  <- bugs confirmados (esperado)
  5 passed  <- controles positivos + React bloquea XSS en UI
```

## Nota sobre XSS-LINK-UBICACION

- **UI:** React 19 reescribe `href="javascript:..."` a `href="javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"`, por lo que **no es explotable** en el navegador actual.
- **API:** `PUT /api/clientes/[id]` acepta y persiste el valor `javascript:alert(document.domain)` con HTTP 200. Esto es deuda técnica de seguridad: la validación debe ser server-side para no depender de la versión de React.

## Tests Faltantes en esta Rama

- Reproducción redirect loop `EMPACADOR/ENTUBADOR`.
- Validación de `DescuentoRepartidor.motivo` si existe endpoint oculto.
- Revisión de `linkUbicacion` en flujo de negocio (modal).

## Cómo Ejecutar

```bash
npx playwright test e2e/qa/02-rbac --project=chromium --workers=1
```

Los tests de bugs confirmados **deben fallar** hasta que se apliquen los fixes.
