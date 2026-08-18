# ADR-PROMOCION-001 — Promociones y regalos

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §17
- Fase de implementación: FASE 8

## Contexto

Un regalo/promoción consume inventario real, aunque su precio comercial sea cero. No debe convertirse en un cobro ficticio ni duplicar el consumo.

## Decisión

- Un regalo autorizado **consume inventario exactamente una vez**.
- Debe existir autorización auditable (`authorizedById`).
- Una promoción no debe convertirse en un cobro ficticio.
- El ledger físico refleja el consumo (movimiento `PROMOCION`) aunque el precio sea cero.

## Invariantes

- Consumo exactamente una vez.
- Autorización auditable obligatoria.

## Verificación

Tests §20 "Antifraude": regalo aplicado dos veces. Métrica de autorización auditable.

## Estado de implementación (FASE 8)

- ✅ Modelo `PromotionRule` (`producto`, `cantidad`, `autorizadoPorId` obligatorio → autorización auditable).
- ✅ `validarPromocion` (`promocion.service.ts`): exige `autorizadoPorId` + cantidad positiva.
- ✅ El consumo se registra en el ledger físico (`EmbarqueMovimiento` tipo `PROMOCION`, ya en el enum `TipoMovimiento` de FASE 2); el `offlineId @unique` del movimiento garantiza consumo exactamente una vez.
