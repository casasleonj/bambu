# ADR-PEDIDO-ESTADO-CANONICO-001 — `estadoEntrega` canónico, `estadoPago` proyectado

- Estado: **Aceptado** (aprobado por el PO el 2026-09-01)
- Fecha: 2026-08-31 (aprobado 2026-09-01)
- Fuente: ALS Operación Comercial §7–§8, §50.3.B; Plan Técnico §16; INVENTARIO §G5, §G7 (VERIFICAR), §F3 (parte diferida)
- Fase de implementación: FASE 2 (Pedidos). Es el linchpin: desbloquea el resto de F3 y cierra G7.
- Sin decisión de producto pendiente — es una decisión técnica de fuente de verdad.

## Contexto

`Pedido` tiene hoy **tres** columnas de estado donde deberían ser dos dimensiones:

| Columna | Enum | Rol real |
|---|---|---|
| `estado` | `EstadoPedido` | mirror legacy de `estadoEntrega` (mismos 6 valores, siempre igual) |
| `estadoEntrega` | `EstadoEntrega` | la máquina de estados de entrega (canónica de facto) |
| `estadoPago` | `EstadoPago` | debería derivar de `(total, totalPagado)` pero es una columna que cada writer actualiza a mano |

Problemas medidos:

- **`estado` (legacy)** todavía tiene ~8 lectores (`src/app/api/cierre/route.ts:203,209`,
  `src/lib/demanda/recompute-cliente.ts:31,40`, `src/app/api/pedidos/[id]/enviar/route.ts`
  guard, `src/app/(app)/embarques/[id]/{page.tsx:216,embarque-client.tsx:423}`, selector
  de embarque en `pedidos-client`) y ~5 escritores (`PedidoMapper`, `procesar-pedido.service.ts`,
  `recurrentes.ts`, `enviar/route.ts`). Es duplicación pura (P5).
- **`estadoPago`** lo escriben a mano ≥6 lugares (`pagar-fiado`, dos crons, `procesar-pedido`,
  `casos/[id]/route.ts:339` que hace `data: { estadoPago: 'PAGADO' }` **sin tocar
  `totalPagado`**, PedidoMapper). Riesgo real de que `estadoPago` diga `PAGADO` con
  `saldo > 0`. `ANTICIPADO` no lo escribe nadie; `VENCIDO` solo el cron.

## Decisión

### 1. `estadoEntrega` es la fuente canónica de entrega. `Pedido.estado` se retira.

Retiro por **expand-contract** (ADR-MIGRACION-001), una fase = un PR con gate y rollback:

| Fase | Acción | Gate |
|---|---|---|
| A (hecha) | Dual-write: `PedidoMapper` escribe `estado` + `estadoEntrega` juntos. | — |
| B | Migrar los ~8 lectores a `estadoEntrega`. Verificación: `SELECT count(*) FROM "Pedido" WHERE estado::text <> "estadoEntrega"::text` = **0** en prod. | 0 divergencias + tests |
| C | Dejar de escribir `estado` (quitar de `PedidoMapper.toPrisma*`, `procesar-pedido.service`, `recurrentes.ts`, `enviar/route.ts`). Añadir default DB `estado = 'PENDIENTE'` para que inserts legacy no fallen durante la ventana. | E2E verde N días |
| D | `ALTER TABLE "Pedido" DROP COLUMN "estado";` + `DROP TYPE "EstadoPedido";` (solo `Pedido` lo usa; `EstadoEntrega` tiene los mismos valores). | reauditoría |

Feature flag no aplica (es retiro de columna, no cambio de comportamiento); el
rollback de cada fase es `git revert` + (fase D) recrear columna + backfill
`UPDATE "Pedido" SET estado = "estadoEntrega"`.

### 2. `estadoPago` es una **proyección** (como `saldo` y `ReceivableEntry`), no una fuente

Fuente de verdad: `(total, totalPagado, estadoEntrega)` + `promesaPagoFecha`.
`estadoPago` sigue siendo una columna (no se rompe ninguna API ni query), pero
su valor queda **definido** por una regla única.

