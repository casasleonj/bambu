# ADR-CARTERA-001 — Cartera y aplicación FIFO de pagos

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §6
- Fase de implementación: FASE 0 (lock) / FASE 5 (conciliación)

## Contexto

Un pago puede distribuirse FIFO entre múltiples pedidos del mismo cliente. El agregado concurrentemente afectado es la **cartera del cliente**, no un único pedido.

## Decisión

El lock de cartera es `CARTERA:{clienteId}`.

Flujo obligatorio:

```
LOCK CARTERA(clienteId)
  → leer pedidos con saldo > 0
  → ordenar FIFO
  → aplicar pago
  → actualizar Pedido.saldo / totalPagado
  → crear hechos monetarios
  → generar ReceivableEntry como proyección
  → COMMIT
```

## Estado de implementación (FASE 0)

`POST /api/pedidos/pagar-fiado`, `POST /api/abonos` y el script `migrate-pagos-to-abonos` ya usan `CARTERA:{clienteId}` (antes `ABONO` global). La aplicación FIFO ordena por `Pedido.fecha` ascendente.

## Verificación

Tests §20 "Concurrencia": dos pagos concurrentes sobre la misma cartera.
