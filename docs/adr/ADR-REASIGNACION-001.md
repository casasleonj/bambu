# ADR-REASIGNACION-001 — Reasignación por incidencia

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §0.2
- Fase de implementación: FASE 3

## Contexto

Un pedido puede quedar atrasado o atrapado en una ruta y debe reasignarse por accidente/incidencia sin corromper su estado contable ni su historial.

## Decisión

- La reasignación mueve un pedido entre embarques de forma explícita y auditable.
- En el cierre, un pedido `NO_ENTREGADO` puede reasignarse a un `nuevoEmbarqueId` (que debe estar ABIERTO/EN_RUTA); si no se indica, queda `NO_ENTREGADO` con `embarqueId: null`.
- Un pedido `ENTREGADO` nunca se desasigna (corrompería el historial de entrega).

## Invariantes

- No se reasigna un pedido ya entregado/anulado/cancelado.
- La reasignación no altera `Pedido.saldo`/`totalPagado`.

## Verificación

Flujo de cierre (NO_ENTREGADO → nuevoEmbarqueId) + asignación por PUT con guard `embarqueId: null`.
