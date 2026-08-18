# ADR-CUSTODIA-001 — Custodia física

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §8
- Fase de implementación: FASE 2

## Contexto

La custodia física del inventario debe ser inequívoca: quién la tiene, en qué momento, y hacia dónde se transfiere.

## Decisión

- `CUSTODY_TRANSFER` registra la salida de un origen y la entrada a un destino como movimiento dirigido.
- Custodia es inequívoca: origen y destino explícitos en cada movimiento.
- El efecto nunca se interpreta por el signo de `cantidad` (ver ADR-FISICO-001).

## Invariantes

- Toda transferencia de custodia tiene origen y destino.
- `Retorno` no crea inventario disponible automáticamente (pasa a custodia de inspección).

## Verificación

Tests §20 "Físico": transferencia de custodia, retorno (no crea inventario disponible automáticamente).
