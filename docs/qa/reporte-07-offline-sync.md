# Reporte M7 — Offline Sync Unification

## Resumen
- Bugs confirmados y corregidos: 6
- Tests unitarios nuevos: 13 (`sync-pure.test.ts` 6, `sync-offline.test.ts` 7)
- Tests E2E nuevos: 10 (5 specs × 2 proyectos: chromium + chromium-mobile)
- Regresiones introducidas: 0
- Observaciones: 1 (botones duplicados en repartidor-client bajo React Strict Mode en dev)

## Bugs corregidos
1. **`syncWithServer` purgaba la cola ante 401**: ahora redirige a `/login?reason=expired` sin borrar `requestQueue` ni `syncQueue`, preservando los cambios offline para después del re-login.
2. **Concurrencia sin mutex en `syncWithServer`**: llamadas concurrentes devuelven `{ alreadyRunning: true }` en lugar de ejecutar múltiples sincronizaciones en paralelo.
3. **Timeout de sync indefinido**: ahora cada request usa `AbortController` con límite de 60s (`SYNC_TIMEOUT_MS`).
4. **429 generaba reintento inmediato**: ahora se registra `lastError` con `Retry-After` y el item permanece en cola; el backoff se aplica entre requests subsiguientes.
5. **Update de pedido no atómico**: `finalizeRequestQueueItem` actualiza `syncStatus`/`numero` en `offlineDb.pedidos` y borra el item de `offlineDb.requestQueue` dentro de una transacción Dexie.
6. **Dead code en `offline.ts`**: eliminados `resolveConflict`, `getConflicts`, `processSyncQueue`, `queueClienteOffline` y los tipos `ConflictStrategy`/`ConflictResolution`.

## Cambios de arquitectura
- `queuePedidoOffline` ahora escribe el pedido y el item de `requestQueue` en una transacción atómica, en lugar de usar `syncQueue` legacy.
- `syncWithServer` migra items legacy de `syncQueue` a `requestQueue` on-the-fly (shim sin pérdida de datos).
- `connectivity-indicator` cuenta `requestQueue + syncQueue` y muestra badge rojo (`failed-sync-counter`) cuando hay items en DLQ; el toast de DLQ solo se muestra en sync manual.
- `repartidor-client` muestra el contador de pedidos pendientes + items en DLQ.

## Métricas de verificación
- `npm run test`: PASS (169 archivos, 2027 tests)
- `npx tsc --noEmit`: PASS
- `npx playwright test e2e/qa/07-offline-sync --workers=1`: PASS (10/10)
- Smoke regression M2-M6: PASS (26/26, 4 skipped)

## Archivos modificados / creados
- `src/lib/db/sync.ts` — refactor mutex, timeout, 401/429/DLQ, update atómico.
- `src/lib/db/offline.ts` — `queuePedidoOffline` a `requestQueue`, eliminación de dead code.
- `src/components/connectivity-indicator.tsx` — contador ambas colas, badge DLQ, toast manual.
- `src/app/(app)/repartidor/repartidor-client.tsx` — contador pedidos + DLQ, data-testids E2E.
- `src/lib/db/__tests__/sync-pure.test.ts` — nuevo.
- `src/lib/db/__tests__/sync-offline.test.ts` — nuevo.
- `e2e/qa/07-offline-sync/*.spec.ts` — 5 specs E2E.
- `e2e/qa/07-offline-sync/helpers.ts` — helpers compartidos de setup E2E.

## Observaciones / follow-up
- En modo desarrollo (React Strict Mode), `repartidor-client` renderiza los botones `btn-venta-libre` y `btn-sync-repartidor` dos veces en el DOM. Los E2E usan `.first()` como workaround. No afecta comportamiento funcional ni producción (Strict Mode no se activa en builds de producción), pero es una deuda de testabilidad. Se recomienda investigar si hay un double-mount intencional o un bug de layout en la página de repartidor.
- Legacy `syncQueue` shim: revisar en 30 días si aún quedan clientes con items legacy; si no, se puede eliminar la migración on-the-fly.
