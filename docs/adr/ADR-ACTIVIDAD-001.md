# ADR-ACTIVIDAD-001 — Actividad

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §1
- Fase de implementación: FASE 3

## Contexto

Se necesita una unidad de trabajo ejecutable que puede planificarse antes de tener un embarque asignado.

## Decisión

- `Actividad` es trabajo ejecutable y **puede existir sin embarque asignado** (`embarqueId` nullable).
- Una Actividad tiene un único `embarqueId` (una asignación por diseño).
- **"Máximo una asignación activa"** (interpretación congelada): no pueden existir dos Actividades activas (`ASIGNADA`/`EN_PROGRESO`) de la MISMA obligación asignadas al MISMO embarque. Se protege con un partial unique index sobre `(obligacionId, embarqueId)` `WHERE estado activo AND embarqueId IS NOT NULL`.
- Múltiples Actividades de la misma obligación en embarques DISTINTOS (o sin embarque) son válidas; la sobre-asignación la previene `chk_obligacion_no_sobreconsumo` + el lock `OBLIGACION:{obligacionId}`.

## Invariantes

- Máx. 1 asignación activa por (obligación, embarque) — constraint DB.
- El lock del cumplimiento es `OBLIGACION:{obligacionId}` (no el de la actividad en sí).

## Estado de implementación (FASE 3)

- ✅ Modelo `Actividad` (con `tipo`, `cantidad`, `cantidadCumplida`, `estado`, `offlineId @unique`).
- ✅ Partial unique index `Actividad_obligacion_embarque_activa_unique`.
- ✅ `ObligacionPendiente` con `chk_obligacion_no_sobreconsumo` + `chk_obligacion_cantidades_no_negativas`.
- ✅ `PedidoCantidadAjuste` con `autorizadoPorId` obligatorio.
- ✅ `AsignarActividadUseCase` bajo lock `OBLIGACION:{obligacionId}`.

## Verificación

Tests §20 "Concurrencia" (34A/34B/34C) en `src/lib/__tests__/integration/obligacion-concurrencia.test.ts`: nunca sobreconsumir.
