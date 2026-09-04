# Auditoría de regresión — cadena `Pedido → Pago → Cartera → Cierre → Embarque` tras PR-2

**Baseline:** `main` @ `66e002eb` (post `#178` PR-2b, `#179` registro ADR, `#180` auth fail-closed).
**Alcance:** verificar que PR-1 (`#175`) + PR-2a (`#177`) + PR-2b (`#178`) no descuadraron
la conciliación de dinero fuera del cierre de embarque (que sí quedó cubierto por la
matriz de `ADR-PAGO-EMBARQUE-CAPTURA-001`). Prerrequisito de N2 (wiring
`ObligacionPendiente`/`Actividad`).
**Método:** lectura de código con referencias `archivo:línea` + 2 tests de caracterización
contra Postgres real. NO cambia comportamiento — es diagnóstico.

---

## Resumen de hallazgos

| # | Título | Severidad | Origen | Estado |
|---|--------|-----------|--------|--------|
| F-A | `generarPedidosRecurrentes` (APLICAR_CREDITO) hace `PENDIENTE → ENTREGADO`, transición que la máquina canónica prohíbe | Media | Pre-existe; F2/F3 lo dejan visible | **✅ RESUELTO** — ver "Resolución F-A" al final |
| F-B | El cierre de día (`/api/cierre`) no ve el efectivo cobrado en un cierre de embarque sobre un pedido de fecha anterior | Media-alta | Pre-existe para COMPLETO; **PR-2b F9 lo extiende a entregas PARCIALES** | **Documentado — requiere confirmación de diseño** |
| F-C | `cobrado` (Σ `totalPagado`) vs `cobroVentasHoy` (Σ `Pago` por método) pueden divergir dentro del mismo día para prepagos de cartera | Baja | Pre-existe | Documentado |
| F-D | `Pedido.embarqueOrigenId` quedó como columna escrita por `venta-libre` pero sin lector en cálculos monetarios | Info | PR-2b (por diseño del ADR) | OK — es la decisión del ADR §9 |

Ninguno es un **bloqueante de regresión de PR-2** (PR-2 no rompió nada que antes
funcionara). F-A y F-B son deuda que PR-1/PR-2b **hicieron más visible** y que conviene
resolver antes de apilar N2 encima.

---

## F-A — `recurrentes.ts`: transición `PENDIENTE → ENTREGADO` fuera de la máquina de estados

### Evidencia

`src/modules/pedidos/domain/value-objects/EstadoEntrega.ts:16-23` — tabla canónica
(fuente única desde F2, la re-exportan `pedido-transitions.service` y `pedido-utils`):

```
PENDIENTE:     ['EN_RUTA', 'CANCELADO']
EN_RUTA:       ['ENTREGADO', 'NO_ENTREGADO', 'PENDIENTE', 'CANCELADO']
ENTREGADO:     ['ANULADO']
...
```

`src/lib/recurrentes.ts:534-548` — `pedidosPendientes` se consulta con
`estadoEntrega: 'PENDIENTE'`.
`src/lib/recurrentes.ts:551` — `pedidosPagados = pedidosPendientes.filter(saldo === 0 && totalPagado > 0)`
(prepagos aún no entregados).

Rama **CON_PENDIENTES / SOLO_PENDIENTES** (`recurrentes.ts:713-736`):
`tx.pedido.update({ data: { estadoEntrega: 'CANCELADO' } })` → **válida** (`PENDIENTE → CANCELADO`).

Rama **APLICAR_CREDITO** (`recurrentes.ts:739-747`):
```ts
await tx.pedido.update({
  where: { id: p.id },
  data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', fechaEntrega: new Date() },
})
```
→ **prohibida** por la tabla (`PENDIENTE` no lista `ENTREGADO`). Ningún `canTransitionTo()`
la valida — es un `tx.pedido.update` crudo. Path vivo y seleccionable por el usuario:
`POST /api/pedidos/recurrentes` (`src/app/api/pedidos/recurrentes/route.ts:211`) y el cron
`src/app/api/cron/generar-recurrentes/route.ts:30`.

### Por qué importa

1. **Contradicción con F2/F3**: el objetivo de F3 es que *ningún* write crudo transicione
   un pedido sin pasar por la máquina de estados. Este es exactamente el patrón que F3
   quiere cerrar y quedó fuera de "F3 (parte 1)" (`053158f1`, solo `ActualizarPedidoUseCase`).
