# Modelo de excepciones — Embarques (Fase 1)

- Estado: **APROBADO** (PO, 2026-08-27)
- Fecha: 2026-08-20 · Aprobado: 2026-08-27
- Base: tabla A.6 del plan de convergencia. Cada tipo de excepción de UI mapea a un **origen real y verificable** en backend; no se inventa una taxonomía nueva en el frontend.

## Tabla de mapeo

| Tipo de excepción (UI) | Origen real en backend |
|---|---|
| `STOCK_INSUFFICIENT` | Error `STOCK_INSUFFICIENT`/`STOCK_EXCEDIDO` de `EmbarqueValidationService.validarStock` |
| `CAPACITY_EXCEEDED` | Error `PESO_EXCEDIDO` de `validarCapacidadPeso`; exceso de `MAX_UNIDADES_EMBARQUE` |
| `NO_DRIVER_AVAILABLE` | `NO_REPARTIDORES` de `POST /api/embarques/auto` |
| `PHYSICAL_MISMATCH` | `RecoveryDecision` tipo `SOBRANTE`/`FALTANTE`; discrepancia de `EmbarqueProducto` (`conciliarProductos`) |
| `MONEY_MISMATCH` | `faltanteEfectivo` > `UMBRAL_MINIMO_FALTANTE_CAJA` → `ResponsibilityCase` tipo `FALTANTE_CAJA` |
| `DELIVERY_FAILED` | Rama `NO_ENTREGADO` de `ProcesarPedidoService` |
| `MISSING_DATA` | Cualquier 400 de validación Zod no cubierto arriba |
| `DOBLE_CONSUMO` | `CrearRecoveryDecisionUseCase` — un SOBRANTE ya fue consumido por otra decisión concurrente |
| `SUSTITUCION_INVALIDA` | `validarMovimientoFisico` sobre los 2 movimientos de `construirMovimientosSustitucion` (Fase 6) — cantidad ≤ 0, producto desconocido, o el par recepción/entrega no cuadra |

## Reglas de presentación

1. Cada tipo se muestra con el mensaje del backend, no con un texto reescrito en el frontend (salvo traducción de UX aprobada).
2. `DOBLE_CONSUMO` es nueva respecto al plan original (la añade la auditoría) — solo aparece bajo concurrencia real de recovery.
3. Si durante la Fase 2 aparece un caso real adicional, se añade a la tabla **con su origen citado**; no se agregan tipos especulativos.

## Categorías de decisión (contexto, no excepción por sí mismas)

Las excepciones alimentan el modelo de decisiones AUTO / REVISIÓN / EXCEPCIÓN / BLOQUEO (§A.5 del plan). Una excepción de la tabla de arriba es la **evidencia** que eleva una decisión de AUTO a REVISIÓN/EXCEPCIÓN, o a BLOQUEO si la regla del backend la rechaza de plano.
