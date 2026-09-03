# Cumplimiento parcial, prepago y replanificación PUNTO → DOMICILIO
## Arquitectura de ataque — v1.1

**Estado:** ARQUITECTURA DE ATAQUE (ya no hipótesis) — para ejecución del equipo
**Prioridad:** P0 / integridad de dominio y trazabilidad monetaria
**Fecha:** 2026-09-02
**Supersede:** `AGUA_BAMBU_PLAN_...CUMPLIMIENTO_PARCIAL_REPLANIFICACION_v13.md` y `AGUA_BAMBU_ALS_CUMPLIMIENTO_PARCIAL_REPLANIFICACION_v1.als` (ambos partían de la hipótesis "crear/evaluar una entidad `Fulfillment`", ahora descartada — ver §1).
**No modifica el Contexto Maestro.** Es una evolución trazable del plan técnico/producto.

---

## 1. Historial y qué cambió

| Momento | Planteamiento | Estado |
|---|---|---|
| Propuesta anterior (v13 / ALS v1) | Evaluar/crear una entidad `Fulfillment` nueva: `Pedido → Fulfillment → Embarque` | **SUPERADO** |
| Auditoría del repo (2026-09-02) | El repo YA tiene `Pedido → ObligacionPendiente → Actividad → Embarque`, con ADRs congelados (`ADR-OBLIGACION-001`, `ADR-ACTIVIDAD-001`, 2026-08-16, "FASE 3"), constraints, lock, use-case y tests de concurrencia — pero **sin conectar al ciclo de vida real del pedido** | HALLAZGO |
| Nueva conclusión | **NO crear `Fulfillment`.** Reutilizar y conectar progresivamente la arquitectura existente. Crear una segunda abstracción paralela sería exactamente la duplicación que hay que evitar (mismo riesgo que la Fase 0 de Pedidos). | **DECISIÓN DE PLANEAMIENTO** |
| Corrección monetaria del Caso B | Para el Caso B (entrega parcial sin cambio de canal) **no hay que mover ni reasignar dinero. Hay que dejar de destruirlo.** El dinero se queda dentro del `Pedido` padre. | **DECISIÓN DE PLANEAMIENTO** |

---

## 2. Estado técnico actual (auditoría con evidencia)

### 2.1 El bug monetario — CONFIRMADO

**`Pedido.entregar()`** (`src/modules/pedidos/domain/entities/Pedido.ts:169-216`) hace dos cosas indebidas en una entrega parcial:

1. **Fuerza `estadoEntrega = ENTREGADO`** (línea 200). `puedeEntregar()` solo valida la transición de estado, no exige entrega completa. No existe un camino de "entrega parcial que deja el pedido abierto".
2. **Recalcula** `total = Σ subtotalEntregado` y `totalPagado = min(totalPagado, nuevoTotal)` (líneas 181-196). El `min` protege el CHECK `totalPagado <= total` pero **destruye el prepago**: 10 pagadas ($10.000) → entrega 6 → `total` y `totalPagado` bajan a $6.000. Los $4.000 desaparecen del pedido.

**`crearPedidoHijo()`** (`Pedido.ts:337-363` + copia en `procesar-pedido.service.ts:411-479`): crea el hijo con `totalPagado: 0, saldo: totalHijo`. El hijo nace debiendo $4.000 que el cliente ya pagó. (El **precio** sí se hereda por item — `Pedido.ts:343` — el snapshot histórico se preserva. El problema es solo el dinero y que conceptualmente es una "venta nueva".)

**Resultado:** 10 pagadas → 6 entregadas → padre $6.000/$6.000 + hijo $4.000 por cobrar → **$4.000 de deuda artificial**.

### 2.2 `PAGOS_EXCEDIDOS` en el cierre de embarque — CONFIRMADO, más serio de lo que parecía

- `procesar-pedido.service.ts:225-227`: `if (montoPagadoTotal > totalReal * 1.01) throw 'PAGOS_EXCEDIDOS'`.
- El asistente de cierre (`src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx:131-133`) **precarga `cuadre.pagos` desde los pagos existentes del pedido**.
- Prepago $10.000 + entrega 6 ($6.000) → `$10.000 > $6.060` → **el cierre del embarque falla**.
- El operador "lo arregla" bajando el pago a $6.000 → **convierte un problema de modelo en una operación manual que destruye información financiera**.

