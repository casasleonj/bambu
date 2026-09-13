# AGUA BAMBÚ — GATE H0.6: SEMÁNTICA Y AUTORIDAD DE `cliente.bloqueado`

**Versión:** 1.1
**Fecha:** 2026-09-13 (revisión el mismo día: resolución del equipo sobre B vs. `PedidoExcepcionCredito`)
**Responde a:** instrucción del equipo tras H0.5 (`docs/AGUA_BAMBU_GATE_H0.5_SEMANTICA_CLIENTE_BLOQUEADO_v1.0.md`), más la resolución del equipo que cierra el pendiente que esta v1.0 había dejado abierto.
**Base técnica:** `main`, sin cambios de código desde H0.5.
**Regla seguida:** análisis puro. No se modifica schema, endpoints, UI, `Caso`, `vencimiento-promesas` ni el toggle manual. `PedidoExcepcionCredito` sigue sin construirse. Ninguna semántica actual se reinterpreta por cuenta propia — donde el dominio no lo define, queda como PENDIENTE, no como HECHO. Lo que en v1.0 era PENDIENTE y el equipo resolvió explícitamente pasa a DECISIÓN en esta revisión (ver §0bis) — el resto del análisis no cambia.

**Guardrail respetado:** este documento no elimina, centraliza ni convierte ningún escritor. Es evidencia + decisión del equipo + propuestas explícitamente marcadas como tales.

---

## 0bis. Decisión del equipo (2026-09-13) — resuelve el pendiente sobre B

**DECISIÓN, no propuesta.** El equipo recuperó la convergencia histórica ya existente sobre `Caso` vs. `PedidoExcepcionCredito` y la extendió a `cliente.bloqueado`, resolviendo lo que la v1.0 de este documento había dejado como pendiente en §5/§8.

```text
Autoridad de Crédito
        │
        ├── elegibilidad/estado habitual del Cliente
        │       └── Cliente.bloqueado
        │
        └── excepción puntual de un Pedido
                └── PedidoExcepcionCredito
```

Son dos niveles distintos de la misma autoridad, no dos versiones de la misma cosa:

- **`Cliente.bloqueado`** = estado/base de elegibilidad crediticia del cliente. Persiste hasta que algo lo cambie; no está atado a una operación concreta.
- **`PedidoExcepcionCredito`** = excepción puntual asociada a un pedido concreto. Una excepción de pedido **no** aumenta el límite del cliente, **no** cambia permanentemente su elegibilidad y **no** sustituye el estado crediticio de `Cliente.bloqueado`.

**Por tanto: B ≠ `PedidoExcepcionCredito`.** B actúa sobre el estado de elegibilidad del Cliente (el nivel de arriba en el diagrama); `PedidoExcepcionCredito` actúa sobre una operación/pedido concreto (el nivel de abajo). No son la misma entidad ni una es un caso particular de la otra.

**Reafirmación de la decisión histórica `Caso` ≠ `Crédito`:** `Caso` gestiona verificación, alertas, señales e investigación — no es la autoridad que determina elegibilidad crediticia. Esta es la razón de fondo (ya decidida antes de H0.5) por la que `FIADO_RECURRENTE` dejó de mutar `cliente.bloqueado`, y por la que `RECLAMACIONES_MULTIPLES` tampoco se convierte en una autoridad crediticia automática — una señal de riesgo puede aportar evidencia, pero no es por sí misma autoridad.

**Regla de arquitectura resultante, vigente para todo diseño futuro:**

```text
Caso ≠ Crédito.
Riesgo ≠ Crédito.
PedidoExcepcionCredito ≠ estado crediticio del Cliente.
Los mecanismos actuales que escriben crédito (B, C, D) ≠ Autoridad de Crédito.
```

La futura Autoridad de Crédito concentrará la decisión y la fuente de verdad crediticia (en sus dos niveles: estado del Cliente y excepción del Pedido). Las señales de riesgo/reclamaciones podrán seguir aportando evidencia hacia esa autoridad, sin convertirse ellas mismas en autoridad.

---

## 1. ¿Qué significa exactamente `cliente.bloqueado` en el dominio?

