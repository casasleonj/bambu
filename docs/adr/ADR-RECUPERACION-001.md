# ADR-RECUPERACION-001 — Recovery de sobrantes y faltantes

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §3, §4
- Fase de implementación: FASE 4

## Contexto

La recuperación de unidades (sobrantes liberados, faltantes) debe registrar decisiones auditables sin doble consumo de un origen físico.

## Decisión

Modelo `RecoveryDecision`:

- `sourceEventId` es **nullable**: un `SOBRANTE` tiene evento físico de origen; un `FALTANTE` no necesariamente lo tiene.
- `cantidadDisponibleEnOrigen` es **nullable**.
- No debe inventarse un evento físico de origen para representar un faltante.

Semántica:

- **SOBRANTE**: `sourceEventId = EmbarqueMovimiento.id`, `cantidadDisponibleEnOrigen = disponible en el origen`, `cantidad = solicitada`, `cantidadAplicada = realmente aplicada`.
- **FALTANTE**: `sourceEventId = NULL`, `cantidadDisponibleEnOrigen = NULL`.

## Invariantes

```
0 <= cantidadAplicada <= cantidad
```

Para SOBRANTE: `sum(cantidadAplicada de decisiones del mismo sourceEventId) <= cantidad físicamente disponible en el origen`. Para FALTANTE no aplica (no hay origen físico consumible).

## Flujos obligatorios

- SOBRANTE: `LOCK(RECOVERY_SOURCE:sourceEventId)` → resolver movimiento → determinar disponibilidad → sumar decisiones previas → validar restante → crear decisión → crear movimiento resultante → COMMIT.
- FALTANTE: sin sourceEventId → validar discrepancia → lock del agregado afectado → determinar faltante sin resolver → crear decisión → registrar consecuencia → COMMIT.

## Verificación

Tests §20 "Concurrencia": dos decisiones sobre el mismo source (sin doble consumo). Métrica `recovery_decision_double_consumption_rejected_count`.

## Estado de implementación (FASE 4)

- ✅ Modelo `RecoveryDecision` con `sourceEventId` y `cantidadDisponibleEnOrigen` **nullable**.
- ✅ CHECK constraints: `chk_recovery_cantidad_aplicada` (0 ≤ aplicada ≤ cantidad), `chk_recovery_cantidad_pos`, `chk_recovery_tipo` (SOBRANTE|FALTANTE).
- ✅ Servicio de dominio `recovery.service.ts` (`validarRecoveryDecision`).
- ✅ `CrearRecoveryDecisionUseCase`: SOBRANTE bajo lock `RECOVERY_SOURCE:{sourceEventId}` con suma de decisiones previas (sin doble consumo) + movimiento resultante `CUSTODY_TRANSFER`; FALTANTE bajo lock `EMBARQUE_CARGA:{embarqueId}` sin origen físico.
- ✅ Tests `recovery-concurrencia.test.ts` (doble consumo concurrente, retry offlineId, FALTANTE sin source).
