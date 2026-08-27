# ADR-SUSTITUCION-001 — Endpoint HTTP para registrar sustituciones

- Estado: Aceptado
- Fecha: 2026-08-27
- Fuente: plan de convergencia de embarques, A.3.3 (revisión 2026-08-27 — el PO confirmó que la UI de sustitución es necesaria)
- Fase de implementación: FASE 6a (previo a Mission Detail / FASE 5)

## Contexto

El contrato de backend (`plan-maestro-embarques-autocontenido-equipo-desarrollo.md` §9, ADR-FISICO-001) define la **sustitución** como una operación de negocio que produce **dos hechos físicos separados**:

1. Recepción de la unidad defectuosa: `RETORNO` (repartidor → inspección).
2. Entrega de la unidad de reemplazo: `ENTREGA` (repartidor → cliente).

La entidad `Sustitucion` vincula ambos movimientos (`movimientoRecepcionId`, `movimientoEntregaId`).

El dominio ya implementa esto:
- `construirMovimientosSustitucion({ producto, cantidad })` en `ledger-fisico.service.ts` — construye los dos `MovimientoFisicoInput`.
- Modelo `Sustitucion` en `schema.prisma` (con `offlineId @unique`, `autorizadoPorId?`, `pedidoId?`).
- Tests de dominio en `ledger-fisico.service.test.ts`.

**Gap (auditoría B.6):** ningún `route.ts` invoca `construirMovimientosSustitucion`. Un grep completo confirma que no hay caller fuera de dominio/tests. La operación es **inalcanzable desde cualquier cliente**.

## Decisión

Exponer la operación —ya modelada y testeada— vía un endpoint HTTP nuevo:

- `POST /api/embarques/[id]/sustituciones` — thin controller. Valida Zod (`SustitucionEmbarqueSchema` en `validators.ts`), `requireRole([ADMIN, ASISTENTE])` + `requireOwnership`, llama `construirMovimientosSustitucion`, valida ambos movimientos con `validarMovimientoFisico`, y persiste en **una transacción**: 2 `EmbarqueMovimiento` (`RETORNO` + `ENTREGA`) + 1 `Sustitucion` que los vincula. `logAudit`. Realtime `embarque.updated`.
- `GET /api/embarques/[id]/sustituciones` — lista para el tab "Físico" del detalle.

**Idempotencia:** `Sustitucion.offlineId @unique`. Un replay con el mismo `offlineId` devuelve la sustitución existente (`deduped: true`), sin crear movimientos nuevos.

**Sin lock explícito:** a diferencia de `recovery` SOBRANTE, una sustitución no consume de un evento físico de origen — solo apéndice al ledger. Una transacción simple basta (mismo criterio que `botellones`).

## Alcance — mismo producto

`construirMovimientosSustitucion` toma **un solo `producto`**: la sustitución es "esta unidad vino defectuosa, acá va una unidad fresca **del mismo producto**". El ejemplo del contrato §9 es explícitamente same-product.

**Fuera de alcance:** sustitución cruzada de producto (entregar PACA_HIELO en vez de PACA_AGUA defectuosa). Si el negocio lo necesita, es un cambio del dominio (`construirMovimientosSustitucion` + posible ajuste de precio/obligación) y requiere su propio ADR.

## Consecuencias

- `src/app/api/embarques/[id]/sustituciones/route.ts` — nuevo, thin.
- `SustitucionEmbarqueSchema` en `src/lib/validators.ts`.
- `02-api-contract.md` §9 pasa de "NO EXISTE AÚN" a documentado.
- No cambia schema (todo el modelo ya existe), ni locks, ni fuentes de verdad. Es additivo puro.
- La UI (`mission-detail/sustitucion-form-modal.tsx`) se construye en FASE 6b, dentro del tab "Físico".
