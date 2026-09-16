# AGUA BAMBÚ — F5 P1-A: AUTORIDAD FÍSICA (CARGA/RECARGA/SALIDAS/RETORNO/REEMPAQUE/DESCARTE)

**Versión:** 1.0
**Fecha:** 2026-09-16
**Responde a:** reordenamiento del equipo — antes de implementar RECARGA como funcionalidad aislada, cerrar la semántica y trazabilidad de la autoridad física sobre la que va a operar (P1-A), siguiendo el orden P1-A → P1-B → P1-C → ... → P1-F. Instrucción explícita: *"No necesariamente debemos crear un nuevo TipoMovimiento para cada una; primero debemos verificar cuál es el modelo técnico mínimo compatible con el dominio existente."* **Cero código en este documento** — es diseño, siguiendo el mismo patrón usado en F1-F4 (mapa de brechas → diseño → revisión del equipo → implementación).

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
3. **Vocabulario de `motivo`**: hoy es `String?` libre. Cambio mínimo: no migrar a un `enum` de Prisma (requiere migración de tipo, mayor superficie) — basta con una validación de aplicación (Zod / `validarMovimientoFisico`-style) contra una lista cerrada de valores, mismo patrón ya usado para `AJUSTE_AUTORIZADO.metadata.effect` (`'INCREASE'|'DECREASE'`, validado en código + CHECK constraint, sin ser un enum de columna). Lista propuesta a partir del comentario ya existente: `DEVUELTA` (o el valor que el equipo prefiera para "no vendido, comercializable" — el comentario actual no lo incluye explícitamente, es un hueco de vocabulario a cerrar), `PACA_FILTRADA`, `DEFECTUOSA` (daño/rota), `EMPAQUE_ROTO`, `CLIENTE_RECHAZA`. **Pregunta abierta para el equipo, no resuelta aquí**: ¿"DEVUELTA" necesita su propio valor de motivo, o la AUSENCIA de motivo (campo `null`) ya representa "sin defecto, simplemente no vendido"? Ambas lecturas son razonables; no se decide unilateralmente.
4. **UI del wizard de cierre**: corrige la etiqueta "Filtradas" (hoy sobre el campo `rotas`, confirmado en PR #266) — con `Retorno.motivo` activado, la UI ya tendría un lugar real donde capturar la distinción FILTRADA vs DAÑADA si el equipo decide que el simple contador `rotas` no es suficiente granularidad. **Esto es un cambio de P1-D (RETORNO/REEMPAQUE) o P2 (UI), no de este documento** — aquí solo se deja preparado el modelo que lo haría posible.

---

## 4. REEMPAQUE — necesita una única FK nueva para dejar de ser un movimiento aislado

### Hallazgo (ya confirmado en PR #266)

`REEMPAQUE` es hoy un movimiento manual, aislado, sin ningún vínculo a la `RETORNO` que lo originó, y sin ningún efecto rastreable sobre disponibilidad — `grep` sin resultados en `src/modules`/`src/lib` para cualquier lógica de dominio que lo consuma.

### Modelo técnico mínimo propuesto

**Una sola columna nueva**, mismo patrón exacto que `EmbarqueMovimiento.cargaId` (ya activado en PR #262 para vincular `CARGA` a su `EmbarqueCarga` de origen): agregar `EmbarqueMovimiento.retornoId String?` (FK opcional a `Retorno`, `onDelete: SetNull` — mismo estilo que `cargaId`). Un movimiento `REEMPAQUE` (o, en el caso irrecuperable, `DESCARTE`) que procesa una `Retorno` existente fija `retornoId` a esa fila. Esto es lo mínimo que permite reconstruir la cadena `FILTRADA → RETORNO → REEMPAQUE → disponible` (o `→ DESCARTE`) por consulta directa, sin inventar una entidad puente nueva (no se repite el patrón de `Sustitucion`, que sí necesitó una entidad puente porque conecta DOS movimientos activos simultáneos — aquí es una relación simple 1-a-N: una `Retorno` puede dar lugar a un `REEMPAQUE` posterior, no dos hechos físicos simultáneos).

### Qué NO se decide en este documento

- **Si "disponible de nuevo" debe reflejarse en algún contador de stock físico** (ej. sumarse de vuelta a la capacidad disponible de P1-B) — el ADR dice que `REEMPAQUE` es "neutro en cantidad total; puede reclasificar", lo que sugiere que NO debe restar de `SALIDAS` (nunca salió definitivamente) ni sumar a `CARGA`/`RECARGA` (no es una recarga real) — simplemente dejó de estar en estado "defectuoso pendiente" y pasa a "vendible", un estado que hoy no existe como tal en ningún lado. Si el equipo decide que esto necesita un estado explícito (ej. `Retorno.disposicion: 'PENDIENTE'|'REEMPACADO'|'DESCARTADO'`), es un campo adicional sobre el mismo modelo `Retorno` — no una entidad nueva — pero es una decisión de negocio (¿se necesita ese estado explícito, o basta con que exista el movimiento `REEMPAQUE` vinculado como evidencia de que ya se resolvió?) que no se toma aquí.
- **Quién decide REEMPAQUE vs DESCARTE** — confirmado en PR #266 que hoy es 100% manual sin ninguna regla de sistema. Este documento no propone automatizar esa decisión (sería inventar una regla de negocio no pedida) — solo asegura que, decida quien decida, quede trazado hacia su `Retorno` de origen.

---

## 5. DESCARTE — sin cambios de modelo; comparte una pregunta con P1-E (CAMBIO)

`DESCARTE` ya existe como `TipoMovimiento` completo, con efecto claro ("salida definitiva", `ADR-FISICO-001:24`) y caller real vía el endpoint manual. No requiere ningún cambio de modelo. Con la FK de §4 (`retornoId`), un `DESCARTE` que resulta de un `REEMPAQUE` fallido también queda trazable a su origen, igual que un `REEMPAQUE` exitoso.

**Pregunta compartida con P1-E, señalada aquí para que el equipo la resuelva una sola vez**: tanto "FILTRADA/DAÑADA pendiente de decidir si es recuperable" (este documento) como "CAMBIO pendiente de inspección" (P1-E) describen el mismo patrón general — *"producto recibido, disposición todavía no determinada, alguien con autoridad decide después."* Si el equipo quiere un mecanismo único de "pendiente de disposición" reutilizable entre ambos casos, es una decisión de diseño que vale la pena tomar UNA vez, no dos veces por separado en P1-D y P1-E. No se propone la forma de ese mecanismo aquí — se deja como pregunta explícita antes de diseñar P1-D/P1-E en detalle.

---

## Resumen — qué queda cerrado en P1-A y qué se hereda

| Concepto | Modelo técnico mínimo | ¿Requiere migración? | Hereda a |
|---|---|---|---|
| CARGA/RECARGA | Sin cambios sobre PR #262/#264 | No (ya diseñado) | P1-C |
| SALIDAS | Semántica cerrada (físico puro, nunca `Pedido.entregadas`) | No en P1-A | Mecanismo de escritura en vivo → **P1-B** |
| RETORNO | Activar `Retorno.motivo` ya existente, vinculado por `movimientoId` | No (campo ya existe) | Vocabulario final de `motivo` → equipo; UI → P1-D/P2 |
| REEMPAQUE | Nueva FK `EmbarqueMovimiento.retornoId` (mismo patrón que `cargaId`) | Sí, aditiva, sin backfill | Estado "disposición" (si se decide) → equipo |
| DESCARTE | Sin cambios | No | Comparte pregunta de "pendiente de disposición" con P1-E |

**Ningún código en este documento.** Dos preguntas explícitas quedan para el equipo antes de implementar P1-A: (1) vocabulario final de `motivo` para DEVUELTA (§3.3), (2) si se necesita un estado de "disposición" explícito o basta con la trazabilidad de movimientos (§4, §5). El resto del modelo mínimo puede implementarse sin más decisiones pendientes.
