# ADR-PEDIDO-ORIGEN-CANAL-001 — `canal` canónico, `tipo` eliminado, `origen` = procedencia

- Estado: **Aceptado** (aprobado por el PO el 2026-09-01)
- Fecha: 2026-08-31 (aprobado 2026-09-01)
- Fuente: ALS Operación Comercial §5, §50.3.A, §50.3.D; Plan Técnico §22; INVENTARIO §G6
- Fase de implementación: FASE 2 (Pedidos). Independiente de G5.
- Sin decisión de producto pendiente — decisión técnica de contrato.

## Estado de implementación (2026-09-01)

- **G6.1 — ✅ hecho (PR #149, mergeado).** Migrados todos los lectores de
  `Pedido.tipo` → `canal` en el flujo de Pedidos: filtro UI "Tipo" → "Canal"
  (`?canal=`, con `?tipo=` legacy auto-migrado), detalle, `page.tsx`,
  `/api/pedidos`, `usePedidos`, `ListarPedidosUseCase`, `PedidoFilter`,
  `PrismaPedidoRepository`. Helper `src/lib/pedido-canal.ts`. Sin schema.
- **Enum `CanalPedido` (§1) — se toma la alternativa de menor riesgo.** `canal`
  se queda como `String`; `CanalVO` (dominio) es la única puerta de escritura +
  `normalizeCanalFilter` valida en los bordes. Convertir a enum ahora aporta
  poco y agrega una migración de tipo de columna coordinada con G5. Reevaluable.
- **`Pedido.tipo` / `PlantillaRecurrente.tipo` — se dejan de escribir y se
  dropean en el mismo pase de limpieza de schema que la fase D de G5**
  (`ADR-PEDIDO-ESTADO-CANONICO-001`), para no tener dos migraciones de columna
  de `Pedido` en vuelo a la vez. `PedidoMapper` sigue escribiendo `tipo`
  (derivado, siempre consistente) hasta ese pase.
- **`ventaRapida` / `tipo` en `PedidoCreateSchema` (§4) — pendiente**, va con
  ese mismo pase (toca `CrearPedidoUseCase` + `venta-rapida-form`). Mientras
  tanto siguen siendo aliases aceptados; el cliente ya puede mandar `origen`.

## Contexto

`Pedido` tiene tres campos de clasificación con solape:

| Campo | Valores | Rol |
|---|---|---|
| `origen` | `OrigenPedido` = `PEDIDO`, `VENTA_RAPIDA`, `VENTA_LIBRE`, `RECURRENTE` | **procedencia / mecanismo de captura** — bien definido |
| `canal` | `String` = `'PUNTO'` \| `'DOMICILIO'` | **canal comercial** — determina sobrecosto domicilio, precios, filtros. Tiene VO (`CanalVO`) |
| `tipo` | `String` = `'ENVIO'` \| `'PUNTO'` | **100% derivado de `canal`** — `PedidoMapper.ts:152`: `tipo = canal === 'PUNTO' ? 'PUNTO' : 'ENVIO'` |

`tipo` no aporta ninguna información sobre `canal` (`PUNTO↔PUNTO`, `DOMICILIO↔ENVIO`).
Solo lo leen 3 sitios: el filtro `filtroTipo` de `pedidos-client`, el badge de
detalle (`getTipoBadge`, `selectedPedido.tipo`), y `page.tsx:100` (`filter.tipo`).
Lo escriben `PedidoMapper`, `venta-libre/route.ts:207` (`tipo: 'ENVIO'` hardcode),
`recurrentes.ts`.

Además `PedidoCreateSchema` acepta `ventaRapida: boolean` (LEGACY) además de
`origen`, dos formas de decir lo mismo.

## Decisión

### 1. `canal` es el canal canónico. Se promueve a enum.

```prisma
enum CanalPedido {
  PUNTO
  DOMICILIO
}
model Pedido {
  canal CanalPedido @default(DOMICILIO)
}
```

Consistente con el resto del schema (`EstadoEntrega`, `OrigenPedido`…). El `CanalVO`
ya valida los mismos dos valores. Migración: `String` → enum con `USING` cast
(los datos ya son exactamente `'PUNTO'`/`'DOMICILIO'`).

> **Alternativa de menor riesgo** si el PO prefiere no migrar el tipo de columna:
> dejar `canal String` y solo documentar que `CanalVO` es la única puerta de
> escritura. La eliminación de `tipo` (punto 2) es independiente y se hace igual.

### 2. `Pedido.tipo` se elimina (expand-contract)

| Fase | Acción |
|---|---|
| B | Migrar los 3 lectores a derivar de `canal`: `filtroTipo` → filtro de canal (`PUNTO`↔`PUNTO`, `ENVIO`↔`DOMICILIO`); `getTipoBadge(pedido)` → `getCanalBadge(pedido.canal)`; `page.tsx:100` idem. |
| C | Dejar de escribir `tipo` (`PedidoMapper`, `venta-libre`, `recurrentes`). Default DB `tipo = 'ENVIO'` durante la ventana. |
| D | `ALTER TABLE "Pedido" DROP COLUMN "tipo";` |

El filtro de la UI de pedidos pasa a llamarse "Canal" con opciones Punto / Domicilio
(hoy dice "Tipo" con Envío / Punto — mismo significado).

`PlantillaRecurrente.tipo` recibe el mismo tratamiento en la misma fase (también
es derivado de su `canal`).

### 3. `origen` se mantiene tal cual

`OrigenPedido` registra **cómo se capturó / de dónde viene** la operación. **No**
determina el estado final — eso lo deriva lo ocurrido (entrega/pago), ver
`ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`.

- `VENTA_RAPIDA` = experiencia de captura rápida en punto, no un "tipo de negocio"
  (Plan §22). Un `VENTA_RAPIDA` con `canal=DOMICILIO` (compra en punto + envío) es válido.
- `VENTA_LIBRE` = operación originada durante ejecución logística sin pedido previo
  (+ `embarqueOrigenId`, ver ADR de venta en ruta).
- **No** se renombra ningún valor. **No** se agrega un valor nuevo.

### 4. `ventaRapida: boolean` sale del schema de entrada

`PedidoCreateSchema` deja de aceptar `ventaRapida` y `tipo` (campos LEGACY). El
cliente manda `origen: 'VENTA_RAPIDA'` explícito (el campo `origen` ya existe en
el schema, default `'PEDIDO'`). `CrearPedidoUseCase` deja de mirar `ventaRapida`.

## Alcance

- **Dentro:** enum `CanalPedido` (o doc si el PO elige la alternativa), retiro de
  `Pedido.tipo` + `PlantillaRecurrente.tipo` (4 fases), limpieza de `ventaRapida`/`tipo`
  de `PedidoCreateSchema` y `CrearPedidoUseCase`, renombre del filtro UI "Tipo"→"Canal",
  `.claude/specs/pedidos.md`, `openapi.json` (`Pedido` schema).
- **Fuera:** cambiar los valores de `OrigenPedido`; sub-tipos de canal (mayorista,
  evento, etc. — si el negocio los pide, ADR propio); `canal` en otros modelos.

## Migración

- `canal String → CanalPedido`: `ALTER TABLE ... ALTER COLUMN "canal" TYPE "CanalPedido"
  USING "canal"::"CanalPedido"` (precedido de `CREATE TYPE`). Reversible a `TEXT`.
  Verificar antes: `SELECT DISTINCT canal FROM "Pedido"` = solo `{PUNTO, DOMICILIO}`.
- `DROP COLUMN "tipo"` (Fase D): reversible recreando + backfill
  `UPDATE "Pedido" SET tipo = CASE WHEN canal = 'PUNTO' THEN 'PUNTO' ELSE 'ENVIO' END`.
- Sin `SET NOT NULL` sobre datos históricos incompletos (no aplica — ambos campos ya tienen default).

## Concurrencia / idempotencia

Ninguna implicación — son campos de clasificación fijos en la creación, no mutan
en transiciones.

## Tests obligatorios

- `canal ∈ {PUNTO, DOMICILIO}` para todo `Pedido` (pre-migración de tipo de columna).
- Cada lector de `tipo` migrado: mismo resultado derivando de `canal`.
- Filtro UI "Canal": `PUNTO` trae los que antes eran `tipo=PUNTO`; `DOMICILIO` los `tipo=ENVIO`.
- `PedidoCreateSchema` rechaza `ventaRapida`/`tipo`; acepta `origen`.
- `CrearPedidoUseCase` con `origen: 'VENTA_RAPIDA'` + `canal: 'DOMICILIO'` → pedido válido
  (compra en punto con envío).
- Regresión: pricing (sobrecosto domicilio) sigue leyendo `canal`, sin cambios.

## Consecuencias

- Un campo menos en `Pedido` (`tipo`) y en `PlantillaRecurrente`.
- El contrato de entrada de pedidos deja de tener dos formas de decir "venta rápida".
- `openapi.json` `Pedido.tipo` y `AbonoCreate` (ya desincronizado) se corrigen de paso.
- La UI de pedidos habla de "Canal" (Punto/Domicilio), alineado con el resto del sistema.
