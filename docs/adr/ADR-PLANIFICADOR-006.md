# ADR-PLANIFICADOR-006 — Relación con Actividades / Obligaciones (y cobros/recogidas)

- Estado: **Propuesta** — pendiente de sign-off del PO (gate F0/F1)
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §25, §61 · F0 §1 (#24), tabla de capacidades
- Fase: F1.

## Contexto

Existe un modelo `Actividad` (`prisma/schema.prisma:1136`) de la **Fase 3 de
Embarques (dominio congelado, ADR-ACTIVIDAD-001 / ADR-OBLIGACION-001)**:

- `Actividad` **cuelga de `ObligacionPendiente`** (`obligacionId`, no de `Pedido`
  directamente), opcional `embarqueId`.
- `ActividadTipo { ENTREGA, RECOGIDA_BOTELLON, COBRO }`, `ActividadEstado
  { ASIGNADA, EN_PROGRESO, CUMPLIDA, CANCELADA }`.
- **En producción, todas las `Actividad` creadas son `tipo: 'ENTREGA'`.**
  `COBRO` y `RECOGIDA_BOTELLON` están en el enum pero **nunca se producen**.
- Único consumidor: `AsignarActividadUseCase` (`src/modules/embarques/application/`).

El v4 §25 plantea que una visita de cobro *podría* representarse como actividad,
pero **Cartera queda fuera del MVP**. El v4 §61 pide verificar las estructuras
existentes y decidir si hay integración necesaria, **sin absorber Cartera**.

## Decisión propuesta

### 1. El MVP del planificador es puramente "entregas"

`PlanParada` referencia `pedidoIds` (ADR-PLANIFICADOR-002). **No crea ni referencia
`Actividad`.** La "actividad" en el MVP es implícita: parada de pedido = entrega.

### 2. `RECOGIDA_BOTELLON` y `COBRO` → fuera del MVP

- No se planifican visitas de cobro ni de recogida en v1 (v4 §25, §64 Epic D).
- La lista de sugerencias de llamadas (`scoreLlamada` + `/sugerencias`) sigue
  **independiente** del planificador (F0 §16 / v4 §11).

### 3. Advertencia de acoplamiento para el futuro

Si en un epic posterior el planificador necesita crear/planificar `Actividad`
(entrega + cobro en una parada, o recogida de botellón):

- **`Actividad` está atada a `ObligacionPendiente`** (dominio congelado). Agregarle
  un `planParadaId`, o desacoplarla de `ObligacionPendiente`, o crear un tipo de
  actividad "de plan" → **requiere un ADR de Embarques aprobado primero.**
- **No hacerlo por la vía rápida** (no `db push` de un campo nuevo en un modelo
  congelado sin ADR).
- La integración de cobro además necesita: leer una señal `COBRO_CANDIDATO` de
  Cartera (**solo lectura**), sin calcular saldo, sin registrar pago, sin conciliar
  (v4 §25). Eso es un ADR de integración Planificador↔Cartera separado.

### 4. Qué SÍ puede leer el planificador de estos dominios (contexto, no propiedad)

Para **mostrar contexto** en la UI de revisión (no para decidir):
- que un cliente del plan tiene deuda vencida (badge informativo) — lectura de un
  campo ya expuesto, sin lógica financiera.

Nada de esto entra en la función objetivo del motor en el MVP.

## Qué falta decidir / evidencia pendiente

- ¿`ObligacionPendiente` con entregas parciales pendientes debe verse como
  "demanda" para el planificador? Hoy el planificador mira `Pedido`, no
  `ObligacionPendiente`. Si un pedido quedó parcialmente entregado y tiene saldo
  pendiente, ¿ese saldo es un candidato a planificar? → **Propuesta MVP: no** — el
  planificador mira pedidos con `estadoEntrega IN (PENDIENTE, NO_ENTREGADO)`; los
  parciales los maneja el flujo de Embarques/Obligaciones. Revisar con datos reales.
- El orden de los epics post-MVP (Cartera antes o después de afinidad
  cliente↔cliente) — decisión de producto, no técnica.

## Consecuencias

- El MVP no toca el dominio congelado de Embarques ni el de Cartera.
- Cobros y recogidas son epics post-MVP, cada uno con su propio ADR de integración.
- Riesgo: si el negocio pide "planificar cobros" temprano, hay que hacer el ADR de
  Embarques + el de Cartera antes — no es un add-on trivial.

## Verificación (cuando se implemente)

N/A para el MVP (no hay integración). El test relevante es negativo: el
planificador **no** escribe `Actividad` ni `ObligacionPendiente` ni toca cartera
(revisión de que ningún repo/use-case del planificador los importe para escritura).
