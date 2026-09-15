# AGUA BAMBÚ — F5: CONVERGENCIA CARGA / RECARGA

**Versión:** 1.1
**Fecha:** 2026-09-15
**Responde a:** revisión del equipo sobre el mapa de brechas de F5 — pidieron NO asumir que "está fuera del ledger" significa automáticamente que hay que incorporarlo, y exigieron el mismo estándar de convergencia usado en F1-F4 antes de tocar código: hallazgo → evidencia → autoridad → impacto → decisión existente → clasificación → brecha → criterio de éxito → cambio mínimo.

**Resultado adelantado**: la investigación profunda **desarma el hallazgo original en 3 hallazgos distintos**, cada uno con una naturaleza diferente — ninguno es "bug funcional activo" (a diferencia del GPS, PR #259). Además, corrige una sobre-estimación en el mapa de brechas original (§1 de este documento). **Cero implementación en este documento.**

**v1.1 (misma fecha)**: el equipo revisó v1.0 y pidió 2 correcciones/verificaciones antes de habilitar implementación: (1) no describir A como si la *decisión* estuviera pendiente — ya está aprobada y congelada, lo pendiente es la implementación y su prioridad; (2) verificar la granularidad exacta que exige el contrato del ledger (¿un movimiento por producto, o uno solo con detalle?) sin deducirlo únicamente del código de cierre actual; y (3) trazar `cargaId` a fondo antes de decidir si C es un campo muerto independiente o si es, en realidad, el consumidor que A estaba esperando. Ver §4 — ambas verificaciones están resueltas ahí con evidencia estructural (schema/CHECK/Zod/validador de dominio), no por inferencia del comportamiento del cierre. Sección §1 corregida en consecuencia.

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
**La decisión YA existe y está aprobada y congelada** (`ADR-FISICO-001`, Estado: "Aceptado (congelado)") — no hay ninguna decisión de producto pendiente aquí. `ADR-STOCK-001` (también congelado) refuerza esto: establece explícitamente que el hecho de carga debe quedar reflejado "posteriormente" en el ledger físico. **Lo único pendiente es la implementación de esa decisión ya tomada, y la prioridad que el equipo le dé dentro de F5** — no una brecha de producto, una brecha de ejecución.

### Clasificación
**Brecha de implementación respecto a una decisión ya aprobada y congelada** (no bug activo hoy, no modelo huérfano, no decisión de producto pendiente — la decisión está tomada). El comentario del código que afirma falsamente haber cumplido el dual-write es, en sí, un hallazgo menor de higiene documental, no la brecha principal.

### Brecha
Real y confirmada. El impacto observable hoy es bajo (nada consume el dato faltante para ninguna decisión de negocio activa) y está acotado a auditoría/visibilidad — pero eso describe el **impacto actual**, no el **estatus de la decisión**, que es firme. La prioridad de cuándo cerrarla dentro de F5 queda a criterio del equipo, no de este documento.

### Criterio de éxito (verificación de granularidad en §4.1; C ya incluido — ver §4.2)
- Cada `CrearEmbarqueUseCase.execute()` produce, además de `EmbarqueCarga`, **un `EmbarqueMovimiento{tipo:'CARGA'}` por producto con `cantidad > 0`** (granularidad confirmada por evidencia estructural en §4.1, no por el código de cierre) — con `cargaId` apuntando a la `EmbarqueCarga` recién creada (cierra también el Hallazgo C, ver §4.2). Un espejo del mismo hecho, nunca una segunda fuente.
- `calcularDiscrepancia()`/la conciliación de control (§0) **no cambia** — sigue leyendo `EmbarqueProducto`/`Carga`, no `EmbarqueMovimiento`.
- El timeline de movimientos (`ledger-client`) muestra la carga inicial sin cambios de contrato en la UI (el tipo `CARGA` ya está soportado ahí).
- Test de integración que confirme: (a) el movimiento se crea con el `cargaId` correcto, (b) la conciliación de control produce el mismo resultado con o sin el movimiento (no son la misma fuente).

### Cambio mínimo propuesto — **verificado en §4, listo para implementación**
Un solo `tx.embarqueMovimiento.create(...)` **por producto con `cantidad > 0`** dentro de `CrearEmbarqueUseCase.execute()`, en el mismo bloque donde ya se crea `EmbarqueCarga` (líneas 132-149), usando el `id` de la carga recién creada como `cargaId`. Cero cambios a `EmbarqueCarga`, `EmbarqueProducto`, `CierreEmbarqueService`, ni a ningún consumidor existente.

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

## 3. Hallazgo C — `EmbarqueMovimiento.cargaId` — reclasificado en v1.1, ver §4.2

**v1.0 lo trató como campo muerto independiente. El equipo pidió verificar antes de asumir eso — ver §4.2 para el análisis completo.** Resumen del resultado: `cargaId` no tiene semántica contractual documentada en ningún ADR, no tiene ningún lector hoy, y el único escritor que le daría sentido es exactamente el movimiento `CARGA` propuesto en el Hallazgo A (auto-referencia: el movimiento apunta a la `EmbarqueCarga` que lo originó). **C no es un hallazgo independiente — es parte de A.** No se propone ningún cambio separado para C.

---

## 4. Verificación adicional pedida por el equipo (v1.1)

### 4.1 — Granularidad del contrato: ¿un `EmbarqueMovimiento` por producto, o uno solo con detalle?

**Limitación de partida, dicha explícitamente**: el documento "contrato técnico §8, §9" que citan `ADR-FISICO-001`/`ADR-STOCK-001` como fuente es anterior a esta sesión (los ADRs están fechados 2026-08-16) y no está disponible localmente — no aparece en `docs/` del repo ni en ninguno de los archivos subidos a esta sesión. No voy a fingir haberlo leído. La respuesta que sigue **no se apoya en ese texto ni en el comportamiento del cierre actual** (que el equipo pidió explícitamente no usar como única fuente) — se apoya en evidencia estructural independiente, de 4 capas distintas que coinciden entre sí:

1. **El modelo mismo no admite otra cosa.** `EmbarqueMovimiento.producto` es `String` (singular) y `.cantidad` es `Int` (singular) — no hay un campo de detalle (JSON, tabla hija, array) en absoluto. Comparar con `EmbarqueCarga`, que SÍ tiene una relación `productos: EmbarqueCargaProducto[]` dedicada para representar "una carga con varios productos". `EmbarqueMovimiento` nunca recibió ese mismo patrón — estructuralmente, cada fila representa un solo producto. Un "movimiento único con detalle de productos" no cabe en el modelo actual sin agregar una tabla hija nueva (cambio de schema, fuera de "cambio mínimo").
2. **El CHECK constraint es por fila, singular.** `chk_embarque_movimiento_cantidad_pos` valida `"cantidad" > 0` sobre una sola columna de una sola fila — no hay ningún mecanismo de validación a nivel de "conjunto de productos de un movimiento".
3. **El endpoint genérico que sí implementa "contrato §8" para otros tipos usa la misma forma.** `POST /api/embarques/[id]/movimientos` (`movimientos/route.ts:59-63`, comentario cita "contrato §8" explícitamente) tiene `MovimientoSchema` con `producto: z.string().min(1)` y `cantidad: z.number().int().positive()` — singular. Esto es independiente del servicio de cierre: es la forma que el propio contrato le dio a la API para REEMPAQUE/DESCARTE/CUSTODY_TRANSFER/AJUSTE_AUTORIZADO.
4. **El validador de dominio (la implementación más directa y pura de "contrato §8, §9") usa la misma forma.** `validarMovimientoFisico` (`ledger-fisico.service.ts:39-44`, comentario cita el contrato explícitamente) recibe `MovimientoFisicoInput` con `producto: string`/`cantidad: number` singulares — es la función que valida CUALQUIER movimiento, de cualquier tipo, y nunca contempló una lista de productos.

**Conclusión**: la unidad es **un `EmbarqueMovimiento` por producto**, confirmado por 4 capas independientes del sistema (schema, CHECK, API, validador de dominio) que preceden y son ajenas al servicio de cierre — no una deducción de "porque así lo hace el cierre hoy". El cambio mínimo propuesto para A (un `create` por producto con `cantidad > 0`) es la única forma compatible con el contrato tal como está implementado en todo el resto del sistema.

### 4.2 — `cargaId`: trazado completo `EmbarqueMovimiento → cargaId → EmbarqueCarga → EmbarqueCargaProducto`

- **Semántica contractual documentada**: **ninguna, en ningún ADR.** Ni `ADR-FISICO-001` ni `ADR-STOCK-001` ni `ADR-CUSTODIA-001` mencionan `cargaId` por nombre — ni en las tablas de tipos, ni en las invariantes, ni en "estado de implementación". El bloque de comentario del schema que antecede a `EmbarqueCarga`/`EmbarqueMovimiento` (`schema.prisma:1122-1131`) explica `availabilityBasis` y `EmbarqueCargaProducto.cantidad` en detalle, pero no dice una palabra sobre `cargaId`. Es un campo de implementación del schema, no una decisión narrada en ningún ADR — lo cual es distinto de "no tiene semántica": el NOMBRE + la relación bidireccional (`EmbarqueCarga.movimientos EmbarqueMovimiento[]`) + el índice dedicado (`@@index([cargaId])`) + `onDelete: SetNull` (integridad blanda, no bloqueante) son, en conjunto, evidencia de diseño intencional para "trazar de qué carga viene un movimiento", aunque nunca se escribió en prosa.
- **¿La relación es la prevista por el ADR?** No puedo confirmarlo con cita textual (el ADR no la menciona), pero SÍ puedo confirmar que es **consistente** con el propósito general del ledger físico ("custodia inequívoca", `ADR-FISICO-001:35`) — saber de qué carga salió un movimiento es exactamente ese tipo de trazabilidad.
- **¿Debe poblarse solo para CARGA/RECARGA o también otros?** Estructuralmente el campo es `String?` en TODOS los tipos, sin restricción — pero la utilidad real depende de la cardinalidad `Embarque↔EmbarqueCarga`, que **hoy es siempre 1:1** (`tx.embarqueCarga.create` se llama exactamente una vez por `Embarque`, únicamente desde `CrearEmbarqueUseCase`, confirmado por grep exhaustivo — ver Hallazgo B). Con cardinalidad 1:1, `cargaId` en un movimiento `ENTREGA`/`RETORNO`/etc. sería **100% redundante con `embarqueId`** (ya resuelve a la única `EmbarqueCarga` existente sin ambigüedad) — no aporta información nueva. Solo tendría valor real si un `Embarque` pudiera tener múltiples `EmbarqueCarga` algún día (lo cual no existe hoy, y sería exactamente el "reabastecimiento mid-misión" que el Hallazgo B dejó como pregunta abierta, no como algo implementado). **Conclusión: poblarlo únicamente en el movimiento `CARGA` mismo (auto-referencia a la carga que lo originó) es both necesario y suficiente hoy — poblarlo en ENTREGA/RETORNO/etc. sería trabajo sin beneficio observable mientras la cardinalidad siga siendo 1:1.**
- **¿Existen lecturas actuales que dependan de ella?** No. Verificado por grep: `cargaId` solo aparece como declaración de tipo en el frontend (`ledger-client/types.ts:16`), nunca leído condicionalmente en ningún componente, nunca usado en un `where`/`include` de Prisma en ningún query de la aplicación. El GET de movimientos SÍ lo devuelve en el payload (por ser columna escalar sin `select` explícito), pero siempre `null` hoy — sin consumidor.
- **¿Índice/relación con propósito de integridad o auditoría?** Sí — el índice dedicado y el `onDelete: SetNull` (en vez de `Cascade`/`Restrict`) son coherentes con un propósito de auditoría/trazabilidad: permite reconstruir "todos los movimientos que salieron de esta carga" sin que borrar una carga (si algún día fuera posible) invalide el movimiento histórico. Es infraestructura de auditoría construida y nunca activada, no infraestructura sin propósito.

**Conclusión de C**: confirmado exactamente lo que planteó el equipo — el único escritor que faltaba es la implementación de A. El movimiento `CARGA` (Hallazgo A) puede y debe fijar `cargaId` a la `EmbarqueCarga` que lo originó (auto-referencia, mismo `create`, mismo bloque de código). Ningún otro movimiento necesita `cargaId` poblado mientras la cardinalidad `Embarque↔EmbarqueCarga` sea 1:1 — así que el cambio mínimo de A, con `cargaId` incluido, cierra C por completo sin trabajo adicional.

---

## Resumen para decisión del equipo (v1.1)

| Hallazgo | Clasificación | Decisión de producto | ¿Bug activo? | ¿Doble conteo/divergencia? | Acción propuesta |
|---|---|---|---|---|---|
| A — `CARGA` sin `EmbarqueMovimiento` (incluye C, fusionado) | **Brecha de implementación de una decisión YA aprobada y congelada** (`ADR-FISICO-001`/`ADR-STOCK-001`) | Ya tomada — no pendiente | No | No — riesgo solo prospectivo, con guardrail explícito en §1 | Dual-write transaccional: 1 `create` por producto + `cargaId` auto-referenciado, mismo bloque de `CrearEmbarqueUseCase`. **Verificado en §4 — no altera ninguna autoridad existente.** |
| B — `RECARGA` sin flujo real | Diferencia modelo conceptual vs. implementación | **Pendiente — requiere que el negocio confirme si existe "reabastecer un Embarque abierto/en ruta"** | No | No — no hay dato que reconciliar | No implementar. Pregunta explícita en §2, sin proponer código. |
| C — `cargaId` sin escritor | Fusionado en A (§4.2) — no es un hallazgo independiente | — | — | — | Se cierra automáticamente al implementar A, sin trabajo adicional. |
| (Corrección) Conciliación cruzada | Ya existe, diseño de 2 capas intencional (`ADR-STOCK-001`) | — | — | — | Ninguna — no es brecha. |

**Con la verificación de §4 completa, A queda lista para implementación** (dual-write transaccional, un `create` por producto con `cargaId` auto-referenciado, sin tocar `EmbarqueCarga`/`EmbarqueProducto`/`CierreEmbarqueService`/ninguna autoridad existente) — sujeta a que el equipo confirme que quiere priorizarla dentro de F5 ahora. B sigue sin implementarse, a la espera de la decisión de negocio.
