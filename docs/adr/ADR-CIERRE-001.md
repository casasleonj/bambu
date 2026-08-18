# ADR-CIERRE-001 — Cierre de embarque

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §6
- Fase de implementación: FASE 0 (lock) / FASE 5 (conciliación)

## Contexto

El cierre de un embarque es una operación infrecuente pero con múltiples efectos (pedidos, ventas libres, facturas, conciliación, caja). Debe ser idempotente y estar protegido contra cierres concurrentes.

## Decisión

- El lock de cierre es `CIERRE:{embarqueId}` (agregado = el embarque que se cierra).
- El cierre de día usa `CIERRE:{inicioDelDiaEnBogotá}` para serializar `/api/cierre` y `/api/cierre-dia` entre sí para el mismo día.
- Idempotencia por `offlineId`: replay con el mismo `offlineId` y estado `CERRADO` retorna `deduped: true` sin re-ejecutar.

## Estado de implementación (FASE 0)

`CerrarEmbarqueUseCase` usa `CIERRE:{embarqueId}`. Como el cierre además genera pedidos con numeración MAX+1, adquiere `SECUENCIA:pedido` en la misma transacción (multi-lock, orden `CIERRE → SECUENCIA`). Este lock de secuencia se elimina en FASE 8 con secuencia atómica de pedido.

## Verificación

Tests §20 "Concurrencia" + e2e `cierre-concurrente.spec.ts`.