2. **Falsifica el pasado**: los prepagos consolidados NO se entregaron físicamente — sus
   pacas se refunden en el pedido recurrente nuevo. Marcarlos `ENTREGADO` + `fechaEntrega = now()`
   fabrica una entrega que no ocurrió. La rama hermana (CON_PENDIENTES) los marca `CANCELADO`,
   que es lo coherente. El principio "el sistema no falsifica el pasado" es citado
   explícitamente en `ADR-PAGO-EMBARQUE-CAPTURA-001` y `ADR-CORRECCION-MONETARIA-001`.
3. **Ripple en reportes**: un pedido `ENTREGADO` con `cantEntrega = cantPedido` (los items
   también se tocan, `recurrentes.ts:754-758`) entra en "aguaVendida/hieloVendido" del cierre
   de día del día de la consolidación (`/api/cierre` cuenta `p.cPacaAguaEnt` de pedidos con
   `fecha` del día) — doble conteo de producto: una vez en el pedido viejo "entregado" y otra
   en el pedido recurrente nuevo.

### Clasificación (disciplina PR-2)

**Contradicción arquitectónica + decisión de producto pendiente.** NO la resuelvo acá.
Las opciones son:
- **(a)** `pedidosPagados` → `CANCELADO` (igual que CON_PENDIENTES) + transferir el crédito
  vía `NotaCredito` / `ReceivableEntry` como ya hace la otra rama. Coherente, no fabrica
  entrega. Requiere confirmar que el crédito se aplica igual.
- **(b)** Añadir `PENDIENTE → ENTREGADO` a la tabla canónica. **Rechazado** — acomoda la
  máquina de estados a un write cuestionable (viola la regla del Contexto Maestro).
- **(c)** Introducir un estado/flag "consolidado" distinto de ENTREGADO. Sobre-ingeniería
  para un caso de borde.

Recomendación: **(a)**, como sub-ítem de G2 (corrección de abonos) o de F3 parte 2.

---

## F-B — El cierre de día no ve el efectivo cobrado en ruta sobre pedidos de fecha anterior

### Evidencia

`src/app/api/cierre/route.ts:191-197` — el cierre de día selecciona pedidos por
**`fecha: dateRange`** (la `fecha` de un `Pedido` es su fecha de creación):

```ts
prisma.pedido.findMany({
  where: { fecha: dateRange, estadoEntrega: { notIn: [CANCELADO, ANULADO] } },
  include: { pagos: true },
})
```

De ahí salen **todas** las cifras financieras del cierre:
- `cobrado = Σ pedido.totalPagado` (`route.ts:283`)
- `efectivo/transferencia/nequi/daviplata/bono = Σ pedido.pagos[].monto` por método (`route.ts:286-305`)
- `cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono` (`route.ts:320`)

El único cruce por fecha de pago es `pagosReportadosHoyRaw` (`route.ts:269-272`,
`confirmacion: 'REPORTADO'` + `createdAt: dateRange`), que alimenta **solo** el desglose
informativo `porConfirmar` y **NO** altera `netoCaja` (comentario explícito `route.ts:321-323`).
El efectivo nace `CONFIRMADO` (`src/lib/pago-confirmacion.ts:18-22`), así que ni siquiera
entra a ese cruce.

### Escenario

1. Día 1 — se crea el pedido fiado #100 (`fecha` = día 1), $100k, sin pagar.
2. Día 3 — cierre del embarque E. El repartidor entregó y cobró $100k en efectivo.
   - `procesar-pedido.service.ts` (rama COMPLETO o, tras **PR-2b F9**, rama PARCIAL) crea
     un `Pago{ pedidoId: #100, metodo: EFECTIVO, monto: 100k, embarqueId: E, createdAt: día 3, confirmacion: CONFIRMADO }`
     e incrementa `#100.totalPagado`.
3. Cierre de embarque E (día 3): **correcto** — `coleccionarPagosDeMision(client, E)`
   (`cerrar-embarque-caja.helper.ts`) lee `Pago WHERE embarqueId = E` → caja de E cuadra.
4. Cierre de **día 3** (`/api/cierre`): el pedido #100 tiene `fecha` = día 1 → **no está en
   `pedidos`** → el `Pago` de $100k y el incremento de `totalPagado` son **invisibles** a
   `cobrado`, `efectivo`, `cobroVentasHoy`. El día 3 reporta $100k menos de efectivo del
   que físicamente entró.

### Origen y relación con PR-2

