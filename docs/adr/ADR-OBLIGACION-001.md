# ADR-OBLIGACION-001 — ObligacionPendiente

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §7
- Fase de implementación: FASE 3

## Contexto

Una obligación comercial pendiente necesita un contador de unidades cumplidas/asignadas/disponibles que nunca se sobreconsume.

## Decisión

Semántica congelada:

```
cantidadOriginal   = cantidad original de la obligación
cantidadCumplida   = unidades ya consolidadas como cumplimiento real
cantidadAsignada   = unidades comprometidas a una Actividad pero NO consolidadas
cantidadDisponible = cantidadOriginal - cantidadCumplida - cantidadAsignada
```

`cantidadDisponible` **no se almacena** (es derivada).

## Invariante

```
cantidadCumplida + cantidadAsignada <= cantidadOriginal
```

Toda operación que incremente `cantidadAsignada` o `cantidadCumplida`:

```
LOCK(obligacionId) → leer → calcular disponible → validar → actualizar
  → crear/actualizar Actividad → COMMIT
```

## Tests obligatorios (§7)

- **34A** — dos operaciones concurrentes.
- **34B** — múltiples operaciones concurrentes.
- **34C** — retry/concurrencia con offlineId.

El resultado debe mantener siempre el invariante. No basta con comprobar que "solo una actividad gana": hay que demostrar que nunca se sobreconsume.

## Verificación

Métrica `obligacion_double_fulfillment_rejected_count`.

## Estado de implementación (FASE 3)

- ✅ Modelo `ObligacionPendiente` (`cantidadOriginal`/`cantidadCumplida`/`cantidadAsignada`; `cantidadDisponible` derivada, NO almacenada).
- ✅ CHECK constraints: `chk_obligacion_no_sobreconsumo` (cumplida+asignada <= original) y `chk_obligacion_cantidades_no_negativas`.
- ✅ Servicio de dominio `obligacion.service.ts` (`calcularDisponible`, `validarAsignacion`, `validarCumplimiento`).
- ✅ `AsignarActividadUseCase` bajo lock `OBLIGACION:{obligacionId}` (contrato §7: LOCK → leer → disponible → validar → actualizar → crear Actividad → COMMIT).
- ✅ Tests 34A/34B/34C en `src/lib/__tests__/integration/obligacion-concurrencia.test.ts` (concurrencia real, nunca sobreconsumir).
