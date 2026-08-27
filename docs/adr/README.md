# ADRs — Índice

Contrato técnico congelado (plan-maestro-embarques-autocontenido-equipo-desarrollo.md, §19).

| ADR | Contrato | Fase de implementación |
|---|---|---|
| `ADR-FISICO-001` | §8, §9 (ledger físico, sustitución) | FASE 2 |
| `ADR-MONETARIO-001` | §2, §12 (ReceivableEntry, divergencia) | FASE 5 |
| `ADR-CARTERA-001` | §6 (lock CARTERA:clienteId, FIFO) | FASE 0 / 5 |
| `ADR-OBLIGACION-001` | §7 (ObligacionPendiente, tests 34A/B/C) | FASE 3 |
| `ADR-ACTIVIDAD-001` | §1 (Actividad) | FASE 3 |
| `ADR-PROMOCION-001` | §17 (regalos/promociones) | FASE 8 |
| `ADR-CUSTODIA-001` | §8 (custodia) | FASE 2 |
| `ADR-RESPONSABILIDAD-001` | §13 (cargo nunca automático) | FASE 6 |
| `ADR-CIERRE-001` | §6 (lock CIERRE:embarqueId) | FASE 0 / 5 |
| `ADR-CAPACIDAD-001` | §2, §9.1 (capacidadKg mirror) | FASE 8 |
| `ADR-STOCK-001` | §9.1, §10 (availabilityBasis) | FASE 2 |
| `ADR-IDEMPOTENCIA-001` | §14 (offlineId/batchId) | FASE 1 |
| `ADR-CONCURRENCIA-001` | §5, §6 (advisory locks) | FASE 0 / 1 |
| `ADR-OFFLINE-001` | §11 (VentaLibre timestamps) | FASE 7 |
| `ADR-REASIGNACION-001` | §0.2 (reasignación) | FASE 3 |
| `ADR-BOTELLONES-001` | §16 (recogido ≠ entregado) | FASE 8 |
| `ADR-RECUPERACION-001` | §3, §4 (RecoveryDecision) | FASE 4 |
| `ADR-SUSTITUCION-001` | §9 (endpoint HTTP para sustituciones) | FASE 6a (frontend) |
| `ADR-COMUNICACIONES-001` | §0.2 (WhatsApp opcional) | FASE 8 |
| `ADR-MIGRACION-001` | §15, §23, §25 (histórico, expand-contract) | FASE 8 / FINAL |
| `ADR-PRECIO-VOLUMEN-001` | §0.2 (antifraude volumen) | FASE 7 |
| `ADR-AUTORIZACION-REGALOS-001` | §1.1, §17 (autorizaciones) | FASE 8 |

Gate de aprobación: [`GATE-APROBACION.md`](./GATE-APROBACION.md) (§21).
