# AGUA BAMBÚ — N2: PAQUETE DE DECISIÓN MÍNIMO
## Segunda depuración de las 3 decisiones de #189, antes de llevarlas al PO

**Versión:** 1.0
**Fecha:** 2026-09-04
**Responde a:** instrucción del equipo — "Última depuración antes de decisión PO"
**Base técnica:** `main` `2ae4d84c` (post `#189`)
**Regla seguida:** recuperar → clasificar → demostrar → reducir → recomendar. Código intacto, cero implementación (regla §5 de la instrucción).

---

## Resultado en una frase

De las 3 decisiones que #189 mandó al PO, **una (B) era genuinamente nueva y sigue siéndolo**, **una (A) se reduce a una pregunta mucho más chica de lo que parecía**, y **una (C) — la que el equipo pidió revisar con más cuidado — resulta tener una respuesta implícita fuerte en lo que YA está implementado (PR-1/N1) y en lo que el propio ALS del equipo ya escribió (§14), quedando solo un residuo genuinamente abierto y mucho más acotado.**

---

## A. `Actividad.modo`

### Qué ya está decidido

- `Pedido.canal` (`PUNTO`/`DOMICILIO`) es el **canal comercial de la venta**, fijado en la creación, **inmutable** ("campos de clasificación fijos en la creación, no mutan en transiciones" — `ADR-PEDIDO-ORIGEN-CANAL-001`, aceptado por el PO 2026-09-01). Esto es HECHO, implementado, no se toca.
- El modo de **cumplimiento** puede diferir del canal original de venta — es exactamente el caso que motiva todo N2 (venta PUNTO, cumplimiento DOMICILIO). Esto está descrito sin ambigüedad y sin contradicción en 3 documentos del equipo (`CUMPLIMIENTO_PARCIAL_ALS_v2.md §16`, `PLAN_v2.md §10-11`, `N2 ALS §7/10`).
- Deben poder coexistir y mostrarse **dos datos distintos**: "modo histórico" (= `Pedido.canal`, ya existe) y "modo actual" (= lo que se necesita agregar) — `ALS_v2.md §16`: *"Pedido original = PUNTO / Actividad actual = DOMICILIO... ambos datos deben poder coexistir... Nunca inferir el modo actual exclusivamente desde el Pedido."*
- El cambio de modo debe ser un comando explícito, nunca automático (ver sección de PUNTO→DOMICILIO en la Decisión B más abajo — es la misma regla).

### Qué realmente falta decidir (acotado)

`N2 ALS §7` planteaba la pregunta como si hubiera que decidir entre **3 estados** (`modo solicitado / modo planificado / modo ejecutado`). Revisando la fuente más detallada y anterior (`ALS_v2.md §16`, 2026-09-02), **esa distinción de 3 estados nunca fue una decisión ni siquiera una propuesta concreta** — es una redacción del N2 ALS que va más allá de lo que el equipo había escrito antes. Lo único que `ALS_v2.md` pide es **2 estados**: histórico (=`Pedido.canal`) y actual (=`Actividad.modo`). El propio `N2 ALS §7` es explícito en que no exige 3 campos: *"Si se decide almacenar un solo modo, deberá justificarse qué momento representa y cómo se conserva el histórico de cambios."*

La pregunta real, entonces, se reduce a una sola:

> **¿Un único campo `Actividad.modo` (el modo actual/vigente de esa Actividad) + un registro de auditoría de cada cambio (igual que ya se hace en el resto del sistema: `logAudit`, `PedidoCantidadAjuste.autorizadoPorId`, `NotaCredito.motivo`) es suficiente, o el negocio necesita poder consultar "qué se planificó" como estado de primera clase, separado del log de auditoría?**

No hay evidencia en ningún documento de que el negocio necesite consultar "lo planificado" como un dato estructurado distinto del histórico de auditoría — nadie describió un caso de uso que lo requiera. El patrón dominante en todo el repo para "quién cambió qué y por qué" es auditoría (tabla de eventos / `logAudit`), no columnas adicionales de estado.

### Alternativas