**HECHO (verificable en código, no interpretación):** `cliente.bloqueado` es un booleano sin estructura — no tiene motivo, ni origen, ni fecha, ni autor asociados en `schema.prisma` (`bloqueado Boolean @default(false)`, sin campos hermanos como los que sí tiene `verificado`/`verificadoEn`). Su único efecto verificado en el dominio es: **impedir que el cliente pueda quedar con saldo pendiente en un pedido nuevo** (ver §2). No representa una cantidad, no tiene vigencia, no distingue causa.

**PENDIENTE (no lo puede responder el código, es una decisión de negocio no tomada):** si `bloqueado` *debe* significar "sin crédito hasta que un humano decida lo contrario" (estado administrativo permanente) o "sin crédito mientras exista la condición que lo causó" (estado derivado, que debería recalcularse solo). Hoy el código implementa la primera interpretación por omisión (nunca se auto-desbloquea, ver H0.5 §1 fila B), pero **no hay evidencia de que esa haya sido una decisión de negocio explícita** — es simplemente lo único que el código hace, no necesariamente lo que el negocio quiere.

---

## 2. ¿Qué operaciones debe impedir actualmente?

**HECHO**, confirmado por lectura exhaustiva de todos los consumidores de `cliente.bloqueado` (ver H0.5 §2, re-verificado sin cambios):

Impide:
- Crear un pedido nuevo que quede con saldo pendiente, por cualquier canal (Pedido, Venta Rápida, Venta Libre — los tres convergen en `puedeCrearPedido`).
- La generación automática de un pedido recurrente (`recurrentes.ts` fuerza "SALTAR").

No impide:
- Pagar/abonar una deuda existente.
- Recibir una entrega ya en curso.
- Cualquier operación de embarques o cierre.
- Un pedido que se paga completo de contado (por el fix de Preview/Commit ya cerrado — `bloqueado` solo bloquea si la operación **va a dejar saldo**).

---

## 3. Matriz por escritor

Extiende la tabla de H0.5 con la columna que faltaba ("quién puede desbloquearlo") y corrige un matiz: los 3 escritores activos hoy son **B, C, D** (A ya no escribe nada, ver H0.5 §0).

| Escritor | Qué lo dispara | ¿Automático/humano? | Problema que resuelve | Cuánto dura | Cómo se desbloquea | Quién puede desbloquearlo | Qué operaciones afecta | Auditoría |
|---|---|---|---|---|---|---|---|---|
| **B** — toggle manual en ficha de cliente | Clic explícito de un ADMIN/ASISTENTE en la ficha del cliente, sin relación con ninguna alerta | Humano, con confirmación | Decisión administrativa directa de frenar fiado, motivo libre (no capturado) | Indefinido, sin expiración | Mismo botón con `bloqueado:false` | **Solo ADMIN o ASISTENTE** (`requireRole` del mismo endpoint — no hay distinción de permiso entre bloquear y desbloquear) | Fiado + recurrentes (§2) | `logAudit` bajo `entidad:'Cliente'`, con `casoId` opcional |
| **C** — botón "Bloquear fiados" desde `Caso` `RECLAMACIONES_MULTIPLES` | Clic explícito de un ADMIN/ASISTENTE dentro de un caso de ese tipo | Humano, un clic, mismo endpoint que B pero sin diálogo de confirmación propio | Frenar fiado ante patrón de ≥3 reclamaciones históricas | Indefinido, mismo campo que B | Mismo botón que B (`toggleBloqueado` en la ficha del cliente) — **no hay un botón de "desbloquear" simétrico dentro del propio `Caso`** | **Solo ADMIN o ASISTENTE**, igual que B | Fiado + recurrentes (§2) | Igual que B — `logAudit`, normalmente con `casoId` |
| **D** — cron `vencimiento-promesas` (diario, 6am) | `promesaPagoFecha` de un pedido vencida y sin pagar | 100% automático, sin usuario | Frenar fiado ante incumplimiento objetivo y verificable de una promesa de pago concreta | Indefinido, mismo campo | Manualmente, vía B — **el cron nunca desbloquea** | **Solo ADMIN o ASISTENTE, vía B** (no existe un mecanismo de desbloqueo propio de D) | Fiado + recurrentes (§2) | Parcial — queda bajo `entidad:'Pedido'`, no `'Cliente'` (ver H0.5 tabla, fila D) |