**La causa raíz:** el cierre no distingue *"dinero recibido históricamente"* (antes del viaje) de *"dinero cobrado durante esta ejecución"*. `coleccionarPagos()` (`cerrar-embarque-caja.helper.ts`) suma **todos** los `Pago` del pedido, sin importar dónde/cuándo se capturaron; `calcularCaja()` (`cierre-embarque.service.ts:147-175`) mete los EFECTIVO en `efectivoEsperado`. Un pedido pagado en efectivo en el mostrador y luego entregado en ruta hace que el repartidor "deba" ese efectivo que nunca tocó.

### 2.3 La arquitectura `ObligacionPendiente` / `Actividad` — YA EXISTE, sin conectar

| Concepto | Entidad existente | Evidencia |
|---|---|---|
| Qué compró el cliente | `Pedido` (`plan-maestro-v11.1` §1: "obligación comercial") | canónico |
| Qué cantidad falta cumplir | **`ObligacionPendiente`** (`cantidadOriginal/Cumplida/Asignada`, `cantidadDisponible` derivada, `estado ABIERTA\|CUMPLIDA\|ANULADA`, `offlineId @unique`) | `schema.prisma:1162`, `ADR-OBLIGACION-001` |
| Qué ejecución concreta | **`Actividad`** (`obligacionId`, `embarqueId` **nullable**, `tipo ENTREGA\|RECOGIDA_BOTELLON\|COBRO`, `cantidad`, `cantidadCumplida`, `estado ASIGNADA\|EN_PROGRESO\|CUMPLIDA\|CANCELADA`, `offlineId @unique`) | `schema.prisma:1183`, `ADR-ACTIVIDAD-001` |
| Misión logística | `Embarque` | canónico |

**Construido:**
- Schema + `chk_obligacion_no_sobreconsumo` (`cumplida + asignada <= original`) + `chk_obligacion_cantidades_no_negativas`.
- Partial unique index `Actividad_obligacion_embarque_activa_unique` ("máx 1 asignación activa por obligación/embarque").
- Servicio de dominio `obligacion.service.ts` (`calcularDisponible`, `validarAsignacion`, `validarCumplimiento`).
- `AsignarActividadUseCase` bajo lock `OBLIGACION:{obligacionId}` con idempotencia por `offlineId`, métrica `obligacion_double_fulfillment_rejected_count`.
- Ruta `POST /api/obligaciones/[id]/asignar` (RBAC ADMIN/ASISTENTE).
- Tests `src/lib/__tests__/integration/obligacion-concurrencia.test.ts` (34A/34B/34C — concurrencia real, "nunca sobreconsumir").

**NO construido / brecha plan ↔ código:**
- **Nada CREA una `ObligacionPendiente` en código de producción** (solo en tests). El planificador y la asignación a embarque siguen operando sobre `Pedido.embarqueId` directo.
- `ObligacionPendiente` son **solo contadores de CANTIDAD** — sin ningún campo de dinero.
- `Actividad` **no tiene `modo` (PUNTO/DOMICILIO)**.

### 2.4 Fragmentación: 3 modelos parcialmente solapados de "trabajo a entregar"

| Modelo | Dónde | Estado | Vínculo |
|---|---|---|---|
| `PlanDia→PlanGrupo→PlanParada→PlanActividad` (`pedidoIds: String[]`, ADR-PLANIFICADOR-002) | planificador | **activo** | materializa a `Pedido.embarqueId` (`marcarGrupoMaterializado`) |
| `ObligacionPendiente → Actividad` | ADR-OBLIGACION/ACTIVIDAD-001 | **congelado, sin wirear** | ninguno con `PlanActividad` |
| ejecución sobre `Pedido.embarqueId` directo | `procesarPedidoService`, `crearPedidoHijo` | **activo** | — |