#### Semántica de `ANTICIPADO` (decisión del PO, 2026-09-01)

> **`ANTICIPADO` = el pago total se recibió ANTES de que ocurriera la entrega
> comprometida.** Es la *naturaleza temporal del pago*, NO simplemente
> "pagado y todavía no entregado".

Son tres dimensiones distintas, no una: **¿está pagado?** ≠ **¿está entregado?**
≠ **¿el pago precedió a la entrega?**. `ANTICIPADO` responde la tercera.

| Situación | Pago | Entrega | `estadoPago` |
|---|---|---|---|
| Cliente paga hoy un domicilio para mañana | Completo | Pendiente | **ANTICIPADO** |
| Cliente paga antes de que el repartidor salga | Completo | Pendiente / En ruta | **ANTICIPADO** |
| Cliente compra en punto y se lleva todo | Completo | Completa | PAGADO |
| Cliente paga después de recibir | Completo | Completa | PAGADO |
| Compra 10, lleva 5 hoy, deja 5 para mañana | Completo | Parcial | PAGADO (el padre queda ENTREGADO; el faltante es un **pedido-hijo** PENDIENTE sin pago — no hay ambigüedad) |
| Pedido fiado | Parcial / ninguno | cualquiera | PENDIENTE / PARCIAL (nunca ANTICIPADO por esta razón) |

**Regla operativa.** Para un pedido con `totalPagado >= total`, "el pago precedió
a la entrega" es equivalente a **`estadoEntrega ∈ {PENDIENTE, EN_RUTA}`** (la
entrega aún no ocurrió ⇒ el pago necesariamente la antecede). En cuanto
`estadoEntrega` llega a `ENTREGADO`, el pago deja de ser "anticipado" → `PAGADO`.
El caso de entrega parcial se resuelve por el pedido-hijo (fila de arriba), no
por un estado intermedio.

**Regla `proyectarEstadoPago(total, totalPagado, estadoEntrega)`** (helper único en el dominio):

```
estadoEntrega ∈ {CANCELADO, ANULADO}                 → ANULADO
totalPagado >= total  ∧  estadoEntrega ∈ {PENDIENTE, EN_RUTA} → ANTICIPADO  (pago antes de la entrega)
totalPagado >= total                                → PAGADO       (entrega ya ocurrió, o NO_ENTREGADO)
totalPagado > 0                                     → PARCIAL
si no                                               → PENDIENTE
```

**`VENCIDO`** es el único override: el cron `vencimiento-promesas` lo aplica
cuando `promesaPagoFecha < now` y el proyectado sería `PENDIENTE`/`PARCIAL`; se
limpia (vuelve al proyectado) en el próximo pago.

#### Rollout — sin backfill forzado (decisión del PO)

El PO **descartó** "proyección completa + backfill" tal como estaba redactada.
Se adopta:

1. **Escritura hacia adelante:** todos los writers (`CrearPedidoUseCase`,
   `EntregarPedidoUseCase`, `pagar-fiado`, `procesar-pedido`, crons, `PedidoMapper`)
   pasan a llamar `proyectarEstadoPago(...)`. Los pedidos nuevos y cualquiera que
   se re-guarde quedan con el valor correcto.
2. **La UI deriva el badge con la misma regla** (`visual-states.ts` /
   `getEstadoPagoBadge`), de modo que un pedido prepago-pendiente **viejo** (con
   la columna aún en `PAGADO` stale) igual muestra "Anticipado". UX consistente
   sin tocar datos.
3. **CHECK constraint `chk_pedido_estadopago_proyectado` — DIFERIDO.** No se
   puede añadir sin backfill (las filas viejas con `PAGADO` stale lo violarían).
   Queda como sub-decisión aparte: (a) backfill puntual
   `UPDATE ... SET estadoPago='ANTICIPADO' WHERE totalPagado>=total AND estadoEntrega IN ('PENDIENTE','EN_RUTA')`
   — que NO inventa historia, solo re-etiqueta pagos que sí fueron anticipados —
   y entonces el CHECK; o (b) sin CHECK, confiando en el helper único.
   **Recomendación:** (a), en un PR propio, después de que el helper esté en
   producción y se verifique el conteo de filas afectadas.

