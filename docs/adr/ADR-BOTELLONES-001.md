# ADR-BOTELLONES-001 — Botellones y envases

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §16
- Fase de implementación: FASE 8

## Contexto

Un botellón recogido en ruta no es lo mismo que un botellón entregado. El estado de "recogido" debe ser válido y consultable.

## Decisión

- Un botellón recogido sin entrega sigue siendo un estado válido y consultable.
- Se conserva la diferencia `recogido ≠ entregado`.
- **No** se transforma automáticamente una recogida en una entrega.

## Invariantes

- Recogida y entrega son hechos separados.

## Verificación

Tests §20 "Histórico"/"Físico": recogida sin entrega permanece consultable.

## Estado de implementación (FASE 8)

- ✅ `botellones.service.ts`: recogida = `RETORNO` (repartidor→almacén) y entrega = `ENTREGA` (repartidor→cliente) como movimientos físicos SEPARADOS. No se transforma automáticamente una recogida en una entrega (§16).