`PlanActividad` y `Actividad` **no se referencian entre sí**. Reconciliarlos es parte del Nivel 2.
(Ojo adicional: hay un tercer uso del término "actividad" — `derivarActividad(embarque)` del Command Center — que es solo un resumen de UI de contadores del ledger físico, no una entidad.)

### 2.5 Dinero: NO existe reserva por obligación

Rutas de `Cliente.saldoFavor` (verificadas):
- **Acreditación:** `pagar-fiado` (sobrante FIFO, excluye `CONSUMIDOR_FINAL`), `CrearPedidoUseCase:241` (overpayment).
- **Consumo:** `CrearPedidoUseCase:199-202` — **cualquier pedido nuevo del cliente consume `saldoFavor` hasta `total`, greedy, sin earmark.**

`plan-maestro-v11.1` §2 marca `Cliente.saldoFavor` canónico como **crédito general del cliente**, no dinero comprometido. Acreditar $4.000 y que el cliente compre otra cosa antes de recibir el pendiente → se consume. **`saldoFavor` NO puede representar "dinero reservado a la obligación #1050".**

No existe `AplicacionPago` / `PaymentAllocation` / `montoReservado` en ninguna parte del repo. Únicos contenedores de dinero: `Pedido.totalPagado/saldo` (canónico per-pedido), `Pago`/`Abono` (hechos), `Cliente.saldoFavor` (crédito general), `ReceivableEntry` (proyección de auditoría, nunca fuente).

`Pago` (`schema.prisma:878`) **no tiene campo de contexto de captura** (`embarqueId`, "mostrador", etc.). Solo `{pedidoId, metodo, monto, offlineId, createdAt, confirmacion}`.

---

## 3. Invariante monetario (corregido)

La formulación anterior del gate (`padre.total == padre.totalPagado mientras haya pendientes`) **solo es válida para prepago total**. El invariante universal es:

> El `total` económico del `Pedido` permanece asociado a la obligación completa mientras existan cantidades pendientes. `totalPagado` representa el dinero realmente recibido, independientemente de cuánto se haya entregado físicamente.
>
> **`saldo = total − totalPagado`**  (NUNCA `saldo = total_de_lo_entregado − totalPagado`)

El segundo cálculo es precisamente el origen del bug.

| Caso | comprado | pagado | entregado | `total` | `totalPagado` | `saldo` | pendiente |
|---|---|---|---|---|---|---|---|
| A — prepago completo | 10 ($10.000) | $10.000 | 6 | 10.000 | 10.000 | 0 | 4 |
| B — pago parcial | 10 ($10.000) | $6.000 | 6 | 10.000 | 6.000 | 4.000 | 4 |
| C — sin pago | 10 ($10.000) | $0 | 6 | 10.000 | 0 | 10.000 | 4 |
| segunda entrega (desde A) | 10 | $10.000 | 10 | 10.000 | 10.000 | 0 | 0 → `ENTREGADO` |

**Gate de cierre del bug** (no se considera resuelto sin demostrarlo, con test):

```
dinero recibido histórico
  = dinero aplicado a lo entregado
  + dinero correspondiente a lo pendiente   (vive DENTRO del Pedido padre)
  + saldoFavor legítimo no comprometido

y nunca:  $14.000 por cobrar  ·  $10.000 duplicado  ·  pérdida del prepago
```

---

## 4. Arquitectura de ataque (dirección congelada)

```
Pedido               → qué compró el cliente (identidad comercial, número, líneas,
                        condiciones históricas, factura original, pagos)
   │
   ├── ObligacionPendiente  → qué cantidad todavía requiere cumplimiento
   │      │
   │      └── Actividad      → qué ejecución concreta (cantidad, modo, embarque, motivo)
   │             │
   │             └── Embarque → la misión logística donde se ejecuta
   │
   └── (Pago / Factura originales — nunca se editan destructivamente)
```

Ejemplo objetivo:

```
Pedido #1050 · 10 pacas · $10.000 pagados
   ├── Actividad #1  · 6 pacas · modo PUNTO     · ENTREGADA
   └── ObligacionPendiente · 4 pacas
          └── Actividad #2 · 4 pacas · modo DOMICILIO · Embarque #78
              (motivo: cliente solicitó envío)
```