> **Interacción con `ADR-CORRECCION-MONETARIA-001` (G2):** una
> `ReceivableEntry REVERSION` (corrección de abono o anulación de pedido pagado)
> recalcula `totalPagado` a la baja → `proyectarEstadoPago` lo reclasifica
> (`PAGADO`/`ANTICIPADO` → `PARCIAL`, etc.) automáticamente. Tras anular/cancelar,
> `estadoEntrega ∈ {ANULADO, CANCELADO}` → `estadoPago = ANULADO` por la primera
> regla. G2 se implementa **después** de G5.1 para usar el helper.

**CHECK constraint** (si se adopta el rollout (a) de arriba — patrón
`chk_pedido_saldo_calc`, `NOT VALID` → backfill → `VALIDATE`):

```sql
ALTER TABLE "Pedido" ADD CONSTRAINT chk_pedido_estadopago_proyectado CHECK (
  "estadoPago" = 'VENCIDO'
  OR "estadoPago" = (CASE
     WHEN "estadoEntrega" IN ('CANCELADO','ANULADO') THEN 'ANULADO'
     WHEN "totalPagado" >= total AND "estadoEntrega" IN ('PENDIENTE','EN_RUTA') THEN 'ANTICIPADO'
     WHEN "totalPagado" >= total THEN 'PAGADO'
     WHEN "totalPagado" > 0 THEN 'PARCIAL'
     ELSE 'PENDIENTE' END)::"EstadoPago"
) NOT VALID;
```

El CHECK **hace fallar** el `data: { estadoPago: 'PAGADO' }` de
`casos/[id]/route.ts:339` si no ajusta `totalPagado` — es el objetivo (surface
del bug). Ese caller se corrige **antes** del `VALIDATE` (o antes, si se va por
el rollout (b) sin CHECK).

### 3. La UI

Ningún cambio de contrato: los consumidores siguen leyendo `Pedido.estadoEntrega`
y `Pedido.estadoPago`. `visual-states.ts` / `getEstadoPagoBadge` (que hoy derivan
un 4º estado de presentación) se alinean con `proyectarEstadoPago` + la señal de
confirmación de `ADR-PAGO-REPORTADO-CONFIRMADO-001`.

## Orden de PRs