---

## 4. Clasificación por naturaleza: CRÉDITO / RIESGO / ADMINISTRACIÓN / mezcla histórica

Esto es **análisis de dominio, no decisión** — clasifico según lo que cada mecanismo *hace* y *por qué existe*, no según cómo convendría reorganizarlo técnicamente.

- **B (toggle manual): CRÉDITO.** No es una señal ni un trámite administrativo genérico — es un humano ejerciendo directamente la decisión de "este cliente no debe seguir acumulando deuda". Es, en sustancia, exactamente lo que se espera que haga una autoridad de crédito, solo que ejercida hoy sin el aparataje formal (sin motivo capturado, sin vigencia, sin relación con una operación concreta). No lo clasifico como "administración" solo porque el mecanismo técnico sea un botón simple — el *efecto* que produce es 100% crediticio.

- **C (botón desde `RECLAMACIONES_MULTIPLES`): MEZCLA, y es la más ambigua de las tres.** Nace de una señal de **riesgo** (reclamaciones repetidas — eso es exactamente lo que `Caso` fue diseñado para gestionar), pero el efecto que produce al clickear es **crédito puro** (el mismo que B), ejecutado a través del mecanismo **administrativo** (el mismo endpoint que B). Es riesgo → decisión humana → efecto de crédito, los tres presentes en la misma acción. A diferencia de la `FIADO_REcurrente` ya retirada (que era una señal *automáticamente* convertida en efecto de crédito), acá **siempre hay una decisión humana explícita en el momento** — esa es la diferencia real con el caso ya corregido, y por eso no la trato como el mismo problema. Pero sigue siendo cierto que un `Caso` de riesgo puede terminar en un efecto de crédito con un solo clic, sin pasar por ninguna autoridad de crédito formal.

- **D (cron `vencimiento-promesas`): CRÉDITO, sin mezcla.** No hay señal ambigua que interpretar ni discreción humana — es una condición objetiva (fecha vencida, pedido sin pagar) evaluada automáticamente. De los tres, es el que **menos** se parece a "administración" o "riesgo": es una regla de negocio de crédito automatizada, que hoy simplemente vive fuera de cualquier módulo que se llame "autoridad de crédito" porque ese módulo todavía no existe.

**No hay mezcla histórica en B ni D** — cada uno es consistente con su propia naturaleza. La mezcla real está concentrada en **C**.

---

## 5. Relación propuesta con la futura Autoridad de Crédito

**Todo lo de esta sección es PROPUESTA — ninguna decisión.** El criterio que sigo es el que pidió el equipo: primero qué problema de negocio representa cada uno, no qué es más fácil de programar.

- **D → PROPUESTA: absorber dentro de la Autoridad de Crédito como regla automática.** Justificación de dominio (no técnica): una condición objetiva y verificable de incumplimiento es exactamente el tipo de regla que una autoridad de crédito debería evaluar y aplicar ella misma, en vez de que un cron externo escriba el campo canónico por su cuenta. Esto **no** significa convertirlo en `PedidoExcepcionCredito` — una excepción es un permiso puntual para *saltarse* una regla; D *aplica* una regla, no la excepciona. Son conceptos distintos y no deben confundirse.

- **B → PROPUESTA: reconocerlo explícitamente como la vía de anulación/override humano del nivel "elegibilidad del Cliente" de la Autoridad de Crédito** (ver §0bis — el equipo ya decidió que B actúa en ese nivel, no en el de `PedidoExcepcionCredito`). Lo que sigue siendo PROPUESTA, no decisión, es la forma exacta de esa formalización: si la Autoridad de Crédito va a ser la fuente de verdad de elegibilidad, un ADMIN que decide bloquear manualmente está, en los hechos, invalidando lo que esa autoridad diría — eso debería quedar modelado (motivo, autor, fecha), no seguir siendo un booleano mudo. Cómo exactamente se estructura ese registro (una entidad propia, campos adicionales en `Cliente`, u otra forma) no lo propongo acá con ese nivel de detalle — eso es diseño técnico, que el equipo pidió dejar para después de cerrar la semántica.

