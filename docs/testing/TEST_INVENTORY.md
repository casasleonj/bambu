# TEST_INVENTORY.md

Generado automáticamente el 2026-08-24 contra el commit `4c6cba35` de `main` (Fase 0 del plan de auditoría).

**Cómo se generó**: script bash que enumera todos los `*.spec.ts` bajo `e2e/` y todos los `*.test.ts(x)` bajo `src/` + `prisma/`, clasificados por las reglas de inclusión reales de cada config (no por inspección manual archivo a archivo). El campo `Estado` queda `TBD` salvo para los casos ya investigados en Fase 0 — su clasificación fina (activo/legacy/candidato/duplicado) es trabajo de las Fases 3-7, no de esta fase.

## Resumen

| Runner | Config | Archivos | Tests (aprox.) | Ejecutado en CI |
|---|---|---|---|---|
| Playwright | `playwright.config.ts` (default) | 107 | 1660 (medido: `--list`) | Sí — job `e2e`, 8 shards |
| Playwright | `playwright.config.ts` testIgnore (exploratory/qa-comprehensive/produccion) | 82 | no medido (excluido) | No |
| Playwright | `playwright.test.config.ts` (huérfano, ver LEGACY_INVENTORY) | mismo `testDir: e2e`, sin testIgnore | no medido | No — 0 referencias en package.json/CI |
| Vitest | `vitest.config.ts` (unit) | 263 | ~2637 (grep it/test) | Sí — job `quality` (bloqueante) |
| Vitest | `vitest.integration.config.ts` | 24 | no medido | Sí — job `integration` (non-blocking) |
| Vitest | `prisma/__tests__/**` (huérfano, ver LEGACY_INVENTORY) | 4 | no medido | **No — excluido de ambos config, sin script propio** |

## Playwright — por suite/carpeta

| Carpeta | Archivos .spec.ts | Incluido en `playwright.config.ts` default |
|---|---|---|
| (root e2e/) | 79 | Sí |
| qa-comprehensive | 66 | No (testIgnore) |
| qa | 17 | Sí |
| exploratory | 13 | No (testIgnore) |
| produccion | 3 | No (testIgnore) |
| notificaciones | 3 | Sí |
| security-fixes | 2 | Sí |
| race-conditions | 2 | Sí |
| offline-first | 2 | Sí |
| fixes | 1 | Sí |
| ciclo-cancelacion | 1 | Sí |

## Playwright — inventario de archivos