- **Pre-PR-1**: la entrega parcial creaba un **pedido hijo** con `fecha` = hoy que cargaba
  el pago → visible en el cierre del día de la entrega.
- **PR-1 (`#175`)**: eliminó el hijo; la rama PARCIAL dejó de tocar dinero → no había nada
  que ver ni dejar de ver.
- **PR-2b F9 (`#178`)**: la rama PARCIAL **vuelve a registrar** `Pago` + incrementa
  `totalPagado`, pero sobre el pedido **original** (fecha vieja) → el dinero existe y el
  cierre de día no lo ve.
- Para la rama **COMPLETO** el problema **ya existía** antes de PR-2 (siempre creó `Pago`
  en el cierre): un pedido entregado en ruta N días después de creado nunca cuadró el
  efectivo en el cierre del día de la entrega.

Es decir: **PR-2b no introdujo el bug, pero amplió su superficie de COMPLETO a PARCIAL** y
lo hace más frecuente (toda entrega parcial con cobro).

### Impacto real

Con 6 usuarios y cierres de embarque el mismo día de la creación del pedido (caso común),
el descuadre es nulo. Aparece cuando: pedido fiado de un día, entrega/cobro en un cierre de
embarque de otro día. La caja del **embarque** siempre cuadra (F-B no la afecta); lo que no
cuadra es el **rollup de día** contra el efectivo físico.

### Clasificación

**Requiere confirmación de diseño del equipo**, no es una corrección obvia:
- **¿El cierre de día debe conciliar caja física?** Si sí → debe sumar `Pago` por
  `createdAt`/`confirmadoAt` del día (no por `pedido.fecha`), lo que toca el cálculo central
  de `/api/cierre` y cruza `ADR-CIERRE-001`.
- **¿O el control de caja física es exclusivamente el cierre de embarque** (`CierreEmbarque`
  + `FALTANTE_CAJA`) y el cierre de día es un reporte contable por fecha de venta? Entonces
  F-B es "as designed" y solo falta documentarlo + quizá un panel "cobrado en ruta de
  pedidos de días anteriores" informativo.