- **C → PROPUESTA: dejar de escribir `cliente.bloqueado` directamente desde el botón del `Caso`, y en su lugar reusar la misma vía que se decida para B.** Mismo argumento que ya se aplicó a `FIADO_RECURRENTE`: una señal de riesgo (reclamaciones) no debería tener su propio atajo directo a un efecto de crédito, aunque sea con un clic humano de por medio. Esto **no** es "convertir `RECLAMACIONES_MULTIPLES` en excepción de crédito" (el equipo pidió explícitamente no hacer eso) — es solo unificar el *mecanismo* de bloqueo (el mismo que B) en vez de mantener un segundo atajo técnico que hace lo mismo desde otro lugar.

---

## 6. ¿Alguno de los escritores actuales es una segunda fuente de verdad de crédito?

**Clasificación confirmada por el equipo: ESTADO TÉCNICO ACTUAL / RIESGO DE AUTORIDAD — no "segunda fuente de verdad ya existente".** La formulación original del gate era correcta: hoy **no existe todavía una Autoridad de Crédito formal**, así que no puede haber una "segunda" fuente compitiendo con una "primera" que aún no se construye. Llamarlo "segunda fuente" habría sido impreciso — lo correcto es describirlo como el estado técnico actual y el riesgo de autoridad que ese estado implica.

Lo que sí es un **HECHO verificable**: existen **tres escritores independientes y no coordinados entre sí** sobre el mismo campo canónico, sin ningún árbitro común. Eso ya es, en la práctica, una fragmentación de escritura — no hace falta que exista una autoridad formal para que el problema sea real, porque ninguno de los tres sabe de la existencia de los otros dos.

**El riesgo es prospectivo, no actual:** cuando se construya la Autoridad de Crédito, B, C y D **tendrán que quedar subordinados a ella o ser migrados/reemplazados según su función** (§0bis) — no se debe crear una cuarta autoridad paralela que conviva sin resolver con estos tres. Si se construye la Autoridad de Crédito y los tres escritores siguen escribiendo el campo directamente sin pasar por ella, *entonces sí* habría dos fuentes de verdad conviviendo — el mismo patrón que ya se corrigió para `FIADO_RECURRENTE`. Esto es exactamente lo que la sección 5 busca prevenir con propuestas, no con una decisión tomada.

---

## 7. Propuesta de autoridad responsable por transición (sin implementar)

| Transición | Autoridad propuesta | Naturaleza de la propuesta |
|---|---|---|
| Bloquear por promesa de pago vencida (D) | Autoridad de Crédito (regla automática interna, no cron externo) | PROPUESTA |
| Bloquear manualmente sin causa sistémica (B) | Autoridad de Crédito, como mecanismo explícito de override humano (con motivo/autor/fecha) | PROPUESTA |
| Bloquear desde una señal de `RECLAMACIONES_MULTIPLES` (C) | La misma vía que se decida para B — `Caso` deja de tener un atajo propio | PROPUESTA |
| Desbloquear (cualquier origen) | Hoy es siempre B (manual). Si B se formaliza dentro de la Autoridad de Crédito, desbloquear debería pasar por la misma autoridad, con el mismo nivel de trazabilidad que bloquear | PROPUESTA |

---

## 8. Clasificación final

### HECHOS
- `cliente.bloqueado` es un booleano sin motivo/origen/fecha/autor en el schema.
- Solo 3 escritores activos hoy: B (toggle manual), C (botón de `RECLAMACIONES_MULTIPLES`, mismo endpoint que B), D (cron `vencimiento-promesas`).
- Los 3 solo pueden ser accionados (bloquear o desbloquear) por ADMIN o ASISTENTE — D es la excepción, actúa sin usuario, pero solo bloquea, nunca desbloquea.
- `bloqueado` afecta exclusivamente: creación de pedidos con saldo pendiente (cualquier canal) + generación automática de recurrentes. No afecta pagos, entregas, embarques ni cierre.
- No existe ningún mecanismo de auto-desbloqueo (pagar la deuda no desbloquea).
- La auditoría de D queda bajo `entidad:'Pedido'`, no `'Cliente'` — asimétrica respecto a B/C.
- No existe hoy ninguna Autoridad de Crédito formal.

