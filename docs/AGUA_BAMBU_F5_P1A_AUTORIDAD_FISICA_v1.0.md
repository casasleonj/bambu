# AGUA BAMBÚ — F5 P1-A: AUTORIDAD FÍSICA (CARGA/RECARGA/SALIDAS/RETORNO/REEMPAQUE/DESCARTE)

**Versión:** 1.1
**Fecha:** 2026-09-16
**Responde a:** reordenamiento del equipo — antes de implementar RECARGA como funcionalidad aislada, cerrar la semántica y trazabilidad de la autoridad física sobre la que va a operar (P1-A), siguiendo el orden P1-A → P1-B → P1-C → ... → P1-F. Instrucción explícita: *"No necesariamente debemos crear un nuevo TipoMovimiento para cada una; primero debemos verificar cuál es el modelo técnico mínimo compatible con el dominio existente."* **Cero código en este documento** — es diseño, siguiendo el mismo patrón usado en F1-F4 (mapa de brechas → diseño → revisión del equipo → implementación).

**v1.1**: el equipo cerró las 2 preguntas que v1.0 había dejado abiertas — `DEVUELTA` es un valor explícito de `motivo` (nunca `null`), y sí hace falta una `disposicion` explícita sobre `Retorno` (`PENDIENTE`/`DISPONIBLE`/`DESCARTADO`, un solo campo nuevo, sin entidad adicional). **P1-A queda cerrado según el equipo — "no implementaría todavía nada adicional en este PR".** Siguiente paso: diseñar P1-B (capacidad física, incluyendo cómo se calculan las `SALIDAS` en tiempo real sin duplicar los movimientos del cierre).

---

## Principio rector de todo este documento

`RETORNO` sigue siendo, sin excepción, **el hecho físico** ("el producto regresa"). `DEVUELTA`/`FILTRADA`/`DAÑADA`/`CLIENTE_RECHAZA` son la **disposición/motivo** de ese hecho — nunca tipos de movimiento nuevos. Esto ya está implícito en `ADR-FISICO-001` ("un `EmbarqueMovimiento` representa un hecho físico dirigido") y es exactamente lo que el equipo reafirmó. El modelo técnico mínimo consiste en **activar y conectar piezas que ya existen en el schema**, no en inventar nuevas.

---

## 1. CARGA / RECARGA — sin cambios adicionales sobre lo ya diseñado

Ya cerrado: PR #262 (CARGA, dual-write al ledger físico) y PR #264 (RECARGA, diseño técnico completo — pendiente de implementación, ahora reordenada a P1-C). Este documento no propone nada nuevo aquí — se listan solo para que la secuencia P1-A quede completa y visible en un solo lugar. **Precondición para P1-C**: este documento (P1-A) y P1-B deben cerrarse primero, tal como pidió el equipo.

---

## 2. SALIDAS — semántica cerrada aquí, mecanismo técnico heredado a P1-B

### Semántica (cerrada en este documento)

`SALIDAS` = todo lo que deja físicamente la custodia del vehículo, sin importar la razón comercial: `ENTREGA` + `VENTA_RUTA` + `PROMOCION` + `DESCARTE` + `CUSTODY_TRANSFER` saliente. Es un concepto **puramente físico**, autoridad exclusiva del ledger físico (`EmbarqueMovimiento`) — **nunca** `Pedido.entregadas` (que es cumplimiento comercial, autoridad de `Pedido`/`PedidoItem`, sin relación con esto). Reafirma la corrección ya hecha en PR #266 §A sobre el naming: cualquier contador que se cree para esto no puede llamarse `entregadas` ni vivir conceptualmente dentro de la órbita de `Pedido`.

### Brecha técnica heredada a P1-B (no se resuelve aquí)

