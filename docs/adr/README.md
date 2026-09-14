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

---

## Rutas + Planificador de Distribución (dominio nuevo — **Aceptado**, gate F0/F1)

Base: `docs/rutas/INVENTARIO_CAPACIDADES_DISTRIBUCION.md` (F0) + Plan Técnico v4.
Los 6 ADRs están **Aceptados** (decisión delegada al asistente por el PO, 2026-08-30;
revisables en cualquier momento) e implementados vía PR #144.
Corrección 2026-09-12: este epígrafe decía "Propuesta — no están aceptados", en
contradicción con el `Estado: Aceptado` de cada archivo individual desde su fecha
de creación. Era una inconsistencia de índice, no de contenido.

| ADR | Decide | Fase |
|---|---|---|
| `ADR-PLANIFICADOR-001` | representación del plan, persistencia, sync/async, estados, contrato HTTP | F1 → F2 |
| `ADR-PLANIFICADOR-002` | elegibilidad de pedido, trazabilidad Plan↔Pedido (ref por ID, no FK), cardinalidad | F1 → F2 |
| `ADR-PLANIFICADOR-003` | contrato Planificador → Embarques (materialización; `/api/embarques/auto` **deprecado**; fallo parcial) | F1 (P0) |
| `ADR-PLANIFICADOR-004` | modelo geográfico, calidad de ubicación, proximidad de barrios, backfill — **parcialmente supersedido**, ver `ADR-TERRITORIO-001` | F1 → F2 |
| `ADR-PLANIFICADOR-005` | replanificación, estabilidad, versionado, concurrencia, conflicto offline | F1 → F2/F3 |
| `ADR-PLANIFICADOR-006` | `PlanActividad` (ENTREGA/COBRO/RECOGIDA) en schema; MVP solo ENTREGA; cobros = epic siguiente | F1 |

ADRs prerequisito nombrados (se abren al arrancar el epic de cobros, no ahora):
`ADR-EMBARQUES-ACTIVIDAD-PLAN`, `ADR-PLANIFICADOR-CARTERA`.

Nota: la numeración de fases de este epic (F0, F1, F2...) es independiente de la
numeración de fases del ALS Barrio/Zona (ver abajo). No mezclar "F2" de un epic
con "F2" del otro — usar el prefijo del dominio al referirse a una fase.

---

## Territorio — Barrio canónico + Zona (dominio nuevo — **Aceptado**, F1 implementada)

Base: ALS "Barrio canónico + Zona territorial + Clientes + Distribución/Rutas" v1.0
(2026-09-09) + Plan Técnico Barrio/Zona v1.0 (2026-09-09), preservados en
`docs/territorio/`. Fases propias del ALS Barrio/Zona: F0 (baseline/ADRs) → F1
(Barrio canónico) → F2 (migración segura) → F3 (Zona) → ... → F9 (verificación
final) — **distintas** de las fases del epic Planificador de arriba.

| ADR | Decide | Fase |
|---|---|---|
| `ADR-TERRITORIO-001` | reconciliación con `ADR-PLANIFICADOR-004`: Barrio es identidad territorial, no geometría; qué reglas geográficas de `ADR-PLANIFICADOR-004` siguen vigentes | F1 (implementada vía PR #248) |

F2 (migración segura, matching/backfill legacy) está especificada pero **no
implementada** — ver `docs/territorio/ESPECIFICACION_F2.md` para el detalle
clasificado (confirmado / implementado / obsoleto / reconciliado / propuesta /
pendiente) y las brechas plan ↔ código registradas.
