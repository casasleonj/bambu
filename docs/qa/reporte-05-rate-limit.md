# Reporte QA — Módulo 5: Rate Limiting / Proxy

**Auditor:** au.md v3.0  
**Fecha:** 2026-07-16  
**Rama:** `feat/qa-05-rate-limit`

## Cobertura
- Vista: `src/proxy.ts`, `src/lib/rate-limit.ts`, `src/app/api/realtime/route.ts`
- Roles probados: ADMIN
- Endpoints: `/api/health`, `/api/cron/*`, `/api/productos`, `/api/realtime`

## Bugs encontrados / hallazgos

| ID | Severidad | Categoría | Hallazgo | Estado |
|----|-----------|-----------|----------|--------|
| RL-01 | Media | Deuda técnica | `LIMITS.auth` y `LIMITS.page` existían pero nunca se ejecutaban en producción. El proxy matcher excluye `/api/auth/*` y el proxy nunca rate limitó rutas de página. | Corregido: se eliminaron del código y se actualizó `AGENTS.md`. |
| RL-02 | Baja | Operación | `DISABLE_RATE_LIMIT=true` estaba en `playwright.config.ts` y `.baseline-smoke.json` pero `rate-limit.ts` no la leía. Variable muerta que confundía. | Corregido: se eliminó de ambos archivos. |
| RL-03 | Baja | Cobertura | No había tests unitarios del comportamiento real de `checkRateLimit` (consume, reset, fail-open). | Corregido: `src/lib/__tests__/rate-limit-behavior.test.ts`. |
| RL-04 | Baja | Cobertura | No había tests del contrato SSE `rate_limited` de `/api/realtime`. | Corregido: `src/app/api/realtime/__tests__/route.test.ts`. |
| RL-05 | Informativa | Diseño | CSRF está desactivado en `NODE_ENV=development` (línea 27-29 de `src/lib/csrf.ts`). Los tests E2E corren en dev, por lo que no se puede testear CSRF en E2E. | Aceptado: se mantiene test unitario `src/__tests__/proxy-csrf.test.ts`. |
| RL-06 | Informativa | Diseño | Extracción de IP usa el primer elemento de `x-forwarded-for`. Esto es correcto detrás de Vercel pero es vulnerable a spoofing si se bypassa el proxy confiable. | Aceptado: se necesitaría contar proxies confiables; no se implementa por riesgo de regresión. |
| RL-07 | Informativa | Diseño | Auth.js endpoints no tienen rate limit visible de la aplicación; dependen de protección interna de Auth.js. | Aceptado: agregarlo requeriría quitar la exclusión del matcher, riesgo de romper login/logout. |

## Regresiones verificadas
- Baseline diff: no se detectaron fallas nuevas en `npm run test` ni `npx tsc --noEmit`.
- `npx tsc --noEmit`: OK
- `npm run test`: OK
- `npx playwright test e2e/qa/05-rate-limit`: OK

## Riesgos residuales
1. **Auth.js rate limiting no auditable:** confiamos en Auth.js v5 para proteger `/api/auth/*` contra fuerza bruta. No tenemos visibilidad ni control sobre sus límites.
2. **Page routes sin rate limit:** para 6 usuarios rurales es aceptable, pero un ataque de scraping masivo podría consumir recursos de SSR.
3. **IP spoofing si se bypassa Vercel:** el primer elemento de `x-forwarded-for` se asume como cliente. En producción con Vercel esto es correcto.
4. **CSRF skipped en dev:** cualquier prueba manual o exploratoria en desarrollo no valida CSRF. Solo en producción aplica.
5. **E2E stress test depende de `x-forwarded-for`:** si Playwright no permite setear este header, el test usa la IP real y debe correr al final del suite para no bloquear tests siguientes.

## Convergencia
Cobertura completa de lo que realmente ejecuta: sí. Pasada adicional: sin bug nuevo.

## Próximos pasos sugeridos
- Evaluar rate limiting por usuario (además de por IP) para endpoints sensibles como `/api/pedidos` en caso de crecer a más usuarios.
- Considerar headers `X-RateLimit-*` en respuestas exitosas para mejorar UX de indicadores de conectividad.
- Documentar límites de Auth.js si se requiere auditoría de fuerza bruta en login.
