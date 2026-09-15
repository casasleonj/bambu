# AGUA BAMBÚ — F5: CONVERGENCIA CARGA / RECARGA

**Versión:** 1.0
**Fecha:** 2026-09-15
**Responde a:** revisión del equipo sobre el mapa de brechas de F5 — pidieron NO asumir que "está fuera del ledger" significa automáticamente que hay que incorporarlo, y exigieron el mismo estándar de convergencia usado en F1-F4 antes de tocar código: hallazgo → evidencia → autoridad → impacto → decisión existente → clasificación → brecha → criterio de éxito → cambio mínimo.

**Resultado adelantado**: la investigación profunda **desarma el hallazgo original en 3 hallazgos distintos**, cada uno con una naturaleza diferente — ninguno es "bug funcional activo" (a diferencia del GPS, PR #259). Además, corrige una sobre-estimación en el mapa de brechas original (§1 de este documento). **Cero implementación en este documento.**

---

## 0. Corrección sobre el mapa de brechas original — la "conciliación" SÍ existe

El mapa de brechas v1.0 (§3, "Brecha 2") afirmó "no existe ningún servicio de reconciliación... que sume `EmbarqueMovimiento`" y lo clasificó como brecha "media-alta". Investigación más profunda de `ADR-STOCK-001` (`docs/adr/ADR-STOCK-001.md`) corrige el marco: el ADR dice explícitamente que **"la conciliación `stock inicial + producción - ventas = stock final esperado` es una conciliación de CONTROL, no una sustitución del ledger físico"** (línea 30) — es decir, el propio diseño aprobado prevé DOS capas independientes con propósitos distintos, no una sola autoridad que deba fusionarlas.

Y esa conciliación de control **sí existe y corre en producción hoy**: `CierreEmbarqueService.conciliarProductos()`/`calcularDiscrepancia()` (`src/modules/embarques/domain/services/cierre-embarque.service.ts:63-115`) compara `cargadas` (de la `Carga`, construida desde `EmbarqueProducto`/el input de creación) contra `entregadas` (computado en vivo desde `Pedido`/`PedidoItem` al cerrar) + `devueltas`/`cambios`/`rotas`, y produce `totalFaltantes`/`totalSobrante` — exactamente el "stock inicial + producción - ventas = stock final esperado" que el ADR describe, solo que construido sobre `EmbarqueProducto`+consultas en vivo, no sobre `EmbarqueMovimiento`. Alimenta directamente `CrearDescuentoDiscrepanciaService`/`ResponsibilityCase` en el cierre real.

**Corrección de clasificación**: no hay ausencia de reconciliación — hay dos capas de control deliberadamente separadas (una activa y funcionando, otra — el ledger físico — sin rol de reconciliación por diseño). Este documento ya no trata "falta de reconciliación cruzada" como parte del hallazgo CARGA/RECARGA.

---

## 1. Hallazgo A — `CARGA` nunca se escribe en `EmbarqueMovimiento`

### Evidencia
- `ADR-FISICO-001.md:16-19` (Aceptado, congelado) define `CARGA` como uno de los 10 `TipoMovimiento`, con efecto propio: `+ custodia del vehículo/carga`.
- `CrearEmbarqueUseCase.ts:132-149` — el ÚNICO lugar donde se crea la carga inicial. Escribe `tx.embarqueCarga.create({...})` (modelo `EmbarqueCarga`/`EmbarqueCargaProducto`). El comentario que lo antecede (líneas 132-133) dice literalmente: *"FASE 8 (dual-write, ADR-STOCK-001 / ADR-FISICO-001): registrar la carga **en el ledger físico**."* — pero `ADR-FISICO-001.md:1` titula el ledger físico como `EmbarqueMovimiento` específicamente, no `EmbarqueCarga`. Ningún `tx.embarqueMovimiento.create({data:{tipo:'CARGA',...}})` existe en todo `src/` (verificado por grep exhaustivo).
- `ADR-STOCK-001.md:28`: *"El hecho físico es `EmbarqueCargaProducto.cantidad` **(y posteriormente el ledger físico)**"* — el propio ADR-STOCK-001 prevé que el ledger físico (`EmbarqueMovimiento`) capture la carga **además de**, no en vez de, `EmbarqueCargaProducto`. El "posteriormente" nunca se implementó.
- `ADR-FISICO-001.md:60-62` ("Estado de implementación, FASE FINAL") solo reclama dual-write para `ENTREGA`/`VENTA_RUTA`/`RETORNO` — nunca para `CARGA`/`RECARGA`. El propio ADR no afirma que esté completo; el comentario del código sí lo afirma incorrectamente.

### Autoridad de cada dato
- **Hecho físico de "cuánto se cargó"**: `EmbarqueCargaProducto.cantidad` (autoridad explícita por `ADR-STOCK-001`).
- **Agregado legacy de "cuánto se cargó" (alimenta la conciliación de control real, §0)**: `EmbarqueProducto.cargadas`.
- **Eventos posteriores a la carga** (`ENTREGA`/`VENTA_RUTA`/`RETORNO`/ajustes manuales): `EmbarqueMovimiento` — sin ningún evento de apertura ("cuánto entró") en la misma tabla.

### Impacto — trazado del ciclo completo (pedido explícito del equipo)

`CARGA inicial → RECARGA → movimiento físico → entrega → retorno/ajuste → cierre`:

1. **CARGA inicial**: `EmbarqueCargaProducto` + `EmbarqueProducto.cargadas` se escriben (ambos). `EmbarqueMovimiento`: nada.
2. **Movimiento físico intermedio** (REEMPAQUE/DESCARTE/CUSTODY_TRANSFER/AJUSTE_AUTORIZADO, vía `POST /api/embarques/[id]/movimientos`): se escribe en `EmbarqueMovimiento`, sin ningún vínculo hacia la `EmbarqueCarga` de origen (ver Hallazgo C).
3. **Entrega/retorno** (al cerrar, `RegistrarMovimientosCierre`, `registrar-movimientos-cierre.service.ts:87-124`): se escribe en `EmbarqueMovimiento` (`ENTREGA`/`VENTA_RUTA`/`RETORNO`) Y en paralelo se actualiza `EmbarqueProducto` (`actualizarProductosRetorno`, `cerrar-embarque-side-effects.service.ts:58-77`).
4. **Cierre**: `calcularDiscrepancia()` lee `EmbarqueProducto`/`Carga`, **nunca `EmbarqueMovimiento`** (confirmado §0) — el hecho de que `EmbarqueMovimiento` no tenga la carga inicial **no afecta el cálculo real de discrepancia/caja que sí corre en producción**, porque ese cálculo nunca lee `EmbarqueMovimiento` en absoluto, con o sin `CARGA`.

**¿Doble conteo?** No detectado y estructuralmente improbable hoy: nada suma `EmbarqueCargaProducto` + `EmbarqueMovimiento{CARGA}` juntos (porque el segundo no existe). Riesgo **prospectivo** solo si una futura reconciliación se construyera sobre `EmbarqueMovimiento` sin tratar una eventual entrada `CARGA` como espejo de `EmbarqueCargaProducto` (guardrail para el diseño futuro, no un bug de hoy).

**¿Pérdida de trazabilidad?** Sí, acotada: el timeline de movimientos de un Embarque (`ledger-client/movimiento-timeline.tsx`, UI real) muestra los eventos de `EmbarqueMovimiento` — hoy ese timeline **empieza en la primera entrega/ajuste**, sin mostrar cuánto se cargó al inicio, aunque el tipo `CARGA` ya está en las opciones de UI (`types.ts:2`) esperando datos que nunca llegan. Es una brecha de **auditoría/visibilidad**, no de integridad financiera — el dato de carga SÍ existe y es correcto, solo no aparece en esa vista específica.

**¿Divergencia inventario físico vs ejecución comercial?** No — `EmbarqueMovimiento` nunca fue autoridad de nada que afecte Pedido/Obligación/dinero (confirmado en F4: sin `pedidoId`). La ejecución comercial no depende de este ledger en ningún punto.

### Decisión existente
Ninguna decisión de producto pendiente — `ADR-FISICO-001` (Aceptado, congelado) YA define `CARGA` con su efecto. Lo que falta es la implementación de esa decisión ya tomada, no una decisión nueva.

### Clasificación
**Funcionalidad incompleta respecto a una decisión ya aprobada** (no bug activo, no modelo huérfano, no decisión de producto pendiente). El comentario del código que afirma falsamente haber cumplido el dual-write es, en sí, un hallazgo menor de higiene documental.

### Brecha
Real pero de **impacto bajo hoy** (nada consume el dato faltante para ninguna decisión de negocio activa) y **acotada a auditoría/visibilidad futura**, no a integridad financiera.

### Criterio de éxito (si el equipo decide implementarlo)
- Cada `CrearEmbarqueUseCase.execute()` produce, además de `EmbarqueCarga`, un `EmbarqueMovimiento{tipo:'CARGA', cargaId: <el recién creado>}` por producto con `cantidad > 0` — un espejo del mismo hecho, nunca una segunda fuente.
- `calcularDiscrepancia()`/la conciliación de control (§0) **no cambia** — sigue leyendo `EmbarqueProducto`/`Carga`, no `EmbarqueMovimiento`.
- El timeline de movimientos (`ledger-client`) muestra la carga inicial sin cambios de contrato en la UI (el tipo `CARGA` ya está soportado ahí).
- Test de integración que confirme: (a) el movimiento se crea con el `cargaId` correcto, (b) la conciliación de control produce el mismo resultado con o sin el movimiento (no son la misma fuente).

### Cambio mínimo propuesto (NO implementado)
Un solo `tx.embarqueMovimiento.create(...)` adicional dentro de `CrearEmbarqueUseCase.execute()`, en el mismo bloque donde ya se crea `EmbarqueCarga` (líneas 132-149), usando el `id` de la carga recién creada como `cargaId`. Cero cambios a `EmbarqueCarga`, `EmbarqueProducto`, `CierreEmbarqueService`, ni a ningún consumidor existente.

---

## 2. Hallazgo B — `RECARGA`: el concepto del ADR no tiene un flujo de negocio real que lo dispare

### Evidencia
- `ADR-FISICO-001.md:19`: `RECARGA` → `+ custodia del vehículo/carga` — **mismo efecto textual que `CARGA`**, listado como tipo separado.
- `embarque-recarga.test.ts:1-9` (comentario de cabecera): "recarga" en el código de producción significa **un segundo `Embarque` completo el mismo día** para el mismo trabajador, permitido solo si el primero ya no está `ABIERTO`/`EN_RUTA`. Es decir: 2°, 3° viaje del día — no un reabastecimiento de un vehículo que sigue en ruta.
- `CrearEmbarqueUseCase.ts:79-86`: la única regla de "duplicado" es `findByTrabajadorAndFecha` — si existe un Embarque `ABIERTO`/`EN_RUTA` del mismo trabajador hoy, rechaza. Si el anterior ya está `CERRADO`/`CANCELADO`, permite crear uno nuevo — mediante el **mismo** `CrearEmbarqueUseCase`, que siempre escribe una `Embarque` + `EmbarqueCarga` nuevos desde cero.
- Búsqueda exhaustiva (`grep -rn "reabastec\|resupply\|agregarCarga\|ampliarCarga" src/`): **0 resultados**. No existe, en ningún punto del código, un caso de uso que agregue stock a un `Embarque` que sigue `ABIERTO`/`EN_RUTA`. `tx.embarqueCarga.create` se llama exactamente una vez por Embarque, siempre desde `CrearEmbarqueUseCase` (confirmado por grep: único caller en todo `src/`, fuera de tests que crean fixtures directas).

### Autoridad de cada dato
No aplica distinta de Hallazgo A — porque "recarga" tal como está implementada ES una `CARGA` (Embarque nuevo), no una operación distinta. No existe ninguna tabla ni campo que represente "reabastecer sin cerrar el viaje actual".

### Impacto
Ninguno medible — porque el flujo que el `TipoMovimiento.RECARGA` del ADR parece describir (agregar stock a un vehículo ya en ruta) **no existe como funcionalidad de negocio**, con o sin ledger. No hay riesgo de doble conteo ni divergencia porque no hay ningún dato que reconciliar: el "recarga" real de hoy es indistinguible de una `CARGA` nueva en cualquier modelo del sistema.

### Decisión existente
Ninguna — ni el Plan Maestro ni ningún ADR define qué debería pasar si un repartidor necesita más stock **sin** cerrar el Embarque actual (ej. se le acabó el agua a mitad de ruta). Lo que SÍ está decidido y funcionando es "múltiples embarques completos por día" (otro concepto, ya resuelto por `embarque-recarga.test.ts`/el fix de `findByTrabajadorAndFecha`).

### Clasificación
**Diferencia entre el modelo conceptual (`ADR-FISICO-001`, un `TipoMovimiento` con efecto propio) y la implementación actual (un concepto de negocio homónimo pero distinto, ya resuelto de otra forma) — no una decisión de producto pendiente todavía sin nombre, sino dos cosas que comparten nombre y no deberían confundirse.**

### Brecha
**No hay brecha que cerrar hoy.** Escribir `EmbarqueMovimiento{tipo:'RECARGA'}` en el mismo punto que `CARGA` (Hallazgo A, cuando se crea un 2°+ Embarque del día) sería técnicamente trivial, pero sería **inventar una distinción que el negocio no pidió** — el "recarga" real ya es una `CARGA` completa en todos los sentidos (nuevo Embarque, nueva `EmbarqueCarga`, nuevo ciclo de vida). Marcarlo con un tipo de movimiento distinto sin que exista ninguna diferencia de comportamiento sería divergencia cosmética, no una corrección.

### Pregunta genuina para el equipo (no la resuelvo yo)
¿Existe o se planea el concepto de "reabastecer un Embarque que sigue `ABIERTO`/`EN_RUTA`, sin cerrarlo" como funcionalidad de negocio futura? Si NO, `TipoMovimiento.RECARGA` debería usarse simplemente como sinónimo de `CARGA` para el caso "2°+ Embarque del día" (mismo cambio mínimo del Hallazgo A, sin necesidad de distinguir). Si SÍ, es una funcionalidad nueva completa (nuevo caso de uso, nuevo endpoint, nueva UI) — fuera del alcance de "cerrar una brecha en el ledger existente", y no se puede diseñar en este documento sin esa decisión de producto.

### Cambio mínimo propuesto (NO implementado, condicionado a la respuesta de arriba)
Si la respuesta es "no existe reabastecimiento mid-misión": extender el cambio mínimo del Hallazgo A para que, cuando `CrearEmbarqueUseCase` detecta que es el 2°+ Embarque del trabajador ese día (mismo chequeo que ya existe en `findByTrabajadorAndFecha`), el `EmbarqueMovimiento` que crea use `tipo:'RECARGA'` en vez de `'CARGA'` — mismo punto de código, una sola condición adicional, cero modelos nuevos.

---

## 3. Hallazgo C — `EmbarqueMovimiento.cargaId` nunca se setea (colateral, no estaba en el mapa original)

### Evidencia
- `schema.prisma` — `EmbarqueMovimiento.cargaId String?` (FK opcional a `EmbarqueCarga`, `onDelete: SetNull`) es el único campo que permitiría enlazar un movimiento a su carga de origen.
- `registrar-movimientos-cierre.service.ts:87-124` — los 3 `client.embarqueMovimiento.create(...)` (ENTREGA/VENTA_RUTA/RETORNO) nunca incluyen `cargaId` en el `data`.
- `movimientos/route.ts` — el `MovimientoSchema` (Zod) que valida el body de `POST /api/embarques/[id]/movimientos` no incluye `cargaId` como campo aceptado — ni siquiera es posible enviarlo desde ese endpoint.
- `CrearRecoveryDecisionUseCase.ts:113-123` (el único otro caller real de `embarqueMovimiento.create`) tampoco lo setea.

### Autoridad / impacto
`cargaId` es, hoy, una columna sin ningún escritor — un campo muerto adicional (`String?`, no bloquea nada al quedar `null`). Refuerza el Hallazgo A: aunque se implementara el cambio mínimo propuesto ahí, los movimientos POSTERIORES a la carga (entrega/venta_ruta/retorno/ajustes) seguirían sin enlazarse a qué `EmbarqueCarga` los originó — solo la nueva entrada `CARGA` misma tendría `cargaId` poblado (apuntándose a sí misma/su propia carga).

### Decisión existente
Ninguna — el campo existe en el schema desde `ADR-FISICO-001`/FASE 2 pero ningún documento explica por qué ningún caller lo usa.

### Clasificación
**Funcionalidad incompleta** (campo de schema sin wiring), de menor severidad que el Hallazgo A porque no bloquea ninguna lectura existente.

### Brecha
Real, menor, cosmética hasta que exista algún consumidor que necesite "a qué carga pertenece este movimiento" (hoy nadie lo necesita, porque `EmbarqueMovimiento` no tiene ningún consumidor de reconciliación, §0).

### Cambio mínimo propuesto (NO implementado)
Ninguno urgente — mencionado para que el equipo decida si vale la pena poblar `cargaId` en `registrar-movimientos-cierre.service.ts` (requeriría resolver primero cuál `EmbarqueCarga` corresponde cuando un Embarque tiene una sola carga de origen — hoy siempre es 1:1, así que sería trivial, pero es una decisión de alcance del equipo, no mía).

---

## Resumen para decisión del equipo

| Hallazgo | Clasificación | ¿Bug activo? | ¿Doble conteo/divergencia detectada? | Acción propuesta |
|---|---|---|---|---|
| A — `CARGA` sin `EmbarqueMovimiento` | Funcionalidad incompleta vs. decisión ya aprobada (`ADR-FISICO-001`) | No | No (riesgo solo prospectivo, con guardrail propuesto) | Espejo de 1 `create`, sin tocar nada más — condicionado a aprobación |
| B — `RECARGA` sin flujo real | Diferencia modelo conceptual vs. implementación (no brecha per se) | No | No — no hay dato que reconciliar | Pregunta al equipo antes de cualquier cambio |
| C — `cargaId` sin escritor | Funcionalidad incompleta, menor | No | No | Sin urgencia, mencionado para registro |
| (Corrección) Conciliación cruzada | Ya existe, diseño de 2 capas intencional (`ADR-STOCK-001`) | — | — | Ninguna — no es brecha |

**Ningún cambio de este documento se implementa sin aprobación explícita.** Los cambios mínimos propuestos para A y C son de una sola línea/bloque cada uno, no tocan `EmbarqueCarga`, `EmbarqueProducto`, `CierreEmbarqueService`, ni ningún consumidor existente — pero quedan condicionados a que el equipo confirme que valen la pena para el impacto (bajo, de auditoría) que tienen hoy.