| Alternativa | Descripción | Consecuencia |
|---|---|---|
| **1 campo + auditoría** (recomendada) | `Actividad.modo: PUNTO \| DOMICILIO` (estado actual/vigente) + cada `CambiarModoActividad` genera un evento auditable (actor, motivo, modo anterior/nuevo, timestamp) vía el mecanismo de auditoría ya existente. | Consistente con el resto del schema (ningún otro campo de esta clase usa 3 estados paralelos). Responde "modo histórico vs actual" (`Pedido.canal` vs `Actividad.modo`) sin campos nuevos de más. |
| 3 campos (solicitado/planificado/ejecutado) | Tal como lo redactó `N2 ALS §7`, sin evidencia de necesidad. | Sobre-ingeniería no solicitada por ningún caso de uso documentado; más superficie de migración y de bugs de sincronización entre 3 campos. |
| Value object dedicado (`ModoCumplimiento`) en vez de string/enum plano | Mencionado como posibilidad en `PLAN_v2.md §11` ("si `modo` es realmente el nombre/semántica correcta o si debe existir un value object más expresivo"). | Coherente con el patrón de VOs ya usado (`CanalVO`, `EstadoEntregaVO`) — es una decisión de implementación, no de producto; no cambia qué se pregunta al PO. |

### Recomendación del equipo

**1 campo (`Actividad.modo`) + auditoría**, envuelto en un VO de dominio (mismo patrón que `CanalVO`/`EstadoEntregaVO`) para que la escritura quede centralizada. Justificación: es el único diseño para el que existe evidencia de necesidad real (`ALS_v2.md §16` solo pide distinguir histórico vs. actual); añadir un tercer estado sin un caso de uso que lo requiera contradice la regla del propio Plan Maestro V11.1 de "no agregar tablas/columnas fuera de los hallazgos aprobados" (§18/§25).

### Impacto

Bajo. Es un campo aditivo (`Actividad.modo`), sin tocar `Pedido`. Migración reversible.

### ¿Requiere PO?

**Sí, pero una pregunta binaria y chica**, no un diseño abierto: *"¿1 campo + auditoría, o necesitás poder consultar 'lo planificado' como dato estructurado separado del log?"* Si la respuesta es la default (1 campo), el ADR queda listo para escribirse sin más ida y vuelta.

---

## B. Fórmula del diferencial

### Qué ya está decidido

- El diferencial **no es una nueva venta ni reescribe el pedido histórico** (`PLAN_v2.md §13`, `N2 Plan Producto §9`).
- Las unidades pendientes **conservan su precio histórico snapshot** (`PedidoItem.precio` ya es snapshot en el schema actual — esto ya es HECHO, no hay que decidirlo).
- La estructura del cálculo ya está escrita, no solo el concepto: `ALS_v2.md §17`:
  ```
  valor nuevo de cumplimiento
  −
  valor económico histórico de las unidades pendientes
  =
  diferencial
  ```
  Esto es más preciso que "el concepto está cerrado, la fórmula no" — **la fórmula-marco (una resta) sí está decidida**. Lo que falta es solamente el lado izquierdo de esa resta.
- El diferencial es una obligación económica **nueva y separada**, no se cobra dos veces el valor total (`PLAN_v2.md §13`).
- La factura original **no se modifica destructivamente** (`PLAN_v2.md §14`).

### Qué realmente falta decidir

Únicamente cómo se calcula **"valor nuevo de cumplimiento"** (el lado izquierdo de la resta ya decidida):

1. ¿Se usa la lista de precios **vigente hoy** para DOMICILIO, o alguna otra base?
2. ¿El sobrecosto de domicilio (`sobreCostoDomicilio`, ya existe en `Producto`) se aplica sobre la cantidad completa reconvertida, o hay una regla distinta para "lo que ya se había vendido a precio PUNTO"?
3. ¿Los descuentos/promociones de la venta original se trasladan proporcionalmente al valor nuevo, o el diferencial se calcula a precio de lista sin descuentos?
4. Si hay más de un evento de entrega parcial después de convertir el modo (cumplimiento fraccionado en varias veces), ¿el diferencial se calcula una sola vez sobre el total pendiente o se recalcula por tramo?

Nada de esto tiene respuesta en ningún documento — son reglas comerciales genuinamente nuevas, no implícitas en ninguna decisión anterior.

### Separación de la fiscalidad (pedida explícitamente por el equipo)