El comentario de `pago-confirmacion.ts:4-7` ("su conciliación es el cierre de embarque, no
este flujo") sugiere que la intención es la **segunda** — pero entonces `cobrado` /
`cobroVentasHoy` del día no deberían presentarse como "lo que entró hoy".

Test de caracterización: `src/lib/__tests__/integration/auditoria-post-pr2-cierre-dia.test.ts`.

---

## F-C — `cobrado` vs `cobroVentasHoy` dentro del mismo día

`cobrado = Σ pedido.totalPagado` mezcla dinero de **cualquier** fecha (un prepago de cartera
hecho hoy sobre un pedido de hoy, más lo que ya traía). `cobroVentasHoy = Σ Pago por método`
solo cuenta filas `Pago`. Para un pedido creado hoy y prepagado hoy vía `pagar-fiado`, ambos
coinciden (hay `Pago`). Para un pedido creado hoy con `totalPagado > 0` seteado por un flujo
que **no** crea `Pago` fila-a-fila, `cobrado` sube y `cobroVentasHoy` no.

Tras PR-2b este riesgo **bajó** (la rama COMPLETO/PARCIAL ahora siempre crea `Pago` cuando
incrementa `totalPagado` — `procesar-pedido.service.ts`, guard `montoPagado > 0`). Queda como
nota: cualquier escritor futuro de `totalPagado` debe crear el `Pago` correspondiente o
romperá esta igualdad. No hay acción inmediata.

---

## F-D — `embarqueOrigenId` sin lector monetario

`venta-libre/route.ts:238` escribe `embarqueOrigenId: embarqueId` siempre.
`grep -rn "embarqueOrigenId" src` → solo escrituras y lecturas de UI/trazabilidad; **cero**
en `CerrarEmbarqueUseCase` / `cerrar-embarque-caja.helper.ts` tras PR-2b.

Esto es **correcto y por diseño** — `ADR-PAGO-EMBARQUE-CAPTURA-001 §9`: "una sola fuente de
verdad: `embarqueOrigenId` fuera de todo cálculo monetario". La columna se conserva para
trazabilidad ("¿en qué embarque nació esta venta?"). Sin acción.

---

## Cadena verificada sin hallazgos

- **`pagar-fiado` / `abonos`** (fuera de ruta): siguen creando `Pago`/`Abono` + `ReceivableEntry`
  dentro de `withAdvisoryLock('CARTERA', clienteId)` + `logAudit(tx)` (F1, `53bbd55a`). PR-2
  no los tocó. `offlineId` dedup intacto.
- **Anular/Cancelar**: `bf7be8fe` (g2.3/F7) ya emite `ReceivableEntry` REVERSION; PR-2b no
  interfiere (su `coleccionarPagosDeMision` excluye `estadoEntrega IN (ANULADO,CANCELADO)`,
  regla A1 del ADR — verificado en `pr2b-conciliacion-captura.test.ts` caso 2).
- **Cierre de embarque idempotente**: `cierre-idempotencia.test.ts` + `pr2b-...test.ts` caso 7
  (replay) verdes — un segundo cierre no duplica `Pago` ni `totalPagado`.
- **`totalPagado` monotónico**: `procesar-pedido.service.ts` usa
  `Math.min(total, previo + montoPagado)` en ambas ramas — nunca baja, nunca excede `total`
  (respeta `chk_pedido_montopagado_le_total`).

---

## Acciones propuestas (para el PO / equipo)

1. **F-A** → ✅ resuelto (abajo).
2. **F-B** → **decisión del equipo (2026-09-03):** el Cierre de Día **debe conciliar caja
   física por fecha de captura del pago**; ventas / entregas / cartera mantienen su propia
   fecha/semántica. NO es sustituir `pedido.fecha` por `pago.createdAt` en todo `/api/cierre`
   — es un **refactor selectivo**: `efectivo/transferencia/nequi/daviplata/bono` +
   `cobroVentasHoy` pasan a salir de `prisma.pago.findMany({ where: { createdAt: dateRange } })`
   agrupado por método (extendiendo la semántica que el código ya usa para
   `pagosReportadosHoyRaw`); `totalVentas` se queda por `pedido.fecha`. Revisar: qué estados
   de `Pago` cuentan, interacción con el snapshot de `CierreDia` y el path de recompute
   (`POST`, ~línea 495), compat con snapshots v1.0. **PR aparte, después de F-A.** No abre
   `ADR-CIERRE-001` (es aplicación de una decisión ya convergida).
3. **F-C / F-D** → sin acción, notas para revisores de PRs futuros.

---

## Resolución F-A (2026-09-03)

**Decisión del equipo:** confirmado como defecto de integridad. NO basta `PENDIENTE →
CANCELADO`: el pedido anterior no debe fabricar una entrega **y** el crédito debe
transferirse/consumirse mediante una operación monetaria explícita y auditable, no copiando
`totalPagado`.

**Implementado** (`src/lib/recurrentes.ts`, rama `APLICAR_CREDITO`):

1. Los prepagos consolidados → **`CANCELADO`** (transición válida `PENDIENTE → CANCELADO`),
   `estadoPago = ANULADO`, `total/totalPagado/saldo → 0`. Los `PedidoItem` **no se tocan**
   (`cantEntrega` queda en 0 — sin entrega fabricada). `fechaEntrega` queda `null`.
2. Por cada prepago: `registrarReversionPedido(tx, …)` (paridad con `CancelarPedidoUseCase`,
   compensa la proyección de cartera) + `Factura → ANULADA` + `NotaCredito` por el monto
   prepagado.
3. El prepago se parquea como crédito del cliente: **`Cliente.saldoFavor += monto`** — la
   operación monetaria explícita y auditable (mismo mecanismo que `#159` / `pagar-fiado`).
4. El pedido recurrente nuevo **consume** ese crédito: `montoCredito = min(saldoFavor
   parqueado, total)`, `saldoFavor -= montoCredito`, `totalPagado = montoCredito`,
   `estadoPago` proyectado (`calcularEstadoPago(total, montoCredito, 'PENDIENTE')` → ANTICIPADO
   o PARCIAL). El **excedente** (crédito > total del pedido nuevo) — antes descartado por
   `Math.min` y perdido — ahora queda disponible en `saldoFavor`.

**Conservación del dinero:** `Σ NotaCredito == pedido_nuevo.totalPagado + Cliente.saldoFavor`.

**Tests:** `src/lib/__tests__/integration/recurrentes-aplicar-credito-integridad.test.ts`
(4, Postgres real) + `src/lib/__tests__/auditoria-post-pr2-recurrentes-transicion.test.ts`
(actualizado).

**Sigue pendiente:** F3 parte 2 — añadir `canTransitionTo` a los `tx.pedido.update` crudos
que quedan en `recurrentes.ts` (rama CON_PENDIENTES y esta) como defensa en profundidad.