### DECISIONES (ya tomadas por el equipo, no se reabren acá)
- `FIADO_RECURRENTE` en `Caso` ya no escribe `cliente.bloqueado` (gate anterior, cerrado).
- No se toca ninguno de los 3 escritores activos hasta cerrar este gate.
- `RECLAMACIONES_MULTIPLES` y `vencimiento-promesas` NO se convierten en `PedidoExcepcionCredito`.
- **(2026-09-13) `Cliente.bloqueado` y `PedidoExcepcionCredito` son dos niveles distintos de la misma Autoridad de Crédito** — elegibilidad/estado habitual del Cliente vs. excepción puntual de un Pedido (§0bis). Una excepción de pedido no aumenta el límite, no cambia permanentemente la elegibilidad del cliente y no sustituye `Cliente.bloqueado`.
- **(2026-09-13) B ≠ `PedidoExcepcionCredito`.** B actúa sobre el nivel "elegibilidad del Cliente"; `PedidoExcepcionCredito` actúa sobre el nivel "operación/pedido concreto". Cierra el pendiente que la v1.0 de este documento había dejado abierto.
- **(2026-09-13) Reafirmada:** `Caso` ≠ `Crédito`. `Caso` gestiona verificación/alertas/señales/investigación; no es la autoridad que determina elegibilidad crediticia. Regla vigente para todo diseño futuro: `Caso ≠ Crédito`, `Riesgo ≠ Crédito`, `PedidoExcepcionCredito ≠ estado crediticio del Cliente`, `B/C/D ≠ Autoridad de Crédito`.

### PROPUESTAS (sección 5 y 7 — requieren aprobación del equipo, no están implementadas ni son vinculantes)
- D pasa a ser una regla interna de la futura Autoridad de Crédito (no un cron externo).
- B se reconoce como el mecanismo formal de override humano de esa autoridad, con motivo/autor/fecha.
- C deja de tener un atajo propio y reusa la vía que se decida para B.
- Agregar `bloqueadoEn`/`bloqueadoMotivo`/`bloqueadoPor` al schema (ya propuesto en H0.5, sigue como propuesta, no tarea).

### PENDIENTES (preguntas genuinamente abiertas, no las resuelvo por mi cuenta)
- Si `bloqueado` debe ser un estado permanente-hasta-decisión-humana o un estado derivado que se recalcula solo (§1).
- La forma exacta de cómo se registra el override humano de B dentro del nivel "elegibilidad del Cliente" (entidad propia, campos adicionales en `Cliente`, u otra estructura) — el nivel ya está decidido (§0bis), la estructura técnica no.
- Cuál es la forma exacta de la futura Autoridad de Crédito (fuera de alcance de este gate, según la instrucción del equipo).
- Si el desbloqueo debe requerir el mismo nivel de autorización que el bloqueo, o uno distinto.
- Si D y C, al subordinarse a la Autoridad de Crédito, quedan "migrados" (su lógica pasa a vivir dentro de esa autoridad) o "reemplazados" (la autoridad calcula el mismo efecto por su cuenta y estos mecanismos se retiran) — el equipo usó ambos verbos como alternativas abiertas, no como sinónimos.

### BRECHA PLAN ↔ CÓDIGO
- Ninguna detectada en este gate específico — no hay una política de producto ya escrita en ningún documento previo que el código esté incumpliendo respecto a `cliente.bloqueado`. La ambigüedad encontrada es de **ausencia de decisión**, no de una decisión ya tomada que el código ignore.

---

## 9. Qué sigue

**H0.6 queda conceptualmente cerrado** con la resolución del equipo en §0bis: la relación entre `Cliente.bloqueado`, `PedidoExcepcionCredito`, `Caso` y la futura Autoridad de Crédito ya no es un pendiente. Este documento sigue sin habilitar construir nada — el equipo pidió cerrar primero la semántica y la autoridad antes de definir el modelo técnico, y ese modelo técnico no se aborda acá.

Los ítems que quedan en "PENDIENTES" ya no son de semántica (eso se cerró), son de **diseño técnico** de la futura Autoridad de Crédito: la estructura exacta del override de B, si D/C se migran o se reemplazan al subordinarse, y el nivel de autorización del desbloqueo. Esos son, en mi lectura, la agenda del siguiente gate — no bloquean cerrar este.