De las 5 componentes de SALIDAS, hoy solo 2 se escriben en tiempo real en el ledger físico:
- `PROMOCION` — tiempo real, ya corregido en PR #267 (P0).
- `ENTREGA`/`RETORNO` de **botellón específicamente** — tiempo real, vía `POST /api/embarques/[id]/botellones` (`botellones.service.ts`).
- `DESCARTE`/`CUSTODY_TRANSFER` — tiempo real, vía el endpoint manual genérico (`POST /api/embarques/[id]/movimientos`).
- **`ENTREGA`/`VENTA_RUTA` para los otros 4 productos (`PACA_AGUA`, `PACA_HIELO`, `BOLSA_AGUA`, `BOLSA_HIELO`) solo se escriben al CERRAR el embarque** (`RegistrarMovimientosCierre`, invocado únicamente desde `CerrarEmbarqueUseCase`) — confirmado extensamente en PR #264 §9.1.

**Esta es la decisión técnica central que P1-B va a tener que tomar, no este documento**: ¿se extiende la escritura en vivo de `ENTREGA`/`VENTA_RUTA` a los 4 productos restantes (mismo patrón ya probado en botellón, pero requiere tocar `EntregarPedidoUseCase`/`venta-libre` y coordinar con el dual-write de cierre para no duplicar el hecho), o se deriva `SALIDAS` en vivo desde `Pedido`/`PedidoItem` como aproximación (ya identificado en PR #264 §9-§10 con su límite honesto documentado — pedidos desasignados tras entrega parcial no se verían)? **Ninguna de las dos opciones se decide en P1-A** — se deja explícitamente para P1-B, con ambas rutas ya evidenciadas y sus costos conocidos.

---

## 3. RETORNO — activar `Retorno.motivo`, ya construido y huérfano

### Modelo técnico mínimo propuesto

**No crear ningún modelo ni campo nuevo.** El modelo `Retorno` (`schema.prisma:1235-1254`) ya tiene exactamente la forma necesaria:
```prisma
model Retorno {
  producto     String
  cantidad     Int
  motivo       String?  // EMPAQUE_ROTO, PACA_FILTRADA, DEFECTUOSA, CLIENTE_RECHAZA, ...
  movimientoId String?  // FK a EmbarqueMovimiento — el hecho físico que este motivo explica
  offlineId    String?  @unique
}
```
Confirmado en PR #266 (investigación previa): cero escritores reales, solo un test de CHECK constraint aislado. **El trabajo es exclusivamente de wiring, no de modelado.**

### Cambios mínimos propuestos (no implementados todavía)

1. **Cierre de embarque**: hoy `registrar-movimientos-cierre.service.ts` agrega `devueltas + rotas` en un solo `EmbarqueMovimiento{RETORNO}` por producto, sin metadata (confirmado en PR #266 §C). Propuesta: mantener el `EmbarqueMovimiento{RETORNO}` agregado tal cual (no tocar la conciliación existente, cumple "no modificar la conciliación sin necesidad"), pero **crear además, en la misma transacción, una fila `Retorno` por cada componente no-cero** (`devueltas` → `motivo` que represente "no vendido, comercializable" — ver nota de vocabulario abajo; `rotas` → `motivo` que represente el defecto), cada una vinculada vía `movimientoId` al movimiento agregado. Esto separa por primera vez DEVUELTA de FILTRADA/DAÑADA sin tocar la aritmética de conciliación ya cerrada (P0).
2. **Endpoint de `Sustitucion`**: ya escribe `metadata:{motivo:'DEFECTUOSA'}` en el `EmbarqueMovimiento` de recepción (`ledger-fisico.service.ts:88`) — migrar esto a también crear una fila `Retorno` (mismo `motivo`, vinculada al mismo movimiento) unifica el lugar donde se consulta "motivo de un retorno", en vez de tener el dato repartido entre `metadata` JSON libre y el modelo dedicado.
3. **Vocabulario de `motivo` — CERRADO por el equipo.** `DEVUELTA` es un valor explícito, nunca `null` — "ya diferenciamos operacionalmente DEVUELTA de FILTRADA, DEFECTUOSA/DAÑADA, etc." Lista de motivo (aplicación, no enum de columna — mismo patrón que `AJUSTE_AUTORIZADO.metadata.effect`, sin migración de tipo): `DEVUELTA`, `PACA_FILTRADA`, `DEFECTUOSA` (daño/rota), `EMPAQUE_ROTO`, `CLIENTE_RECHAZA`. `motivo` deja de ser opcional en la práctica para toda `Retorno` creada por el wiring nuevo (siempre se conoce al momento de la captura — la UI del wizard ya distingue `devueltas` de `rotas` como campos separados, ver §UI abajo).
4. **UI del wizard de cierre**: corrige la etiqueta "Filtradas" (hoy sobre el campo `rotas`, confirmado en PR #266) — con `Retorno.motivo` activado, la UI ya tendría un lugar real donde capturar la distinción FILTRADA vs DAÑADA si el equipo decide que el simple contador `rotas` no es suficiente granularidad. **Esto es un cambio de P1-D (RETORNO/REEMPAQUE) o P2 (UI), no de este documento** — aquí solo se deja preparado el modelo que lo haría posible.

---

## 4. REEMPAQUE — necesita una única FK nueva para dejar de ser un movimiento aislado

### Hallazgo (ya confirmado en PR #266)

`REEMPAQUE` es hoy un movimiento manual, aislado, sin ningún vínculo a la `RETORNO` que lo originó, y sin ningún efecto rastreable sobre disponibilidad — `grep` sin resultados en `src/modules`/`src/lib` para cualquier lógica de dominio que lo consuma.

### Modelo técnico mínimo propuesto

**Una sola columna nueva**, mismo patrón exacto que `EmbarqueMovimiento.cargaId` (ya activado en PR #262 para vincular `CARGA` a su `EmbarqueCarga` de origen): agregar `EmbarqueMovimiento.retornoId String?` (FK opcional a `Retorno`, `onDelete: SetNull` — mismo estilo que `cargaId`). Un movimiento `REEMPAQUE` (o, en el caso irrecuperable, `DESCARTE`) que procesa una `Retorno` existente fija `retornoId` a esa fila. Esto es lo mínimo que permite reconstruir la cadena `FILTRADA → RETORNO → REEMPAQUE → disponible` (o `→ DESCARTE`) por consulta directa, sin inventar una entidad puente nueva (no se repite el patrón de `Sustitucion`, que sí necesitó una entidad puente porque conecta DOS movimientos activos simultáneos — aquí es una relación simple 1-a-N: una `Retorno` puede dar lugar a un `REEMPAQUE` posterior, no dos hechos físicos simultáneos).

### Disposición — CERRADO por el equipo, resuelto sobre `Retorno` con el mínimo cambio

El equipo confirmó: sí hace falta distinguir explícitamente **pendiente / disponible / descartado** — no basta con inferirlo permanentemente de la cadena de movimientos. Separación de 3 capas, reafirmada:
```
RETORNO      = qué hecho físico ocurrió       (ya existe, TipoMovimiento)
motivo       = por qué regresó                (Retorno.motivo, §3, cerrado)
disposición  = qué terminó ocurriendo         (nuevo campo, esta sección)
```

**Modelo técnico mínimo**: un solo campo nuevo, `Retorno.disposicion String @default("PENDIENTE")` — sin entidad nueva, sin enum de columna (misma validación de aplicación que `motivo`). Tres valores: `PENDIENTE` | `DISPONIBLE` | `DESCARTADO`. No se agrega un 4º valor "REEMPACADO" separado — el ejemplo del equipo (`FILTRADA → REEMPACADO → DISPONIBLE`) queda representado por **`disposicion='DISPONIBLE'` + `retornoId` de un `EmbarqueMovimiento{REEMPAQUE}` apuntando a esta fila** (la FK de §4 ya es la evidencia de *cómo* se llegó a disponible; `disposicion` solo responde la pregunta terminal *puede usarse o no*).

**Transiciones, sin ambigüedad de escritor:**
- Al crear la `Retorno`: si `motivo='DEVUELTA'` (nunca fue defectuosa), `disposicion` se fija a `'DISPONIBLE'` en el mismo `create` — no necesita inspección, coherente con "producto que salió y no se vendió, sigue comercializable" (Plan Maestro, sección DEVUELTA). Para cualquier otro `motivo` (`PACA_FILTRADA`/`DEFECTUOSA`/`EMPAQUE_ROTO`/`CLIENTE_RECHAZA`), `disposicion` nace `'PENDIENTE'` — default de la columna, sin decisión todavía.
- Un `EmbarqueMovimiento{REEMPAQUE, retornoId}` posterior → `UPDATE Retorno SET disposicion='DISPONIBLE' WHERE id=retornoId`. **Confirmado explícitamente por el equipo: REEMPAQUE no crea una carga nueva ni suma unidades a ningún contador de inventario** — es una operación interna que solo cambia `disposicion` de una fila ya existente. No toca `EmbarqueCarga`/`EmbarqueCargaProducto`/`EmbarqueProducto`, no interactúa con `SALIDAS` (P1-B) en ninguna dirección.
- Un `EmbarqueMovimiento{DESCARTE, retornoId}` posterior (reempaque fallido, o irrecuperable desde el inicio) → `UPDATE Retorno SET disposicion='DESCARTADO' WHERE id=retornoId`.

**Quién decide REEMPAQUE vs DESCARTE**: sigue sin automatizarse (confirmado en PR #266: 100% manual, sin regla de sistema) — este documento no inventa esa regla, solo asegura que la decisión, la tome quien la tome, quede trazada.

---

## 5. DESCARTE — sin cambios de modelo adicionales

`DESCARTE` ya existe como `TipoMovimiento` completo, con efecto claro ("salida definitiva", `ADR-FISICO-001:24`) y caller real vía el endpoint manual. Con la FK de §4 (`retornoId`) y el campo `disposicion` de §4bis, un `DESCARTE` que resulta de un `REEMPAQUE` fallido ya queda completamente trazable y resuelto (`disposicion='DESCARTADO'`) sin necesitar nada adicional.

La pregunta que este documento había dejado compartida con P1-E ("mecanismo único de pendiente de disposición") **queda resuelta para el caso de RETORNO** con el campo `disposicion` de §4bis. Si P1-E (CAMBIO) puede reutilizar el mismo patrón (un campo `disposicion` análogo sobre la entidad que corresponda a CAMBIO) es algo a confirmar cuando se diseñe P1-E en detalle — no se fuerza la reutilización aquí, pero el precedente queda documentado.

---

## Resumen — qué queda cerrado en P1-A y qué se hereda

| Concepto | Modelo técnico mínimo | ¿Requiere migración? | Estado |
|---|---|---|---|
| CARGA/RECARGA | Sin cambios sobre PR #262/#264 | No (ya diseñado) | Reordenado a P1-C |
| SALIDAS | Semántica cerrada (físico puro, nunca `Pedido.entregadas`) | No en P1-A | Mecanismo de escritura en vivo → **hereda a P1-B** |
| RETORNO | `Retorno.motivo` activado, vocabulario cerrado (`DEVUELTA` explícito, nunca `null`) | No (campo ya existe) | **CERRADO** |
| REEMPAQUE / disposición | Nueva FK `EmbarqueMovimiento.retornoId` + nuevo campo `Retorno.disposicion` (`PENDIENTE`/`DISPONIBLE`/`DESCARTADO`) | Sí, aditiva, sin backfill, mismo patrón que `cargaId` | **CERRADO** — REEMPAQUE confirmado neutro (no crea carga ni suma unidades) |
| DESCARTE | Sin cambios adicionales — resuelto vía `retornoId`+`disposicion` | No | **CERRADO** |

**P1-A cerrado según el equipo. Ningún código implementado todavía en este PR** — el modelo mínimo queda documentado, listo para implementarse cuando el equipo lo autorice explícitamente (probablemente junto con P1-D, que es donde estos campos se ejercitan por primera vez). Siguiente paso: diseño de **P1-B** (capacidad física — separar producto bajo custodia / pedidos asignados / venta libre / cumplimiento comercial, y resolver el mecanismo de `SALIDAS` en tiempo real sin duplicar los movimientos del cierre).