La regla comercial (puntos 1-4) es **independiente** del tratamiento fiscal. Aunque el PO fije la fórmula comercial hoy mismo, **no se puede implementar el cobro del diferencial** hasta que se resuelva la definición externa (documento fiscal del mayor valor: nota débito o factura por diferencia — contador + proveedor de facturación electrónica + normativa DIAN). Fijar la regla comercial ahora no acelera ni depende de lo fiscal — son dos gates en serie, no uno.

### Recomendación del equipo

No se recomienda una fórmula concreta — es una decisión comercial (precios/descuentos) fuera del scope técnico de este análisis. Sí se recomienda **fijar la fórmula-marco ya decidida como el contrato base** (`valor nuevo − valor histórico = diferencial`) en un ADR, dejando los 4 puntos de arriba como parámetros explícitos a definir con Comercial, para no volver a mezclar "¿hay diferencial?" (ya resuelto: sí, es una obligación nueva y separada) con "¿cuánto es?" (por definir).

### Impacto

Medio — afecta directamente cuánto cobra el negocio en el caso C. Cero impacto en el código existente hasta que se implemente (está explícitamente bloqueado, `GATE C` de `ALS_v2.md §29`).

### ¿Requiere PO?

**Sí** — es la única de las 3 que sigue siendo una decisión de producto genuinamente nueva y sin reducir, tal como #189 la presentó. La fórmula-marco no se reabre; los 4 parámetros sí van al PO/Comercial.

---

## C. Punto de creación de `ObligacionPendiente`

Esta es la revisión que el equipo pidió con más cuidado. El resultado cambia sustancialmente el diagnóstico de #189.

### Hallazgo central: no es una decisión nueva — ya está implícita en lo que se implementó y en lo que el propio ALS del equipo escribió