| PR | Contenido | Estado |
|---|---|---|
| **G5.2** | Migrar los lectores de queries Prisma de `Pedido.estado` → `estadoEntrega` + backfill idempotente + índices `[estadoEntrega, fecha]` / `[embarqueId, estadoEntrega]`. | ✅ **hecho (PR #152)** |
| **G5.1** | Helper `proyectarEstadoPago` (dominio) + migrar los ~6 escritores raw de `estadoPago` + `visual-states.ts`/`getEstadoPagoBadge` derivan con la misma regla + fix `casos/[id]/route.ts:339`. **Escritura hacia adelante, sin backfill, sin CHECK.** | Pendiente — **medio riesgo** (`ANTICIPADO` visible en pedidos nuevos/re-guardados) |
| **G5.3 + G5.4** | Dejar de escribir + `DROP COLUMN "Pedido".estado` + `DROP TYPE "EstadoPedido"`. | **Reevaluado — desprioritizado, ver abajo** |
| **G5.5** (condicional) | Backfill de `ANTICIPADO` + CHECK `chk_pedido_estadopago_proyectado`. | Decisión de rollout aparte |

### Reevaluación del retiro de `Pedido.estado` (2026-09-01)

El intento de `DROP COLUMN` reveló que `Pedido.estado` está mucho más acoplado
que el "~8 lectores" que estimaba este ADR: **~20 archivos** — rutas de API
(`clientes/[id]`, `clientes/[id]/historial`, `nomina`, `embarques/[id]`,
`embarques`), tipos del payload de `embarques/[id]` (`EmbarqueDetalle` /
`PedidoEnriquecido` propagan `estado`), scripts de `prisma/` (`seed-realista`,
`validate-data`, `create-pedido-fiado`), `scripts/crear-factura-demo.ts`,
`test-fixes.ts` (raíz), y varios tests de integración.

**Decisión: el `DROP COLUMN` se desprioriza.** `estado` y `estadoEntrega` son
enums idénticos, siempre en sync (dual-write de `PedidoMapper` + backfill de
G5.2), verificado a 0 divergencias en prod. El "problema de dos fuentes" es
cosmético mientras el invariante se mantenga. El valor real de G5 está en
**G5.1** (`proyectarEstadoPago`).

Si se retoma el drop, es un PR dedicado grande (~20 archivos, migración de los
tipos del payload de embarques) con su propia revisión — no un "cleanup" chico.
Mientras tanto: **ningún código nuevo debe leer `Pedido.estado`** — usar
`estadoEntrega`.

## Alcance

- **Dentro:** todo lo de la tabla de arriba. `.claude/specs/pedidos.md`.
- **Fuera:** `EstadoPago`/`canal` como enum vs string. El rediseño de badges de UI (Fase 3).
  El backfill + CHECK (G5.5) es condicional a una decisión de rollout explícita.

## Migración

- G5.1: cero DDL, solo código.
- G5.2/G5.3: cero DDL. G5.4: `DROP COLUMN`/`DROP TYPE` (reversible recreando +
  backfill trivial `estado := estadoEntrega`).
- G5.5: `NOT VALID` → backfill
  `UPDATE "Pedido" SET "estadoPago" = 'ANTICIPADO' WHERE "totalPagado" >= total
  AND "estadoEntrega" IN ('PENDIENTE','EN_RUTA') AND "estadoPago" <> 'VENCIDO'`
  → `VALIDATE`. El backfill **no inventa historia** — re-etiqueta pagos que
  genuinamente fueron anticipados.

## Concurrencia / idempotencia

Sin cambios de locks. El helper `proyectarEstadoPago` es puro. Los writes de
`estadoPago` ya ocurren dentro de las transacciones/locks existentes de cada
comando.

## Tests obligatorios

- `proyectarEstadoPago`: cada fila de la tabla de semántica de `ANTICIPADO`
  (§2) + `VENCIDO` override + limpieza de `VENCIDO` al pagar.
- `ANTICIPADO` ⟺ `totalPagado >= total ∧ estadoEntrega ∈ {PENDIENTE, EN_RUTA}`.
  Al entregar → `PAGADO`. Al anular/cancelar → `ANULADO`.
- Regresión: `pagar-fiado`, entrega, cierre, crons — `estadoPago` resultante
  idéntico al actual **salvo** los pedidos prepago-pendientes, que ahora dan
  `ANTICIPADO` (esperado).
- La UI muestra "Anticipado" para un pedido prepago-pendiente aunque su columna
  esté aún en `PAGADO` (badge derivado).
- `estado` == `estadoEntrega` para todo `Pedido` (invariante durante G5.2–G5.3).
- Cada lector migrado en G5.2: mismo resultado leyendo `estadoEntrega`.
- `casos/[id]` que resolvía marcando `PAGADO`: ahora registra el `Pago`.

## Consecuencias

- Una fuente menos: `estado` desaparece; `estadoPago` deja de ser "otra cosa que
  alguien puede escribir mal" y pasa a ser proyección de una regla única.
- `casos/[id]/route.ts` necesita un fix real (no un `if`): resolver un caso que
  implica "el cliente ya pagó" debe registrar el `Pago`, no forzar el enum.
- `EstadoPedido` (enum Prisma) se elimina — cualquier import de `@prisma/client`
  de `EstadoPedido` (hay algunos en `cierre/route.ts`) migra a `EstadoEntrega`.
