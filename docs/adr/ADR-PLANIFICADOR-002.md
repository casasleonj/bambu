# ADR-PLANIFICADOR-002 — Elegibilidad y trazabilidad Pedido ↔ Plan

- Estado: **Aceptado** (gate F0/F1) — decisión delegada al asistente por el PO el 2026-08-30; revisable en cualquier momento
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §8, §20, §21, §57 · F0 §2 · precisión del PO (FK como propuesta, no hecho)
- Fase: F1. Bloquea F2.

## Contexto

`Pedido` (`prisma/schema.prisma:640`) lleva **estados desacoplados**: `estado`
(`EstadoPedido`, legacy), `estadoEntrega` (canónico), `estadoPago`, más `origen`
(`PEDIDO | VENTA_RAPIDA | VENTA_LIBRE | RECURRENTE`) y `canal`
(`DOMICILIO | PUNTO`). **No existe `fechaProgramada`** — solo `fecha` (creación),
`fechaEntrega` (al entregar), `horaPreferida`. `NO_ENTREGADO` **no vuelve solo a
`PENDIENTE`** (verificado en F0). Hoy `computePreview` usa
`estado='PENDIENTE' AND embarqueId IS NULL`, sin filtro de fecha.

El PO fijó: **no asumir una FK dura Plan↔Pedido**; este ADR decide trazabilidad
**y cardinalidad**. Un pedido puede: entrar a la propuesta v1 → moverse de grupo →
quedar fuera de v2 → volver a ser elegible → terminar en un embarque. El plan no
debe ser dueño de la vida del pedido.

## Decisión

### 1. "Pedido elegible para la fecha F"

Un pedido entra al cálculo del plan de F si **todo** lo siguiente es cierto:

- `estadoEntrega IN ('PENDIENTE', 'NO_ENTREGADO')`
- `embarqueId IS NULL`
- `canal = 'DOMICILIO'`
- `origen IN ('PEDIDO', 'RECURRENTE')` — y `VENTA_RAPIDA` **solo si** `canal='DOMICILIO'`
- `clienteId <> 'CONSUMIDOR_FINAL'` **o** el pedido tiene `direccionEntrega`/coords propias
- **fecha-elegible(F):** el pedido no tiene una fecha solicitada futura > F. Como
  no hay `fechaProgramada`, el MVP usa: `date(fecha) <= F` **o** el pedido fue
  reprogramado por Ejecución con fecha ≤ F. Si Pedidos/Ejecución expone en el
  futuro una fecha solicitada explícita, el planificador la consume — **no inventa
  la regla** (v4 §20-21).

El caso "planificado → embarcado → no entregado → cliente dice mañana" (v4 §21):
Ejecución/Pedidos setea el estado y la fecha; el planificador **lee** el resultado.
Si queda elegible para mañana, entra en el plan de mañana. **Rutas nunca
reintroduce el pedido al plan de hoy por decisión propia.**

Implementación: extender `src/lib/pedidos-sin-asignar.ts` (`whereAtrasadosSinAsignar`
ya cubre parte) con un `wherePedidosElegiblesPlan(fecha)`.

### 2. Trazabilidad Plan ↔ Pedido: referencia por ID, no FK

`PlanParada.pedidoIds String[]` — **referencia, sin foreign key**.

Opciones consideradas:
- **A) FK `PlanParada.pedidoId`:** obliga a `onDelete` cascada/SetNull y complica
  el movimiento entre versiones/grupos. Rechazada.
- **B) Tabla join `PlanParadaPedido`:** integridad referencial pero mismo problema
  de cascada + más superficie. Rechazada para el MVP.
- **C) `pedidoIds String[]` + validación en aplicación (elegida):** máxima
  fluidez. La integridad ("el pedido existe y sigue elegible") se valida **al
  generar y al confirmar**, no por constraint de BD.

**Cardinalidad (invariante de aplicación):** dentro de **una versión** de `PlanDia`,
un `pedidoId` aparece en **exactamente una** `PlanParada`. Entre versiones
distintas, libre. Se valida al construir el plan y en un test de invariante.

Índice: GIN sobre `PlanParada.pedidoIds` para "¿en qué plan/parada está el pedido X?".

### 3. Comportamiento ante cambios del pedido

Un pedido referenciado que se cancela / cambia de cantidad / cambia de dirección
**no dispara cascada de BD**. Dispara un **trigger de replanificación**
(ADR-PLANIFICADOR-005) que el motor detecta releyendo el estado real. Hasta que se
replanifica y confirma, el plan vigente conserva el `snapshotCantidades` de cuando
se generó — es evidencia de "qué sabía el plan", no fuente de verdad.

### 4. Snapshot en la parada

`PlanParada.snapshotCantidades` + `ubicacionUsada` guardan lo que el motor usó al
generar (cantidades por producto, dirección/coords efectivas, calidad de
ubicación). Propósito: reproducibilidad y diff claro en la replanificación. **No
es fuente de verdad** — la verdad de cantidades es `Pedido`/`PedidoItem`.

### 5. Materialización

El vínculo físico sigue siendo `Pedido.embarqueId`, que lo setea el flujo de
Embarques existente al materializar (ADR-PLANIFICADOR-003). El planificador **no
escribe `Pedido`**.

## Qué falta decidir / evidencia pendiente

- ¿Pedidos con múltiples entregas parciales pendientes cuentan como uno o varios
  candidatos? (depende del contrato de `ObligacionPendiente` — ver ADR-PLANIFICADOR-006).
- ¿El planificador puede proponer pedidos `RECURRENTE` **antes** de que el cron los
  genere? → No en el MVP: solo pedidos ya existentes. (Preventa = post-MVP.)

## Consecuencias

- Cero cambios en el modelo `Pedido`. Cero cascadas.
- El precio: no hay integridad referencial de BD entre plan y pedido — se paga con
  validación en aplicación y un test de invariante de cardinalidad.
- El diff de replanificación es explícito y auditable.

## Verificación (cuando se implemente)

Unit: `wherePedidosElegiblesPlan` (todos los casos de estado), invariante "un
pedido = una parada por versión", detección de "pedido cambió". Integration:
generar plan → cancelar un pedido → replan marca el diff.
