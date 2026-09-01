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
su valor queda **definido** por una regla única y protegido por CHECK.

**Regla `proyectarEstadoPago(total, totalPagado, estadoEntrega)`** (helper único en el dominio):

```
estadoEntrega ∈ {CANCELADO, ANULADO}          → ANULADO
totalPagado >= total  ∧  estadoEntrega=ENTREGADO → PAGADO
totalPagado >= total  ∧  estadoEntrega≠ENTREGADO → ANTICIPADO   (← escritor de ANTICIPADO, cierra G7)
totalPagado > 0                                → PARCIAL
si no                                          → PENDIENTE
```

**`VENCIDO`** es el único override: el cron `vencimiento-promesas` lo aplica
cuando `promesaPagoFecha < now` y el proyectado sería `PENDIENTE`/`PARCIAL`; se
limpia (vuelve al proyectado) en el próximo pago.

**CHECK constraint** (patrón `chk_pedido_saldo_calc`, `NOT VALID` → `VALIDATE`):

```sql
ALTER TABLE "Pedido" ADD CONSTRAINT chk_pedido_estadopago_proyectado CHECK (
  "estadoPago" = 'VENCIDO'
  OR "estadoPago" = (CASE
     WHEN "estadoEntrega" IN ('CANCELADO','ANULADO') THEN 'ANULADO'
     WHEN "totalPagado" >= total THEN (CASE WHEN "estadoEntrega" = 'ENTREGADO' THEN 'PAGADO' ELSE 'ANTICIPADO' END)
     WHEN "totalPagado" > 0 THEN 'PARCIAL'
     ELSE 'PENDIENTE' END)::"EstadoPago"
) NOT VALID;
```

Esto **hace fallar** el `data: { estadoPago: 'PAGADO' }` de `casos/[id]/route.ts:339`
si no ajusta `totalPagado` — es el objetivo (surface del bug). Fase B corrige ese
caller para que use el helper o ajuste los totales antes de `VALIDATE`.

Todos los escritores (`pagar-fiado`, `procesar-pedido`, crons, PedidoMapper,
use-cases) pasan a llamar `proyectarEstadoPago(...)` en vez de calcular a mano.

### 3. La UI

Ningún cambio de contrato: los consumidores siguen leyendo `Pedido.estadoEntrega`
y `Pedido.estadoPago`. `visual-states.ts` / `getEstadoPagoBadge` (que hoy derivan
un 4º estado de presentación) se alinean con `proyectarEstadoPago` + la señal de
confirmación de `ADR-PAGO-REPORTADO-CONFIRMADO-001`.

## Alcance

- **Dentro:** retiro de `Pedido.estado` (4 fases), `proyectarEstadoPago` helper +
  CHECK, migración de los ~6 escritores raw de `estadoPago`, corrección de
  `casos/[id]/route.ts:339`, `.claude/specs/pedidos.md`.
- **Fuera:** `EstadoPago` como enum vs string (se queda enum). `PlantillaRecurrente.tipo`
  (ADR-PEDIDO-ORIGEN-CANAL-001). El rediseño de badges de UI (Fase 3).

## Migración

- Fase B/C: cero DDL, solo código. Fase D: `DROP COLUMN` + `DROP TYPE` (reversible
  recreando + backfill trivial, `estado := estadoEntrega`).
- CHECK de `estadoPago`: `NOT VALID` primero (no bloquea inserts existentes),
  `VALIDATE` después de corregir los datos que violen (query de detección incluida).
- Backfill de `ANTICIPADO`: `UPDATE "Pedido" SET "estadoPago" = 'ANTICIPADO'
  WHERE "totalPagado" >= total AND "estadoEntrega" NOT IN ('ENTREGADO','CANCELADO','ANULADO')
  AND "estadoPago" <> 'VENCIDO'` — no inventa nada, reclasifica lo que ya era `PAGADO` mal puesto.

## Concurrencia / idempotencia

Sin cambios de locks. El helper `proyectarEstadoPago` es puro. Los writes de
`estadoPago` ya ocurren dentro de las transacciones/locks existentes de cada
comando.

## Tests obligatorios

- `estado` == `estadoEntrega` para todo `Pedido` (invariante durante A–C).
- Cada lector migrado en Fase B: mismo resultado leyendo `estadoEntrega`.
- `proyectarEstadoPago`: los 5 casos + `VENCIDO` override + limpieza de `VENCIDO` al pagar.
- CHECK rechaza `estadoPago='PAGADO'` con `saldo>0`; acepta `VENCIDO`.
- Regresión: `pagar-fiado`, entrega, cierre, crons — `estadoPago` resultante idéntico
  al actual salvo los casos `ANTICIPADO` nuevos.
- `casos/[id]` que resolvía marcando `PAGADO`: ahora ajusta `totalPagado` (o falla claro).

## Consecuencias

- Una fuente menos: `estado` desaparece; `estadoPago` deja de ser "otra cosa que
  alguien puede escribir mal" y pasa a ser proyección verificada por DB.
- `casos/[id]/route.ts` necesita un fix real (no un `if`): resolver un caso que
  implica "el cliente ya pagó" debe registrar el `Pago`, no forzar el enum.
- `EstadoPedido` (enum Prisma) se elimina — cualquier import de `@prisma/client`
  de `EstadoPedido` (hay algunos en `cierre/route.ts`) migra a `EstadoEntrega`.
