# ADR-PRECIO-VOLUMEN-001 — Antifraude por volumen

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §0.2
- Fase de implementación: FASE 7 (con ventas libres)

## Contexto

Las ventas ficticias por volumen son un vector de fraude: un operador puede declarar unidades no vendidas para justificar faltantes o desviar inventario.

## Decisión

- La prevención/detección de ventas ficticias por volumen se apoya en los tres timestamps de `VentaLibre` (occurredAt/capturedAt/serverReceivedAt) y en la clasificación `NORMAL/TARDIA/SOSPECHOSA`.
- `PrecioVolumen` y `PedidoItem.autorizadoPorAdmin` refuerzan la detección de cambios de precio no autorizados.

## Invariantes

- Una venta tardía legítima no se bloquea, pero es detectable.
- Un retry no duplica la venta (offlineId).

## Verificación

Tests §20 "Antifraude": dos ventas libres distintas, retry de la misma venta, venta tardía, venta sospechosa.