**Sin crear `Pedido #1051`.** La entrega parcial es una *ejecución de una obligación*, no una venta nueva.

`crearPedidoHijo()` se reclasifica como **ESTADO TÉCNICO ACTUAL / LEGACY EN TRANSICIÓN**. No se elimina hasta auditar todos sus consumidores (Nivel 2).

---

## 5. Nivel 1 — Caso B (atacable ahora, sin tocar arquitectura)

**Objetivo:** entrega parcial sin cambiar la obligación comercial ni destruir el prepago.

### 5.1 Cambios

**`Pedido.entregar()`** — nueva semántica cuando la entrega es parcial (`Σ cantEntrega < Σ cantPedido`):
- NO recalcular `total`.
- NO recalcular `totalPagado` (no aplicar el `min`).
- NO transicionar a `ENTREGADO`; el pedido se queda `PENDIENTE` (sin enum nuevo — ver §5.3).
- Solo actualizar `cantEntrega` por item.
- `estadoPago` se proyecta con la regla existente (`EstadoPagoVO.proyectar(total, totalPagado, estadoEntrega)` → prepago + pendiente = `ANTICIPADO`).
- Cuando `Σ cantEntrega == Σ cantPedido` → recién ahí `estadoEntrega = ENTREGADO`.
- `saldo = total − totalPagado` siempre.

**No crear `crearPedidoHijo()` para el Caso B.** (Se mantiene el código para los flujos que hoy dependen de él — ver Nivel 2.)

**Cierre de embarque** — ver §6.

### 5.2 Restricciones (todas obligatorias)

- ❌ no modificar `Pago`.
- ❌ no modificar retroactivamente `Factura`.
- ❌ no crear `Pedido` hijo para representar la parte pendiente.
- ✅ mantener `Pedido.total` y `Pedido.totalPagado`.
- ✅ reducir únicamente `cantPedido − cantEntrega` (las cantidades físicamente pendientes).
- ✅ mantener el `Pedido` abierto hasta cumplimiento total.
- ✅ permitir 6/10, 8/10, y entregas sucesivas.
- ✅ `saldo` recalculado como `total − totalPagado`.
- ✅ conservar idempotencia (`entregaOfflineId`), concurrencia (lock `PEDIDO:{id}`), offline/reintentos.
- ✅ auditar la operación (`logAudit` transaccional).

### 5.3 `estadoEntrega` — sin enum híbrido

Coincide con ALS §9: el pedido se queda `PENDIENTE` hasta cumplimiento total. Helper derivado para UI: `estaParcialmenteEntregado(pedido) = items.some(cantEntrega > 0) && items.some(cantEntrega < cantPedido)`. La lista muestra "6/10 entregadas".

### 5.4 Batería de tests de dominio (condición de aprobación del PR)

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | prepago completo, entrega 6/10 | `total 10.000` · `totalPagado 10.000` · `saldo 0` · pendiente 4 · `PENDIENTE` |
| 2 | pago parcial $6.000, entrega 6/10 | `total 10.000` · `totalPagado 6.000` · `saldo 4.000` · pendiente 4 · `PENDIENTE` |
| 3 | sin pago, entrega 6/10 | `total 10.000` · `totalPagado 0` · `saldo 10.000` · pendiente 4 · `PENDIENTE` |
| 4 | (desde 1) segunda entrega 4/4 | 10/10 · `total 10.000` · `totalPagado 10.000` · `saldo 0` · `ENTREGADO` |
| 5 | misma entrega parcial offline reintentada 2× | una sola entrega (dedup por `entregaOfflineId`) |
| 6 | dos dispositivos entregando el mismo pedido a la vez | nunca 12/10; conflicto explícito |
| 7 | prepago completo antes del embarque, cierre del embarque | cobro nuevo del embarque = $0; el cierre NO exige modificar el pago histórico |

**El PR no se aprueba solo con "entregar parcial ya no recalcula total".** Requiere los 7 tests verdes.

---

## 6. Semántica de dinero del cierre de embarque (parte de P1)

