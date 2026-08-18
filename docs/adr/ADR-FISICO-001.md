# ADR-FISICO-001 — Ledger físico: EmbarqueMovimiento

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §8, §9
- Fase de implementación: FASE 2

## Contexto

El sistema necesita un ledger físico canónico que registre cada hecho de custodia/inventario de forma dirigida e inequívoca, sin depender del signo de una columna para interpretar el efecto.

## Decisión

`EmbarqueMovimiento.cantidad` es siempre positiva. El efecto se determina por el **tipo** de movimiento, nunca por el signo de `cantidad`.

| Tipo | Efecto |
|---|---|
| `CARGA` | + custodia del vehículo/carga |
| `RECARGA` | + custodia del vehículo/carga |
| `ENTREGA` | - custodia hacia cliente |
| `VENTA_RUTA` | - custodia hacia venta espontánea |
| `RETORNO` | - custodia del repartidor, + custodia de inspección |
| `REEMPAQUE` | neutro en cantidad total; puede reclasificar |
| `DESCARTE` | - salida definitiva |
| `CUSTODY_TRANSFER` | - origen / + destino |
| `PROMOCION` | consume inventario como una entrega, sin cobro |
| `AJUSTE_AUTORIZADO` | efecto explícito `INCREASE` o `DECREASE` |

`AJUSTE_AUTORIZADO` exige `metadata.effect` (`"INCREASE"` o `"DECREASE"`), `authorization != NULL` y `userId != NULL`. Sin `metadata.effect` válido, el movimiento se rechaza.

## Invariantes

- `cantidad > 0` siempre.
- Entrada/salida es inequívoca por tipo.
- Custodia es inequívoca (origen/destino explícitos).

## Sustitución (contrato §9)

Una sustitución NO es un movimiento ambiguo que quite y agregue inventario simultáneamente. Es una operación de negocio que produce **dos hechos físicos separados**, vinculados por la entidad `Sustitucion`:

1. `RECEPCION_DEFECTUOSA` (repartidor → inspección).
2. `ENTREGA` (repartidor → cliente).

Regla: un `EmbarqueMovimiento` representa un hecho físico dirigido; si una operación tiene dos efectos independientes, produce dos movimientos.

## Verificación

Tests §20 "Físico": carga, entrega, venta de ruta, retorno, reempaque, descarte, transferencia de custodia, promoción, ajuste autorizado, sustitución como dos hechos.

## Estado de implementación (FASE 2)

- ✅ Enums `TipoMovimiento` (10 tipos de §8) y `AvailabilityBasis` (§10).
- ✅ Modelos `EmbarqueCarga`, `EmbarqueCargaProducto`, `EmbarqueMovimiento`, `Sustitucion`, `Retorno` (con relaciones a `Embarque`, `Pedido`, `User`).
- ✅ CHECK constraints en DB (migración `20260817_add_ledger_fisico`): `cantidad > 0` en movimiento/carga-producto/retorno, y `AJUSTE_AUTORIZADO` exige `authorization` + `userId` + `metadata.effect` válido.
- ✅ Servicio de dominio `src/modules/embarques/domain/services/ledger-fisico.service.ts`: `validarMovimientoFisico` + `construirMovimientosSustitucion`.
- ✅ Tests: unit (`ledger-fisico.service.test.ts`) + integración (`ledger-fisico-constraints.test.ts`).

Nota de interpretación: el ejemplo de §9 usa el tipo `RECEPCION_DEFECTUOSA` (repartidor → inspección), que coincide con `RETORNO` de la tabla obligatoria §8. Se implementa como `RETORNO` con metadata `motivo: DEFECTUOSA`.

## Estado de implementación (FASE FINAL)

- ✅ `RegistrarMovimientosCierre` (dual-write §23): al cerrar un embarque se escriben `ENTREGA`/`VENTA_RUTA`/`RETORNO` como `EmbarqueMovimiento` (hecho físico dirigido), además de la conciliación legacy. Conectado a `CerrarEmbarqueUseCase`. No escribe movimientos para cantidades cero (§15).