| Archivo | Carpeta | CI (default config) |
|---|---|---|
| `e2e/abonos.spec.ts` | (root) | Sí |
| `e2e/admin-base-caja.spec.ts` | (root) | Sí |
| `e2e/auth-endpoints.spec.ts` | (root) | Sí |
| `e2e/auth-mobile-keyboard.spec.ts` | (root) | Sí |
| `e2e/auth.spec.ts` | (root) | Sí |
| `e2e/casos.spec.ts` | (root) | Sí |
| `e2e/ciclo-cancelacion.spec.ts` | (root) | Sí |
| `e2e/ciclo-cancelacion/anular-venta-rapida.spec.ts` | ciclo-cancelacion | Sí |
| `e2e/ciclo-credito.spec.ts` | (root) | Sí |
| `e2e/ciclo-pedido-completo.spec.ts` | (root) | Sí |
| `e2e/ciclo-repartidor.spec.ts` | (root) | Sí |
| `e2e/cierre.spec.ts` | (root) | Sí |
| `e2e/clientes-limite-fiados-post.spec.ts` | (root) | Sí |
| `e2e/clientes-scroll-lock.spec.ts` | (root) | Sí |
| `e2e/clientes.spec.ts` | (root) | Sí |
| `e2e/compras.spec.ts` | (root) | Sí |
| `e2e/configuracion.spec.ts` | (root) | Sí |
| `e2e/critical-flows.spec.ts` | (root) | Sí |
| `e2e/cron-jobs.spec.ts` | (root) | Sí |
| `e2e/deudas.spec.ts` | (root) | Sí |
| `e2e/dos-ventas-rapidas-mismo-cliente.spec.ts` | (root) | Sí |
| `e2e/embarques-all-contexts.spec.ts` | (root) | Sí |
| `e2e/embarques-dedicado.spec.ts` | (root) | Sí |
| `e2e/embarques-fisico.spec.ts` | (root) | Sí |
| `e2e/embarques-fixes.spec.ts` | (root) | Sí |
| `e2e/embarques-hydration.spec.ts` | (root) | Sí |
| `e2e/embarques-stats.spec.ts` | (root) | Sí |
| `e2e/embarques.spec.ts` | (root) | Sí |
| `e2e/entrega-gps.spec.ts` | (root) | Sí |
| `e2e/exploratory/chaos.spec.ts` | exploratory | No |
| `e2e/exploratory/smoke.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-alertas-rerun.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-alertas.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-b4-deuda.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-closure.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-deepdive.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-general.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-offline-e2e.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-offline.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-personas.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-priority.spec.ts` | exploratory | No |
| `e2e/exploratory/walkthrough-tests-fix.spec.ts` | exploratory | No |
| `e2e/facturas.spec.ts` | (root) | Sí |
| `e2e/fiado-status-api.spec.ts` | (root) | Sí |
| `e2e/fiado-status-ui.spec.ts` | (root) | Sí |
| `e2e/fiados-limite-global.spec.ts` | (root) | Sí |
| `e2e/fiados-trazabilidad.spec.ts` | (root) | Sí |
| `e2e/fixes/clientes-crear-lento-fix.spec.ts` | fixes | Sí |
| `e2e/flujo-cierre-completo-mobile.spec.ts` | (root) | Sí |
| `e2e/flujo-crear-pedido-offline-mobile.spec.ts` | (root) | Sí |
| `e2e/flujo-embarque-despachado-mobile.spec.ts` | (root) | Sí |
| `e2e/flujo-permisos-repartidor-mobile.spec.ts` | (root) | Sí |
| `e2e/full-user-day.spec.ts` | (root) | Sí |
| `e2e/gastos.spec.ts` | (root) | Sí |
| `e2e/importacion-historica.spec.ts` | (root) | Sí |
| `e2e/insumos.spec.ts` | (root) | Sí |
| `e2e/menu-reorder.spec.ts` | (root) | Sí |
| `e2e/mobile-clientes.spec.ts` | (root) | Sí |
| `e2e/mobile-header.spec.ts` | (root) | Sí |
| `e2e/mobile-menu.spec.ts` | (root) | Sí |
| `e2e/mobile-offline-comprehensive.spec.ts` | (root) | Sí |
| `e2e/negocios-crud.spec.ts` | (root) | Sí |
| `e2e/nomina.spec.ts` | (root) | Sí |
| `e2e/notificaciones/opt-in-toast.spec.ts` | notificaciones | Sí |
| `e2e/notificaciones/permission-flow.spec.ts` | notificaciones | Sí |
| `e2e/notificaciones/settings.spec.ts` | notificaciones | Sí |
| `e2e/offline-counter.spec.ts` | (root) | Sí |
| `e2e/offline-finanzas.spec.ts` | (root) | Sí |
| `e2e/offline-first/crear-pedido-hook-dedup.spec.ts` | offline-first | Sí |
| `e2e/offline-first/venta-libre-dedup.spec.ts` | offline-first | Sí |
| `e2e/offline-full-flow.spec.ts` | (root) | Sí |
| `e2e/offline-operaciones.spec.ts` | (root) | Sí |
| `e2e/offline-resilience.spec.ts` | (root) | Sí |
| `e2e/offline-ventas.spec.ts` | (root) | Sí |
| `e2e/pedidos-all-contexts.spec.ts` | (root) | Sí |
| `e2e/pedidos-detalle-factura.spec.ts` | (root) | Sí |
| `e2e/pedidos-detalle-nombre.spec.ts` | (root) | Sí |
| `e2e/pedidos-display-negocio.spec.ts` | (root) | Sí |
| `e2e/pedidos-edicion-realtime.spec.ts` | (root) | Sí |
| `e2e/pedidos-filtros-funcionales.spec.ts` | (root) | Sí |
| `e2e/pedidos-saldo-pendiente-no-entregado.spec.ts` | (root) | Sí |
| `e2e/pedidos-tipo-campo.spec.ts` | (root) | Sí |
| `e2e/pedidos.spec.ts` | (root) | Sí |
| `e2e/precios-especiales.spec.ts` | (root) | Sí |
| `e2e/produccion-offline.spec.ts` | (root) | Sí |
| `e2e/produccion.spec.ts` | (root) | Sí |
| `e2e/produccion/clientes-crear-lento.spec.ts` | produccion | No |
| `e2e/produccion/pedidos-timing.spec.ts` | produccion | No |
| `e2e/produccion/produccion-portal.spec.ts` | produccion | No |
| `e2e/productos-comprehensive.spec.ts` | (root) | Sí |
| `e2e/productos.spec.ts` | (root) | Sí |
| `e2e/proveedores.spec.ts` | (root) | Sí |
| `e2e/pwa-offline.spec.ts` | (root) | Sí |
| `e2e/pwa.spec.ts` | (root) | Sí |
| `e2e/qa-comprehensive/01-foundation/00-auth-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/01-foundation/01-smoke-all-pages.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/01-foundation/02-navigation-sidebar.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/admin-user-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/cambiar-password-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/cierre-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/cliente-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/compra-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/configuracion-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/deuda-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/embarque-close-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/embarque-create-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/gasto-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/insumo-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/mi-perfil-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/negocio-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/nomina-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/pedido-form-unified.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/produccion-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/producto-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/proveedor-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/recurrente-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/ruta-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/trabajador-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/02-forms-validation/venta-rapida-form.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/cierre-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/clientes-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/compras-gastos-insumos-proveedores-casos-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/embarques-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/pedidos-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/produccion-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/recurrentes-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/rutas-nomina-reportes-facturas-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/03-domain-flows/trabajadores-flow.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/04-cross-page/navigation.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/05-security-malicious/idor-and-priv-esc.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/05-security-malicious/malicious-inputs.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/05-security-malicious/rate-limit-and-pricing.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/05-security-malicious/state-race-session.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/06-business-edge-cases/edge-cases.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/07-statistics-consistency/consistency.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/01-modules-all-roles.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/02-walkthrough-clientes.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/03-walkthrough-pedidos.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/04-walkthrough-recurrentes.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/05-walkthrough-embarques.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/06-walkthrough-dashboard.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/07-walkthrough-reportes.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/08-walkthrough-admin.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/09-destructive-patterns.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/10-forms-stress-test.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/08-destructive-walkthrough/11-final-report.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/01-day-asistente-completo.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/02-day-admin-supervision.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/03-day-repartidor-ruta.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/04-day-contador-reportes.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/05-multi-day-cierres.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/06-offline-deep.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/07-cross-module-nav.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/08-regression-modal-base-caja.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/09-pedidos-desde-clientes-ui.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/10-pedidos-tabs-filtros.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/11-cierre-multi-fecha.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/12-nomina-comisiones.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/13-proveedores-compras-gastos.spec.ts` | qa-comprehensive | No |
| `e2e/qa-comprehensive/09-realistic-day/14-offline-extra.spec.ts` | qa-comprehensive | No |
| `e2e/qa/00-smoke-fixtures-paranoid.spec.ts` | qa | Sí |
| `e2e/qa/02-rbac/api-rbac.spec.ts` | qa | Sí |
| `e2e/qa/02-rbac/xss-link-ubicacion-api.spec.ts` | qa | Sí |
| `e2e/qa/02-rbac/xss-link-ubicacion.spec.ts` | qa | Sí |
| `e2e/qa/03-validacion/cliente-mass-assignment.spec.ts` | qa | Sí |
| `e2e/qa/03-validacion/negocio-link-ubicacion.spec.ts` | qa | Sí |
| `e2e/qa/04-offline/cliente-dedup.spec.ts` | qa | Sí |
| `e2e/qa/04-offline/pedido-dedup.spec.ts` | qa | Sí |
| `e2e/qa/04-offline/produccion-dedup.spec.ts` | qa | Sí |
| `e2e/qa/05-rate-limit/proxy-exclusions.spec.ts` | qa | Sí |
| `e2e/qa/05-rate-limit/zzz-api-stress.spec.ts` | qa | Sí |
| `e2e/qa/06-realtime/event-delivery.spec.ts` | qa | Sí |
| `e2e/qa/07-offline-sync/dlq-4xx.spec.ts` | qa | Sí |
| `e2e/qa/07-offline-sync/multiple-requests-order.spec.ts` | qa | Sí |
| `e2e/qa/07-offline-sync/offline-venta-libre-sync.spec.ts` | qa | Sí |
| `e2e/qa/07-offline-sync/queue-persistence-reload.spec.ts` | qa | Sí |
| `e2e/qa/07-offline-sync/session-expiry-preserve-queue.spec.ts` | qa | Sí |
| `e2e/race-conditions/cierre-concurrente.spec.ts` | race-conditions | Sí |
| `e2e/race-conditions/entrega-concurrente.spec.ts` | race-conditions | Sí |
| `e2e/recurrentes.spec.ts` | (root) | Sí |
| `e2e/roles-permisos.spec.ts` | (root) | Sí |
| `e2e/rutas.spec.ts` | (root) | Sí |
| `e2e/security-fixes.spec.ts` | (root) | Sí |
| `e2e/security-fixes/cierre-last-rbac.spec.ts` | security-fixes | Sí |
| `e2e/security-fixes/pagar-fiado-rbac.spec.ts` | security-fixes | Sí |
| `e2e/session-expiry.spec.ts` | (root) | Sí |
| `e2e/session-limits.spec.ts` | (root) | Sí |
| `e2e/trabajadores.spec.ts` | (root) | Sí |
| `e2e/user-flow.spec.ts` | (root) | Sí |

