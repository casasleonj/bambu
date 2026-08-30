# ADR-PLANIFICADOR-006 — Relación con Actividades / Obligaciones (y cobros/recogidas)

- Estado: **Aceptado** (gate F0/F1) — decisión delegada al asistente por el PO el 2026-08-30; revisable en cualquier momento
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §18, §25, §61 · F0 §1 (#24) · decisión del PO 2026-08-30 ("cobros sí se va a necesitar")
- Fase: F1.

## Contexto

Existe un modelo `Actividad` (`prisma/schema.prisma:1136`) de la **Fase 3 de
Embarques (dominio congelado, ADR-ACTIVIDAD-001 / ADR-OBLIGACION-001)**:

- `Actividad` **cuelga de `ObligacionPendiente`** (`obligacionId`, no de `Pedido`),
  opcional `embarqueId`.
- `ActividadTipo { ENTREGA, RECOGIDA_BOTELLON, COBRO }`, `ActividadEstado
  { ASIGNADA, EN_PROGRESO, CUMPLIDA, CANCELADA }`.
- **En producción, todas las `Actividad` son `tipo: 'ENTREGA'`.** `COBRO` y
  `RECOGIDA_BOTELLON` están en el enum pero **nunca se producen**.

**El PO confirmó (2026-08-30) que planificar visitas de cobro se va a necesitar**
— no es un "si el negocio lo pide". Es un epic comprometido, inmediatamente
después del MVP de entregas.

## Decisión

### 1. Diseñar el schema para cobros ahora; implementar solo entregas en el MVP

- `PlanParada` tiene hijos `PlanActividad` (`tipo: ENTREGA | COBRO |
  RECOGIDA_BOTELLON`) desde el inicio (ADR-PLANIFICADOR-001 §1). El enum y las
  tablas ya acomodan cobro/recogida.
- **El MVP genera y materializa solo `PlanActividad tipo=ENTREGA`.** El motor no
  produce actividades de cobro; la materialización solo mira `ENTREGA`
  (ADR-PLANIFICADOR-003 §2).
- Esto evita retrofitear el schema cuando llegue el epic de cobros.

### 2. `PlanActividad` NO es el modelo `Actividad` de Embarques

`PlanActividad` es un concepto **de la capa de planificación**. `Actividad`
(congelado) cuelga de `ObligacionPendiente` y es del dominio de Embarques. Son
cosas distintas. El MVP no crea ni referencia `Actividad`.

### 3. Epic "Cobros en el plan" (post-MVP inmediato) — prerequisitos

Antes de implementar `PlanActividad tipo=COBRO` hacen falta **dos ADRs nuevos**:

| ADR | Decide | Dominio |
|---|---|---|
| `ADR-EMBARQUES-ACTIVIDAD-PLAN` (nuevo) | cómo se materializa una actividad de cobro planificada: ¿extiende `Actividad` con un origen "plan"? ¿la desacopla de `ObligacionPendiente`? ¿un modelo nuevo? Toca **dominio congelado** → requiere el flujo de ADR de Embarques. | Embarques |
| `ADR-PLANIFICADOR-CARTERA` (nuevo) | qué señal lee el planificador de Cartera (`COBRO_CANDIDATO` = cliente con deuda vencida elegible para visita), **solo lectura**. Sin calcular saldo, sin registrar pago, sin conciliar (v4 §25). | Planificador ↔ Cartera |

Estos ADRs se abren **al arrancar el epic de cobros**, no ahora — pero quedan
nombrados como parte del roadmap comprometido (no "si acaso").

### 4. Qué SÍ puede leer el planificador en el MVP (contexto, no decisión)

- Badge informativo "este cliente tiene deuda vencida" en la UI de revisión —
  lectura de un campo ya expuesto, sin lógica financiera. No entra en la función
  objetivo del motor.

### 5. `RECOGIDA_BOTELLON`

Mismo tratamiento que `COBRO`: schema preparado (`PlanActividadTipo`), fuera del
MVP, epic posterior. Probablemente más simple que cobro (no toca Cartera; sí
podría tocar el ledger físico de botellones de Embarques → ADR-BOTELLONES).

## Qué falta decidir / evidencia pendiente

- ¿`ObligacionPendiente` con entregas parciales pendientes es "demanda" para el
  planificador? **Propuesta MVP: no** — el planificador mira `Pedido`
  (`estadoEntrega IN (PENDIENTE, NO_ENTREGADO)`); los parciales los maneja
  Embarques/Obligaciones. Revisar con datos reales del piloto.
- Orden exacto del epic de cobros vs. el de afinidad cliente↔cliente — producto.
- El diseño fino de `COBRO_CANDIDATO` (¿lo expone Cartera hoy? probablemente hay
  que agregarlo) — al abrir `ADR-PLANIFICADOR-CARTERA`.

## Consecuencias

- El **schema** del MVP ya soporta cobros (tabla `PlanActividad` + enum). El
  **código** del MVP es entregas-only.
- Cobros deja de ser "epic difuso post-MVP" y pasa a ser el siguiente epic
  concreto, con sus 2 ADRs prerequisito nombrados.
- El MVP no toca dominio congelado de Embarques ni de Cartera.

## Verificación (cuando se implemente)

MVP: test negativo — ningún repo/use-case del planificador importa `Actividad` /
`ObligacionPendiente` / cartera para escritura; el motor solo emite
`PlanActividad tipo=ENTREGA`; `MaterializarPlanUseCase` ignora otros tipos.