**PR-1 (#175, ya implementado, HECHO — no PROPUESTA) contesta la mitad de la pregunta sin usar `ObligacionPendiente` en absoluto.** Cuando un pedido se entrega parcialmente, el pendiente queda representado **enteramente por `Pedido`/`PedidoItem`** (`cantPedido − cantEntrega` por línea), el pedido vuelve a `PENDIENTE`, se libera `embarqueId`, y el planificador lo vuelve a considerar como cualquier pedido pendiente (`ADR-PLANIFICADOR-002`, sin caso especial). **Cero filas en `ObligacionPendiente` se crean en este camino, y funciona correctamente** (tests de integración verdes, incluida la regresión de re-cierre). Esto ya es un hecho consumado, verificado en producción, no una hipótesis.

Esto responde, con evidencia y no con "nadie lo formuló":

| # | Pregunta del equipo | Respuesta ya implícita | Fuente |
|---|---|---|---|
| 2 | ¿Nace al crear el Pedido? | **No.** Crear una `ObligacionPendiente` para todo pedido desde el día 0 duplicaría lo que `Pedido`/`PedidoItem` ya representan — viola la regla "no segunda fuente de verdad" (Plan Maestro V11.1 §18/§25, N2 Plan Producto §11). | Guardrail explícito + ausencia total de callers de creación en producción |
| 3 | ¿Nace solamente cuando existe una entrega parcial? | **No, automáticamente no.** Una entrega parcial por sí sola YA está completamente resuelta por `Pedido`/`PedidoItem` (PR-1), sin `ObligacionPendiente`. Crearla automáticamente en cada parcial sería la misma duplicación del punto 2, sin que ningún caso de uso lo requiera hoy. | PR-1 (implementado y probado) |
| 4 | ¿Puede existir antes de cualquier intento de entrega? | No hay evidencia que lo respalde ni lo necesite; contradice la propia semántica de "Obligación = lo que TODAVÍA debe cumplirse" (implica que algo ya se cumplió o al menos que existe una necesidad de rastreo independiente del pedido). | `ADR-OBLIGACION-001` (contexto), `PLAN_v2.md §5` |
| 5 | ¿Qué ocurre con un Pedido completamente pendiente (sin ninguna entrega)? | Se representa 100% por `Pedido` (`estadoEntrega=PENDIENTE`). El planificador ya lo maneja sin `ObligacionPendiente` (`ADR-PLANIFICADOR-002`). | Ya implementado, sin brecha |
| 6 | ¿Qué ocurre con una entrega parcial? | Ídem — resuelto por PR-1 sin `ObligacionPendiente`, **excepto** en el único caso donde el cliente pide explícitamente cambiar el modo de cumplimiento de lo pendiente (Caso C). Ahí, y **solo ahí**, aparece la necesidad de una unidad de trabajo distinta del Pedido completo. | PR-1 + `ALS_v2.md §14`: *"Una venta PUNTO pendiente puede convertirse en elegible **únicamente después de la decisión explícita** que cree/configure el cumplimiento logístico correspondiente."* |
| 9 | ¿Qué relación debe tener con `Pedido.entrega`? | **Ninguna** para el ciclo ordinario de entrega/re-entrega del mismo modo (PR-1 ya lo resuelve sin tocar `ObligacionPendiente`). La relación se activa **solo** cuando se invoca "Gestionar pendiente" explícitamente. | Consecuencia directa de lo anterior |
| 10 | ¿Qué decisiones históricas ya implicaban una respuesta? | **PR-1 en sí mismo es la decisión implícita**: al optar por "no pedido-hijo, el pendiente vive en el propio Pedido" para el caso general, el equipo ya decidió (sin decirlo en esas palabras) que `ObligacionPendiente` no es necesaria para la existencia del pendiente — solo podría serlo para su **gestión activa cuando cambia de modo**. | PR-1 + `ALS_v2.md §14` |

### Lo que sigue siendo genuinamente abierto (mucho más acotado de lo que #189 sugería)

Con lo anterior, **el punto de creación queda reducido a una sola pregunta real**:

> Cuando el operador/cliente invoca "Gestionar pendiente" (Caso C), ¿en qué momento exacto nace la fila de `ObligacionPendiente`?
> - **(i)** en el momento en que se invoca "Gestionar pendiente" (bajo demanda, la `ObligacionPendiente` se construye ahí mismo a partir de `Pedido`/`PedidoItem` — `cantidadOriginal` = lo pendiente en ese instante), o
> - **(ii)** proactivamente, el sistema mantiene una `ObligacionPendiente` para **todo** pedido con remanente pendiente, visible en un panel de operaciones, aunque el cliente nunca pida gestionarlo.

`ALS_v2.md §14` ("únicamente después de la decisión explícita") apunta con fuerza a **(i)**, pero nunca se formuló la pregunta (ii) como alternativa a descartar explícitamente — **esta sí es una pregunta nueva**, aunque mucho más chica que "¿cuándo nace la obligación?" en general.

### Consecuencias de cada alternativa

| | (i) Bajo demanda | (ii) Proactivo |
|---|---|---|
| Duplicación de hechos | Ninguna — la `ObligacionPendiente` se crea justo cuando empieza a tener un rol propio (gestionar el modo) | Riesgo de 2ª fuente de verdad mientras nadie gestiona el pendiente (contradice el guardrail, salvo que se documente por qué es una excepción) |
| Visibilidad para operaciones | Ninguna hasta que alguien pida gestionar — si el negocio quiere un panel proactivo de "pendientes gestionables", (i) no lo da gratis | Da un panel de pendientes de inmediato |
| Cancelación/corrección del Pedido | Si no hay `ObligacionPendiente` creada todavía, cancelar el Pedido no necesita tocar nada de Obligación/Actividad (caso simple, ya resuelto por el flujo de cancelación existente) | Cancelar un Pedido con `ObligacionPendiente` ya creada (aunque nadie la gestione) requiere una cascada de cancelación nueva (`LiberarActividadUseCase`/equivalente para Obligación, hoy inexistente — ver #189, Lista 2) |
| Consistencia con lo ya implementado (PR-1) | Coherente — extiende el mismo principio sin invocar Obligación de más | Requiere justificar por qué el pendiente SÍ necesita una segunda fuente de verdad para el caso general, cuando PR-1 ya demostró que no la necesita |

### Recomendación del equipo

**(i) Bajo demanda.** Es la opción consistente con lo que ya está implementado (PR-1) y con lo único que el propio equipo escribió sobre el tema (`ALS_v2.md §14`, "únicamente después de la decisión explícita"). No hay ningún requerimiento documentado de un panel proactivo de pendientes que justifique pagar el costo de una segunda fuente de verdad para pedidos que nadie va a gestionar. Si en el futuro el negocio pide ese panel, se puede construir como una **vista derivada de `Pedido`/`PedidoItem`** (sin crear filas de `ObligacionPendiente`) — el dato ya existe (`cantPedido − cantEntrega`), no hace falta materializarlo en otra tabla para mostrarlo.

### Impacto

Alto si se elige mal — afecta si N2 introduce o no una segunda fuente de verdad para todo pedido parcial (justo lo que el Plan Maestro V11.1 prohíbe sin evidencia). Bajo si se confirma (i): es la extensión natural de lo ya construido.

### ¿Requiere PO?

**Formalmente sí, pero como confirmación de una dirección ya evidenciada por el propio trabajo del equipo, no como diseño abierto.** La pregunta al PO se reduce a: *"¿Confirmás que `ObligacionPendiente` nace solo cuando alguien invoca 'Gestionar pendiente', y no queremos un panel proactivo de todos los pendientes?"* — una respuesta de una línea, no una ronda de diseño.

---

## Matriz de decisión (formato pedido)

| Decisión | Qué ya está decidido | Qué realmente falta decidir | Alternativas | Recomendación del equipo | Impacto | ¿PO? |
|---|---|---|---|---|---|---|
| **A. Actividad.modo** | Canal original inmutable (`Pedido.canal`); modo de cumplimiento puede diferir del canal; deben coexistir modo histórico y modo actual | Si 1 campo + auditoría alcanza, o hace falta un dato estructurado de "lo planificado" separado del log | (1) 1 campo + auditoría · (2) 3 campos (solicitado/planificado/ejecutado) · (3) VO dedicado (ortogonal a 1 vs 2) | **(1) — 1 campo + auditoría**, sin evidencia de necesidad de más | Bajo (campo aditivo) | Sí, pregunta binaria chica |
| **B. Fórmula del diferencial** | Fórmula-marco (`valor nuevo − valor histórico = diferencial`); no es venta nueva; precio histórico intacto; factura original no se toca; fiscalidad separada | Base de precio para "valor nuevo", tratamiento de descuentos/promos, comportamiento ante múltiples parciales | No aplica (decisión comercial, no arquitectónica) | Fijar la fórmula-marco en ADR ahora; los 4 parámetros van a Comercial/PO | Medio (cuánto cobra el negocio), cero impacto en código hasta implementar (bloqueado por Gate C) | Sí — es la única que sigue abierta tal como #189 la presentó |
| **C. Creación de ObligacionPendiente** | El pendiente ordinario NO necesita `ObligacionPendiente` (PR-1, ya implementado); solo hace falta cuando se gestiona un cambio de modo explícito (`ALS_v2.md §14`) | Si dentro del flujo "Gestionar pendiente", la fila nace bajo demanda o proactivamente para todo pendiente | (i) bajo demanda · (ii) proactivo para todo pedido con remanente | **(i) bajo demanda** — coherente con PR-1 y con `ALS_v2.md §14`; (ii) reintroduce una 2ª fuente de verdad sin justificación documentada | Alto si se elige mal (2ª fuente de verdad general), bajo si se confirma (i) | Formalmente sí, pero como confirmación de una línea, no diseño abierto |

---

## Revisión adversarial (pedida explícitamente)

1. **Propuesta tratada como decisión, detectada en #189**: #189 clasificó "Gestionar pendiente / PUNTO→DOMICILIO" como "DECISIÓN (cerrada, conceptual)". Revisando la fuente más antigua y detallada (`ALS_v2.md §33 "Decisiones y clasificación"`, 2026-09-02), el propio equipo lo clasificó ahí como **PROPUESTA**, no como "DECISIÓN VIGENTE". No hay evidencia de que el PO haya firmado explícitamente esa propuesta en particular — solo evidencia de que **nunca se presentó ni se consideró una alternativa competidora**, y que la prioridad de trabajarlo en P2 fue acordada con el equipo (lo cual presupone la propuesta, sin ratificarla formalmente palabra por palabra). Se mantiene en la Lista 1 de #189 (no se reabre el contenido — nadie propuso nunca "que sea automático"), pero se corrige la etiqueta: es una **propuesta nunca contradicha, elevada a estándar de facto por repetición en 3+ documentos**, no un "DECISIÓN VIGENTE" con sign-off explícito registrado. Si el equipo quiere el registro formal, es una confirmación de una línea al PO, no una discusión.
2. **Término ambiguo ("materialización")**: corregido — ver erratum en `AGUA_BAMBU_N2_AUDITORIA_CONVERGENCIA_RESULTADO_v1.0.md`. No había contradicción real entre Plan Maestro/ADRs y el diagrama del equipo; había una generalización de más en la redacción de #189.
3. **Decisión implícita tratada como pregunta completamente nueva**: el punto de creación de `ObligacionPendiente` — ver Decisión C arriba. Reducido de "9 sub-preguntas abiertas" a 1.
4. **Consecuencia no considerada, ahora explícita**: cancelar un `Pedido` con una `ObligacionPendiente`/`Actividad` activa (alternativa (ii) de C, o incluso (i) si el cliente cancela después de pedir gestión) no tiene cascada de cancelación implementada (`LiberarActividadUseCase` no existe — ya señalado en #189 Lista 2 #4). No es una decisión nueva: es la aplicación del mismo patrón de reversión que ya usa `CancelarPedidoUseCase` para `Pago`/`Factura`/`NotaCredito`, extendido a `Actividad`/`ObligacionPendiente` cuando existan. Contrato técnico, no decisión de producto.
5. **Contradicciones Plan Maestro ↔ N2, N2 ↔ código**: no se encontraron nuevas, más allá de la ya corregida en el punto 2.
6. **Impacto monetario / fiscal / concurrencia / offline / pérdida de histórico**: sin hallazgos nuevos respecto de #189 — las 3 decisiones de arriba no introducen ningún mecanismo monetario nuevo (A y C son puramente de cantidad/estado; B está explícitamente bloqueada hasta el gate fiscal).

---

## Clasificación final (taxonomía pedida)

### CERRADO — no se vuelve a discutir
- Canal comercial inmutable en `Pedido.canal`; modo de cumplimiento puede diferir del canal.
- Debe existir distinción entre modo histórico y modo actual (2 estados mínimo).
- `ObligacionPendiente` NO es necesaria para el ciclo ordinario de entrega/re-entrega (ya demostrado por PR-1 en producción).
- El pendiente ordinario conserva precio histórico snapshot; ninguna recompra.
- El diferencial no es una venta nueva ni reescribe el histórico; es una obligación separada; la fórmula-marco (`nuevo − histórico`) ya está definida.
- PUNTO→DOMICILIO nunca automático (de facto convergido; ver nota de clasificación en la revisión adversarial #1).

### TÉCNICO — conceptualmente cerrado, solo falta implementación
- `Actividad.modo` como campo único + auditoría (una vez el PO confirme que no hace falta más).
- El comando `CambiarModoActividad` (contrato ya descrito, `ALS_v2.md §13`).
- `LiberarActividadUseCase` (contrato ya descrito en Plan Maestro V11.1 §7, sin caso de uso).
- Creación de `ObligacionPendiente` bajo demanda dentro del flujo "Gestionar pendiente" (una vez el PO confirme la opción (i)).

### PO — requiere su decisión
1. `Actividad.modo`: ¿1 campo + auditoría, o hace falta un dato estructurado de "lo planificado"? (pregunta binaria)
2. Fórmula del diferencial: base de precio, descuentos/promos, comportamiento ante parciales múltiples (decisión comercial real).
3. Creación de `ObligacionPendiente`: ¿confirmar bajo demanda, o se quiere un panel proactivo de todo pendiente? (confirmación de una línea, dirección ya evidenciada)

### EXTERNO — depende de terceros
- Tratamiento fiscal del diferencial (contador + proveedor de facturación electrónica + normativa DIAN). Sigue sin resolverse, sin cambios respecto de #189.

### BLOQUEADO — no debe empezar todavía
- Migración de schema, `Actividad.modo`, endpoints, UI, `CambiarModoActividad`, `LiberarActividadUseCase`, wiring de creación de `ObligacionPendiente`, diferencial, cambios fiscales. Todo pendiente de las 3 confirmaciones del PO de arriba (que, a diferencia de #189, ya vienen con recomendación y evidencia — no son diseño desde cero).