## Vitest unit — inventario de archivos

| Archivo | CI (job `quality`) |
|---|---|
| `src/__tests__/pedido-utils.test.ts` | Sí |
| `src/__tests__/proxy-csrf.test.ts` | Sí |
| `src/app/(app)/__tests__/header.test.tsx` | Sí |
| `src/app/(app)/__tests__/sidebar.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/cliente-form.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/cliente-table.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/index.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/negocios-ubicaciones-filter.test.tsx` | Sí |
| `src/app/(app)/clientes/clientes-client/__tests__/panel-prefetch.test.ts` | Sí |
| `src/app/(app)/embarques/[id]/__tests__/direccion-negocio.test.ts` | Sí |
| `src/app/(app)/embarques/[id]/cerrar/cerrar-client/__tests__/offline-resiliente.test.ts` | Sí |
| `src/app/(app)/facturas/facturas-client/__tests__/factura-detail.test.tsx` | Sí |
| `src/app/(app)/facturas/facturas-client/__tests__/index.test.ts` | Sí |
| `src/app/(app)/pedidos/pedidos-client/__tests__/fiados-table.test.ts` | Sí |
| `src/app/(app)/pedidos/pedidos-client/__tests__/pedido-inicial-negocio.test.ts` | Sí |
| `src/app/(app)/pedidos/pedidos-client/__tests__/pedido-table-pending.test.tsx` | Sí |
| `src/app/(app)/pedidos/pedidos-client/__tests__/pedido-table.test.ts` | Sí |
| `src/app/(app)/recurrentes/[id]/__tests__/direccion-indicator.test.ts` | Sí |
| `src/app/(app)/recurrentes/nuevo/nuevo-client/__tests__/direccion-indicator.test.ts` | Sí |
| `src/app/(app)/recurrentes/recurrentes-client/__tests__/offline-id.test.ts` | Sí |
| `src/app/(app)/repartidor/__tests__/direccion-repartidor.test.ts` | Sí |
| `src/app/(app)/repartidor/__tests__/orden-visita-google-maps.test.ts` | Sí |
| `src/app/__tests__/headers.test.ts` | Sí |
| `src/app/__tests__/manifest.test.ts` | Sí |
| `src/app/__tests__/sw.test.ts` | Sí |
| `src/app/api/__tests__/ledger-endpoints.test.ts` | Sí |
| `src/app/api/abonos/__tests__/route.test.ts` | Sí |
| `src/app/api/auth/force-password-change/__tests__/route.test.ts` | Sí |
| `src/app/api/auth/profile/__tests__/route.test.ts` | Sí |
| `src/app/api/casos/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/cierre-dia/__tests__/route.test.ts` | Sí |
| `src/app/api/cierre/__tests__/p1.test.ts` | Sí |
| `src/app/api/clientes/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/clientes/[id]/contactos/__tests__/route.test.ts` | Sí |
| `src/app/api/clientes/[id]/fiado-status/__tests__/route.test.ts` | Sí |
| `src/app/api/clientes/__tests__/route.test.ts` | Sí |
| `src/app/api/clientes/quick/__tests__/route.test.ts` | Sí |
| `src/app/api/config/__tests__/route.test.ts` | Sí |
| `src/app/api/cron/alerta-no-verificados/__tests__/route.test.ts` | Sí |
| `src/app/api/cron/alertas-batch/__tests__/route.test.ts` | Sí |
| `src/app/api/deudas/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/embarques/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/embarques/[id]/cerrar/__tests__/route.test.ts` | Sí |
| `src/app/api/embarques/[id]/enviar/__tests__/route.test.ts` | Sí |
| `src/app/api/embarques/[id]/gastos/__tests__/route.test.ts` | Sí |
| `src/app/api/embarques/[id]/pedidos/[pedidoId]/__tests__/route.test.ts` | Sí |
| `src/app/api/facturas/__tests__/route.test.ts` | Sí |
| `src/app/api/gps-track/__tests__/route.test.ts` | Sí |
| `src/app/api/insumos/__tests__/route.test.ts` | Sí |
| `src/app/api/negocios/[id]/geocode/__tests__/route.test.ts` | Sí |
| `src/app/api/negocios/__tests__/route.test.ts` | Sí |
| `src/app/api/nomina/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/nomina/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/[id]/anular/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/[id]/cancelar/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/[id]/entrega/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/[id]/enviar/__tests__/race-condition.test.ts` | Sí |
| `src/app/api/pedidos/[id]/enviar/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/[id]/resolver-disputa/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/counts/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/pagar-fiado/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/venta-libre/__tests__/route.test.ts` | Sí |
| `src/app/api/pedidos/venta-libre/__tests__/timestamps.test.ts` | Sí |
| `src/app/api/precios/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/precios/__tests__/route.test.ts` | Sí |
| `src/app/api/precios/resolver/__tests__/batching.test.ts` | Sí |
| `src/app/api/precios/resolver/__tests__/route.test.ts` | Sí |
| `src/app/api/produccion/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/produccion/__tests__/route.test.ts` | Sí |
| `src/app/api/push/vapid-public-key/__tests__/route.test.ts` | Sí |
| `src/app/api/realtime/__tests__/route.test.ts` | Sí |
| `src/app/api/recurrentes/__tests__/route.test.ts` | Sí |
| `src/app/api/rutas/__tests__/route.test.ts` | Sí |
| `src/app/api/trabajadores/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/users/[id]/__tests__/route.test.ts` | Sí |
| `src/app/api/users/[id]/reset-password/__tests__/route.test.ts` | Sí |
| `src/app/api/users/__tests__/route.test.ts` | Sí |
| `src/app/api/validate-data/__tests__/route.test.ts` | Sí |
| `src/components/__tests__/base-caja-modal.test.tsx` | Sí |
| `src/components/__tests__/caja-base-header.test.tsx` | Sí |
| `src/components/__tests__/connectivity-indicator-killswitch.test.tsx` | Sí |
| `src/components/__tests__/connectivity-indicator.test.tsx` | Sí |
| `src/components/__tests__/coords-preview.test.tsx` | Sí |
| `src/components/__tests__/direccion-indicator.test.tsx` | Sí |
| `src/components/__tests__/in-app-push-listener.test.tsx` | Sí |
| `src/components/__tests__/money-display.test.tsx` | Sí |
| `src/components/__tests__/negocio-detail-modal.test.tsx` | Sí |
| `src/components/__tests__/negocio-selector.test.tsx` | Sí |
| `src/components/__tests__/push-opt-in-toast.test.tsx` | Sí |
| `src/components/__tests__/push-settings.test.tsx` | Sí |
| `src/components/__tests__/realtime-provider-cooldown-reconnect.test.tsx` | Sí |
| `src/components/__tests__/realtime-provider.test.tsx` | Sí |
| `src/components/__tests__/session-expiry-guard.test.tsx` | Sí |
| `src/components/__tests__/update-notification.test.tsx` | Sí |
| `src/components/pedido-form-unified/__tests__/edit-negocio-prefill.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/fiado-status-no-regression.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/negocio-direccion-sin-ruido.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/patron-consumo-opt-in.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/precio-race-condition.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/resolve-actualizar-cliente.test.ts` | Sí |
| `src/components/pedido-form-unified/__tests__/solo-para-este-pedido-checkbox.test.ts` | Sí |
| `src/hooks/__tests__/use-base-caja-editor.test.ts` | Sí |
| `src/hooks/__tests__/use-base-caja.test.ts` | Sí |
| `src/hooks/__tests__/use-crear-pedido.test.ts` | Sí |
| `src/hooks/__tests__/use-gps-capture.test.ts` | Sí |
| `src/hooks/__tests__/use-install-prompt.test.ts` | Sí |
| `src/hooks/__tests__/use-is-desktop.test.ts` | Sí |
| `src/hooks/__tests__/use-pedidos.test.ts` | Sí |
| `src/hooks/__tests__/use-polling-refetch.test.ts` | Sí |
| `src/hooks/__tests__/use-push-opt-in.test.ts` | Sí |
| `src/hooks/__tests__/use-push-subscription.test.ts` | Sí |
| `src/hooks/__tests__/use-realtime-listener.test.ts` | Sí |
| `src/hooks/__tests__/use-reconnect-handler.test.ts` | Sí |
| `src/hooks/__tests__/use-shallow-search-params.test.ts` | Sí |
| `src/lib/__tests__/alertas-detector.test.ts` | Sí |
| `src/lib/__tests__/audit.test.ts` | Sí |
| `src/lib/__tests__/auth-logging.test.ts` | Sí |
| `src/lib/__tests__/business-hours.test.ts` | Sí |
| `src/lib/__tests__/cliente-detail-cache.test.ts` | Sí |
| `src/lib/__tests__/cliente-filters.test.ts` | Sí |
| `src/lib/__tests__/comisiones.test.ts` | Sí |
| `src/lib/__tests__/config-validation.test.ts` | Sí |
| `src/lib/__tests__/config.test.ts` | Sí |
| `src/lib/__tests__/cron-auth.test.ts` | Sí |
| `src/lib/__tests__/csrf.test.ts` | Sí |
| `src/lib/__tests__/dates.test.ts` | Sí |
| `src/lib/__tests__/embarque-auto.test.ts` | Sí |
| `src/lib/__tests__/embarque-capacidad-edge.test.ts` | Sí |
| `src/lib/__tests__/embarque-capacidad.test.ts` | Sí |
| `src/lib/__tests__/embarque-pedido-enrich.test.ts` | Sí |
| `src/lib/__tests__/embarque-stats.test.ts` | Sí |
| `src/lib/__tests__/embarque-ui-estado.test.ts` | Sí |
| `src/lib/__tests__/factura-empresa.test.ts` | Sí |
| `src/lib/__tests__/fetch-resilient-auth-error.test.ts` | Sí |
| `src/lib/__tests__/fetch-resilient-extended.test.ts` | Sí |
| `src/lib/__tests__/fetch-resilient-offline-fix.test.ts` | Sí |
| `src/lib/__tests__/fetch-resilient.test.ts` | Sí |
| `src/lib/__tests__/fetch-timeout.test.ts` | Sí |
| `src/lib/__tests__/format-zod-error.test.ts` | Sí |
| `src/lib/__tests__/gps.test.ts` | Sí |
| `src/lib/__tests__/integration/ajuste-pedido.test.ts` | Sí |
| `src/lib/__tests__/integration/cierre-dual-write.test.ts` | Sí |
| `src/lib/__tests__/integration/cierre-idempotencia.test.ts` | Sí |
| `src/lib/__tests__/integration/cierre-preview-dry-run.test.ts` | Sí |
| `src/lib/__tests__/integration/consumidor-final-canonical.test.ts` | Sí |
| `src/lib/__tests__/integration/embarque-recarga.test.ts` | Sí |
| `src/lib/__tests__/integration/enviar-concurrencia.test.ts` | Sí |
| `src/lib/__tests__/integration/factura-numeracion-paralela.test.ts` | Sí |
| `src/lib/__tests__/integration/idor-permisos.test.ts` | Sí |
| `src/lib/__tests__/integration/import-historico.test.ts` | Sí |
| `src/lib/__tests__/integration/ledger-fisico-constraints.test.ts` | Sí |
| `src/lib/__tests__/integration/ledger-fisico-dual-write.test.ts` | Sí |
| `src/lib/__tests__/integration/locks.test.ts` | Sí |
| `src/lib/__tests__/integration/notification-rules.test.ts` | Sí |
| `src/lib/__tests__/integration/obligacion-concurrencia.test.ts` | Sí |
| `src/lib/__tests__/integration/pedido-dedup.test.ts` | Sí |
| `src/lib/__tests__/integration/pedido-idempotencia.test.ts` | Sí |
| `src/lib/__tests__/integration/pedidos-sin-asignar.test.ts` | Sí |
| `src/lib/__tests__/integration/receivable-entry.test.ts` | Sí |
| `src/lib/__tests__/integration/recovery-concurrencia.test.ts` | Sí |
| `src/lib/__tests__/integration/responsibility.test.ts` | Sí |
| `src/lib/__tests__/integration/secuencias-atomicas.test.ts` | Sí |
| `src/lib/__tests__/integration/sequence-runtime.test.ts` | Sí |
| `src/lib/__tests__/integration/session-store.test.ts` | Sí |
| `src/lib/__tests__/locks.test.ts` | Sí |
| `src/lib/__tests__/nomina-deudas.test.ts` | Sí |
| `src/lib/__tests__/pedido-legacy.test.ts` | Sí |
| `src/lib/__tests__/pedido-ruta.test.ts` | Sí |
| `src/lib/__tests__/pedidos-sin-asignar.test.ts` | Sí |
| `src/lib/__tests__/permissions.test.ts` | Sí |
| `src/lib/__tests__/price-sync.test.ts` | Sí |
| `src/lib/__tests__/pricing.test.ts` | Sí |
| `src/lib/__tests__/push.test.ts` | Sí |
| `src/lib/__tests__/qa-reportBug.test.ts` | Sí |
| `src/lib/__tests__/rate-limit-behavior.test.ts` | Sí |
| `src/lib/__tests__/realtime-events-audit.test.ts` | Sí |
| `src/lib/__tests__/realtime.test.ts` | Sí |
| `src/lib/__tests__/receivable-entry.test.ts` | Sí |
| `src/lib/__tests__/recurrentes-admin-cron-dedup.test.ts` | Sí |
| `src/lib/__tests__/recurrentes-dedup.test.ts` | Sí |
| `src/lib/__tests__/recurrentes-timezone.test.ts` | Sí |
| `src/lib/__tests__/recurrentes-tx.test.ts` | Sí |
| `src/lib/__tests__/recurrentes.test.ts` | Sí |
| `src/lib/__tests__/request-metadata.test.ts` | Sí |
| `src/lib/__tests__/sentry-helpers.test.ts` | Sí |
| `src/lib/__tests__/serializable.test.ts` | Sí |
| `src/lib/__tests__/session-limits.test.ts` | Sí |
| `src/lib/__tests__/stock.test.ts` | Sí |
| `src/lib/__tests__/telefono.test.ts` | Sí |
| `src/lib/__tests__/umbrales.test.ts` | Sí |
| `src/lib/__tests__/user-agent.test.ts` | Sí |
| `src/lib/__tests__/utils.test.ts` | Sí |
| `src/lib/__tests__/uuid.test.ts` | Sí |
| `src/lib/__tests__/validators.property.test.ts` | Sí |
| `src/lib/__tests__/validators.test.ts` | Sí |
| `src/lib/__tests__/venta-libre-clasificacion.test.ts` | Sí |
| `src/lib/client/__tests__/config-client.test.ts` | Sí |
| `src/lib/cliente-filters.test.ts` | Sí |
| `src/lib/db/__tests__/sync-offline.test.ts` | Sí |
| `src/lib/db/__tests__/sync-pure.test.ts` | Sí |
| `src/lib/demanda/__tests__/forecasting.test.ts` | Sí |
| `src/lib/demanda/__tests__/rfm.test.ts` | Sí |
| `src/lib/demanda/__tests__/scoring.test.ts` | Sí |
| `src/lib/geo/__tests__/backfill-cliente-coords.test.ts` | Sí |
| `src/lib/geo/__tests__/backfill-negocio-coords.test.ts` | Sí |
| `src/lib/geo/__tests__/dbscan.test.ts` | Sí |
| `src/lib/geo/__tests__/expand-short-maps-url.test.ts` | Sí |
| `src/lib/geo/__tests__/haversine.test.ts` | Sí |
| `src/lib/geo/__tests__/optimize-ruta.test.ts` | Sí |
| `src/lib/geo/__tests__/parse-google-maps-link.test.ts` | Sí |
| `src/lib/geo/__tests__/pedido-coords.test.ts` | Sí |
| `src/lib/geo/__tests__/pedido-direccion-wiring.test.ts` | Sí |
| `src/lib/geo/__tests__/pedido-direccion.test.ts` | Sí |
| `src/lib/geo/__tests__/tsp.test.ts` | Sí |
| `src/lib/import/__tests__/matcher.test.ts` | Sí |
| `src/lib/import/__tests__/normalizer.test.ts` | Sí |
| `src/lib/import/__tests__/parser.test.ts` | Sí |
| `src/lib/import/__tests__/validator.test.ts` | Sí |
| `src/lib/notifications/__tests__/notify-event.test.ts` | Sí |
| `src/lib/notifications/__tests__/resolve-recipients.test.ts` | Sí |
| `src/modules/dashboard/application/__tests__/get-dashboard-data.test.ts` | Sí |
| `src/modules/dashboard/domain/__tests__/stock.service.test.ts` | Sí |
| `src/modules/dashboard/domain/__tests__/ventas.service.test.ts` | Sí |
| `src/modules/dashboard/infrastructure/__tests__/produccion.repository.test.ts` | Sí |
| `src/modules/dashboard/presentation/__tests__/adapter.test.ts` | Sí |
| `src/modules/embarques/__tests__/carga.test.ts` | Sí |
| `src/modules/embarques/__tests__/cerrar.test.ts` | Sí |
| `src/modules/embarques/__tests__/estado-transitions.test.ts` | Sí |
| `src/modules/embarques/__tests__/value-objects.test.ts` | Sí |
| `src/modules/embarques/application/use-cases/__tests__/CerrarEmbarqueUseCase.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/botellones.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/cierre-dedup.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/crear-deuda-faltante-caja.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/crear-ventas-libres.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/embarque-validation.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/ledger-fisico.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/obligacion.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/procesar-pedido.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/promocion.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/recovery.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/responsibility.service.test.ts` | Sí |
| `src/modules/embarques/domain/services/__tests__/side-effects.test.ts` | Sí |
| `src/modules/pedidos/__tests__/entregar.test.ts` | Sí |
| `src/modules/pedidos/__tests__/estado-entrega.test.ts` | Sí |
| `src/modules/pedidos/__tests__/expand-contract.test.ts` | Sí |
| `src/modules/pedidos/__tests__/validacion.test.ts` | Sí |
| `src/modules/pedidos/application/dto/__tests__/PedidoDTOMapper.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/ActualizarPedidoUseCase.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/CancelarPedidoUseCase.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/EntregarPedidoUseCase.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/ListarPedidosUseCase.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/actualizar-cliente-negocio-guard.test.ts` | Sí |
| `src/modules/pedidos/application/use-cases/__tests__/direccion-entrega-snapshot.test.ts` | Sí |
| `src/modules/pedidos/domain/entities/__tests__/Pedido.test.ts` | Sí |
| `src/modules/pedidos/domain/services/__tests__/pagos-calculator.test.ts` | Sí |
| `src/modules/pedidos/infrastructure/repositories/__tests__/PrismaClienteRepository.test.ts` | Sí |
| `src/modules/pedidos/infrastructure/repositories/__tests__/PrismaPedidoRepository.test.ts` | Sí |
| `src/modules/pedidos/presentation/__tests__/visual-states.test.ts` | Sí |
| `src/shared/domain/__tests__/calcular-saldo.test.ts` | Sí |
| `src/shared/domain/__tests__/money.property.test.ts` | Sí |
| `src/shared/domain/__tests__/money.test.ts` | Sí |