El cierre debe distinguir dos conceptos:

| Concepto | Pregunta | Hoy |
|---|---|---|
| **Dinero recibido** | ¿Cuánto recibió Agua Bambú en total por este pedido? | `Pedido.totalPagado` (correcto) |
| **Dinero cobrado en esta ejecución** | ¿Cuánto se recibió *durante este embarque*? | **no se distingue** — `coleccionarPagos` suma todos los `Pago` del pedido |

Ejemplo (prepago total):

```
Pedido total                $10.000
Pagado históricamente        $10.000
Pagado antes del viaje       $10.000
Cobrado en este viaje             $0   ← lo que el cierre debe contabilizar
```

**Opciones de implementación (a decidir en P1):**

- **A (mínima, sin schema):** el cierre solo cuenta como "cobrado en el viaje" los `Pago` creados *durante* la ventana del embarque (por `createdAt` entre `horaSalida` y ahora) o los que el asistente ingresa explícitamente en el cuadre. Los prepagos previos no entran a `efectivoEsperado`. Ajustar el guard `PAGOS_EXCEDIDOS` para comparar contra el cobro del viaje, no contra el total histórico.
- **B (correcta, aditiva):** **`Pago.embarqueId`** (nullable) = el embarque donde se capturó el pago (`null` = mostrador / oficina / prepago). El cierre de E cuenta `Σ Pago WHERE embarqueId = E`. Esto además resuelve los casos borde ya documentados de venta en ruta con entrega posterior (`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §0, follow-up "conciliar por pago, no por pedido"). Sitios de captura a taggear: `venta-libre`, `crear-ventas-libres.service`, `procesar-pedido.service`, `EntregarPedidoUseCase` (pagos al entregar). `pagar-fiado` / `CrearPedidoUseCase` / import → `null`.

**Recomendación:** B. Es aditiva, no toca `Pago` existentes, y unifica dos problemas.

**Prohibido:** subir el límite del guard sin redefinir qué cuenta el cierre.

---

## 7. Nivel 2 — conectar `ObligacionPendiente` / `Actividad` (después de P1)

**No diseñar entidad nueva.** Wirear la existente.

### 7.1 Preguntas de contexto de `Actividad` (responder ANTES de tocar schema)

```
Actividad
├── ¿qué obligación ejecuta?      → obligacionId (existe)
├── ¿qué cantidad?                → cantidad (existe)
├── ¿qué modo?                    → GAP: Actividad.modo (PUNTO|DOMICILIO) — parece necesario
│                                    pero verificar que sea el ÚNICO campo faltante
├── ¿qué embarque?                → embarqueId nullable (existe)
├── ¿por qué existe? (motivo)     → GAP: campo de motivo / replanificación
├── ¿quién la creó? ¿cuándo?      → GAP: createdById / createdAt (Actividad no los tiene)
├── ¿qué precio económico aplica? → snapshot histórico del PedidoItem (existe en el item)
├── ¿qué dinero ya estaba recibido? → deriva del Pedido padre (no se mueve)
└── ¿qué diferencial genera?      → Nivel 3
```

Especial: el Caso C introduce **`modo original ≠ modo actual de cumplimiento`**. Debe quedar explícito (la `Actividad` conoce su `modo`; el `Pedido` conserva su `canal` histórico).

### 7.2 Alcance del wiring

1. Cuando un `Pedido` queda parcialmente cumplido → nace/actualiza su `ObligacionPendiente` (por producto).
2. Cada entrega física es una `Actividad(tipo=ENTREGA, estado=CUMPLIDA)`.
3. Elegibilidad para embarque → `esElegibleParaEmbarque(obligacion/actividad)`, **no** `Pedido.estadoEntrega === PENDIENTE` (ALS §10).
4. Reconciliar `Actividad` ↔ `PlanActividad` (el planificador debe producir/consumir `Actividad`, o quedar claro por qué son capas distintas).
5. `procesarPedidoService` deja de asumir `1 Pedido = 1 entrega completa`: opera sobre la `Actividad` (N unidades), no sobre el `Pedido` (10 unidades).
6. UI de Embarques muestra el **modo del cumplimiento**, no el `canal` del Pedido:

```
Embarque #78 · Pedido #1050
  Venta original:   PUNTO
  Entrega actual:   DOMICILIO
  Motivo:           cliente solicitó envío
  Pendiente:        4 pacas
  Estado de pago:   Pagado
  Diferencial dom.: $X
```

Esto elimina la confusión "¿cómo llegó una venta de mostrador a Embarques?": el registro dice que fue replanificada explícitamente.

---

## 8. Nivel 3 — PUNTO → DOMICILIO explícito

Flujo:

```
PUNTO → 6 entregadas → 4 pendientes → cliente llama "envíenlas por domicilio"
      → decisión explícita del usuario ("Gestionar pendiente → Enviar a domicilio")
      → Actividad(modo=DOMICILIO) sobre la ObligacionPendiente
      → confirmar diferencial → registrar ajuste fiscal → asignar a Embarque
```

Debe resolver:
1. wiring `ObligacionPendiente` / `Actividad` (Nivel 2).
2. `Actividad.modo`.
3. relación con `PlanActividad` / elegibilidad para embarque.
4. **precio histórico:** las 4 pendientes NO se recalculan como compra nueva de 4 a tarifa individual. Snapshot del `PedidoItem`. El motor `resolverPreciosPedido` (con `sobreCostoDomicilio`) **no** se reutiliza directo sobre el pendiente.
5. **diferencial DOMICILIO** = (valor domicilio de las 4) − (valor histórico de las 4). Regla comercial del delta: **PENDIENTE DE DECISIÓN DE NEGOCIO**.
6. **dinero previamente recibido:** las 4 pendientes ya tienen su parte pagada dentro del `Pedido` padre. El diferencial es una obligación adicional nueva.
7. **fiscal:** documento del mayor valor (nota débito / factura por diferencia). **BLOQUEANTE EXTERNO** — contador + proveedor de facturación electrónica + normativa DIAN vigente. **Ningún código del diferencial avanza sin esta definición.**
8. UX (§7.2).
9-13. offline / idempotencia / concurrencia / auditoría (`FULFILLMENT_REPLANIFICADO`) / migración.

El Caso C **no bloquea** el P1, siempre que el P1 no rompa la arquitectura necesaria para llegar a él (no lo hace: el P1 mantiene una sola obligación en `Pedido` y no toca pagos).

---

## 9. Lo que NO se hace

- ❌ Entidad `Fulfillment` nueva → usar `Actividad`.
- ❌ `PaymentAllocation` / campo de dinero en `ObligacionPendiente` sin probar primero que el dinero-en-el-Pedido-padre no basta (para el Caso B/C sí basta).
- ❌ Mover el prepago a `saldoFavor` (no está earmarked → se consume en otra compra).
- ❌ Estado `estadoEntrega` híbrido.
- ❌ Tocar `Pago` / `Factura` retroactivamente.
- ❌ Eliminar `crearPedidoHijo()` sin auditar sus consumidores.
- ❌ Implementar el diferencial DOMICILIO sin el gate fiscal.
- ❌ Subir el límite del guard `PAGOS_EXCEDIDOS` sin redefinir qué cuenta el cierre.
- ❌ Que `PENDIENTE + PUNTO` sea autorización automática para entrar a Embarques.
- ❌ Modificar el Contexto Maestro por esto (todavía).

---

## 10. Prioridades

| | Tarea | Bloqueante |
|---|---|---|
| **P0** | Contención: `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` OFF mientras se corrige. **Contención, no decisión de producto** — PUNTO puede ir a DOMICILIO por acción explícita. | — |
| **P1** | Auditoría arquitectónica | ✅ hecha (este doc) |
| **P1** | Corrección monetaria Caso B: entrega parcial no cierra ni recalcula; dinero queda en el `Pedido` padre. + batería de 7 tests. | — |
| **P1** | Semántica de dinero del cierre: distinguir "recibido" de "cobrado en el viaje"; fix `PAGOS_EXCEDIDOS`. Recomendado `Pago.embarqueId`. | — |
| **P2** | Wiring `ObligacionPendiente` / `Actividad` al flujo real + `Actividad.modo` + reconciliar con `PlanActividad`. | P1 |
| **P2** | Replanificación PUNTO → DOMICILIO explícita ("Gestionar pendiente"). | P2 wiring |
| **P2** | Precio histórico preservado + cálculo del diferencial. | regla comercial |
| **P2** | Tratamiento fiscal del diferencial. | **DIAN / contador / proveedor FE** |
| **P3** | Migración expand/contract: conectar el modelo con pedidos existentes; `pedido-hijo + idOrigen` coexiste temporalmente; no reconstruir históricos por inferencia. | P2 |
| **P3** | E2E: ciclo canónico + PUNTO→DOMICILIO + offline + reintentos + concurrencia. | todo lo anterior |

---

## 11. Gate arquitectónico (ALS §22 — respuestas con lo que ya hay)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Dónde vive la identidad comercial? | `Pedido` (número, líneas, factura, pagos). Sin cambio. |
| 2 | ¿Dónde vive el cumplimiento? | `Actividad` — **ya existe** (`ADR-ACTIVIDAD-001`). |
| 3 | ¿Cómo existen múltiples cumplimientos? | `ObligacionPendiente 1──N Actividad` — **ya existe**. |
| 4 | ¿Cómo se asigna un pago único? | El dinero se queda en el `Pedido` padre; no se asigna a cumplimientos. El diferencial (Nivel 3) es obligación aparte. |
| 5 | ¿Cómo se preserva precio de volumen? | Snapshot en `PedidoItem.precio`; `crearPedidoHijo` ya lo hereda. ✅ |
| 6 | ¿Cómo se calcula el diferencial de domicilio? | `sobreCostoDomicilio` existe; falta la **regla comercial del delta**. |
| 7 | ¿Cómo llega explícitamente a Embarques? | `AsignarActividadUseCase` (existe) + acción "Gestionar pendiente" + quitar auto-listado PUNTO de `filtrarPedidosSeleccionables`. |
| 8 | ¿Cómo se factura el mayor valor? | **BLOQUEANTE EXTERNO** (DIAN). |
| 9 | ¿Cómo se reconcilia en cierre? | `Pago.embarqueId` → el cierre cuenta solo lo cobrado en el viaje. |
| 10 | ¿Cómo funciona offline? | `Actividad.offlineId @unique`, `entregaOfflineId` — **ya existe**. |
| 11 | ¿Cómo se protege concurrencia? | lock `OBLIGACION:{id}` + `chk_obligacion_no_sobreconsumo` + tests 34A/B/C — **ya existe**. |
| 12 | ¿Cómo se audita? | `logAudit` transaccional + evento `FULFILLMENT_REPLANIFICADO` (nuevo). |
| 13 | ¿Cómo se migra lo existente? | aditiva; `pedido-hijo + idOrigen` coexiste (expand-contract, patrón del repo). |

**Regla del gate:** *si alguna respuesta requiere modificar retrospectivamente pago o factura → NO aprobar.* El P1 no lo hace (el `Pago` original queda intacto; el dinero no se mueve). El Nivel 3 fiscal es exactamente donde ese gate muerde.

---

## 12. Decisiones pendientes / bloqueantes

| Ítem | Tipo | Dueño |
|---|---|---|
| Regla comercial del diferencial PUNTO→DOMICILIO | Decisión de negocio | PO |
| Documento fiscal del mayor valor (nota débito vs factura por diferencia) | Bloqueante externo | Contador + proveedor FE + DIAN |
| `Pago.embarqueId` vs opción "por ventana temporal" para el cierre | Decisión técnica | Equipo (dentro de P1) |
| ¿`Actividad` necesita más campos además de `modo`/`motivo`/`createdBy`? | Diseño | Equipo (antes de tocar schema, Nivel 2) |
| ¿`PlanActividad` y `Actividad` convergen o quedan como capas distintas? | Diseño | Equipo (Nivel 2) |
| Retiro definitivo de `crearPedidoHijo()` | Diseño + auditoría de dependencias | Equipo (Nivel 2/3) |
