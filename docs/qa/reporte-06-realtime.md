# Reporte QA — Módulo 6: Realtime

**Auditor:** au.md v3.0  
**Fecha:** 2026-07-16  
**Rama:** `feat/qa-06-realtime`

## Cobertura
- Vista: `src/lib/realtime.ts`, `src/app/api/realtime/route.ts`, `src/components/realtime-provider.tsx`
- Roles probados: ADMIN, REPARTIDOR
- Eventos: `cliente.created`, `pedido.updated`, `embarque.created`

## Bugs encontrados / hallazgos

| ID | Severidad | Categoría | Hallazgo | Estado |
|----|-----------|-----------|----------|--------|
| RT-01 | Baja | Documentación | `pedido.deleted` aparecía en AGENTS.md pero no existe endpoint DELETE de pedidos ni evento publicado. | Corregido: se quitó de AGENTS.md. |
| RT-02 | Baja | Documentación | `trabajador.*` y `config.updated` no estaban documentados en AGENTS.md aunque el código los publica. | Corregido: se agregaron a la tabla. |
| RT-03 | Baja | Cobertura | No había tests E2E de entrega real de eventos. | Corregido: `e2e/qa/06-realtime/event-delivery.spec.ts`. |
| RT-04 | Baja | Cobertura | No había source audit de eventos publicados por cada mutación. | Corregido: `src/lib/__tests__/realtime-events-audit.test.ts`. |
| RT-05 | Informativa | Diseño | E2E realtime requiere servidor con `REDIS_URL`; no corre en CI por defecto. | Aceptado: tests skip si reciben 503. |
| RT-06 | Informativa | Diseño | No hay validación runtime del event type; confiamos en TypeScript. | Aceptado. |
| RT-07 | Informativa | Diseño | Orden de eventos múltiples no garantizado cuando un handler publica 2+ eventos en paralelo. | Aceptado: el cliente solo refetch. |

## Discrepancias docs/código resueltas

| Entidad | Antes (AGENTS.md) | Después |
|---------|-------------------|---------|
| Pedido | created, updated, deleted | created, updated |
| Trabajador | — | created, updated, deleted |
| Config | — | updated |

## Regresiones verificadas
- `npx tsc --noEmit`: OK
- `npm run test`: OK
- `npx playwright test e2e/qa/06-realtime`: OK (con Redis configurado); skip con 503

## Riesgos residuales
1. **E2E depende de Redis manual:** para correr los tests de entrega hay que iniciar el dev server con `REDIS_URL=redis://localhost:6379`.
2. **No se testea orden de eventos:** si una mutación publica `pedido.updated` + `embarque.updated`, no garantizamos orden.
3. **No se testea reconnect E2E:** el provider ya tiene tests unitarios de reconnect.
4. **No se testea degradación a polling:** el provider ya tiene tests unitarios; E2E requeriría simular 2g o Redis caído.

## Instrucciones para correr E2E de realtime

```bash
# Terminal 1: iniciar dev server con Redis
REDIS_URL=redis://localhost:6379 PORT=3001 npm run dev

# Terminal 2: correr tests
npx playwright test e2e/qa/06-realtime
```

Si el servidor no tiene `REDIS_URL`, los tests se saltan automáticamente.

## Convergencia
Cobertura de entrega end-to-end y source audit: sí. Pasada adicional: sin bug nuevo.

## Próximos pasos sugeridos
- Evaluar agregar `pedido.deleted` si en el futuro se implementa DELETE de pedidos.
- Considerar validación runtime de event type con Zod si se exponen publishers a input no tipado.