## Vitest integration — inventario de archivos

| Archivo | CI (job `integration`, non-blocking) |
|---|---|
| `src/lib/__tests__/integration/ajuste-pedido.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/cierre-dual-write.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/cierre-idempotencia.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/cierre-preview-dry-run.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/consumidor-final-canonical.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/embarque-recarga.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/enviar-concurrencia.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/factura-numeracion-paralela.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/idor-permisos.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/import-historico.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/ledger-fisico-constraints.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/ledger-fisico-dual-write.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/locks.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/notification-rules.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/obligacion-concurrencia.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/pedido-dedup.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/pedido-idempotencia.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/pedidos-sin-asignar.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/receivable-entry.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/recovery-concurrencia.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/responsibility.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/secuencias-atomicas.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/sequence-runtime.test.ts` | Sí (non-blocking) |
| `src/lib/__tests__/integration/session-store.test.ts` | Sí (non-blocking) |

## prisma/__tests__ — huérfano (ver LEGACY_INVENTORY.md)

| Archivo | CI |
|---|---|
| `prisma/__tests__/check-constraints-runtime.test.ts` | **No** |
| `prisma/__tests__/check-constraints.test.ts` | **No** |
| `prisma/__tests__/factura-numero-seq.test.ts` | **No** |
| `prisma/__tests__/seed.test.ts` | **No** |
