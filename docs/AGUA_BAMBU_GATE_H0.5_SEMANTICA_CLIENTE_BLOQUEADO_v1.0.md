# AGUA BAMBÚ — GATE H0.5: SEMÁNTICA DE `cliente.bloqueado`

**Versión:** 1.0
**Fecha:** 2026-09-12
**Responde a:** instrucción del equipo tras el retiro de `FIADO_REcurrente` de `Caso` (ver `docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` §1 y el mensaje de decisión del equipo).
**Base técnica:** `main` (post retiro de `FIADO_REcurrente`, este mismo día).
**Regla seguida:** solo análisis — no se modifica schema, endpoints ni UI en este documento. `PedidoExcepcionCredito` sigue sin construirse hasta cerrar este gate.

---

## 0. Qué cambió desde el hallazgo anterior

El branch `FIADO_REcurrente` de `aplicarAccionCorrectiva()` (`src/app/api/casos/[id]/route.ts`) **ya no escribe `cliente.bloqueado`** — fue retirado. Por lo tanto, a partir de este documento, `cliente.bloqueado` tiene **2 escritores activos** (no 3): el toggle manual (`PATCH /api/clientes/[id]`, con 2 contextos de disparo distintos) y el cron `vencimiento-promesas`. Se incluye el caso retirado en la tabla marcado como `HISTÓRICO` para trazabilidad del gate.

---

## 1. Tabla — todos los lugares que pueden escribir `cliente.bloqueado`

| # | Escritor | Quién lo escribe | Evento disparador | ¿Automático o humano? | Problema de negocio que resuelve | ¿Cuánto tiempo permanece? | ¿Cómo se desbloquea? | ¿Afecta solo fiado u otras operaciones? | ¿Auditoría? | Naturaleza |
|---|---|---|---|---|---|---|---|---|---|---|
| A | `Caso` → `FIADO_REcurrente` (**HISTÓRICO, ya retirado hoy**) | Sistema, dentro de `aplicarAccionCorrectiva()` | Un ADMIN/ASISTENTE clickeaba "Resolver" sobre un caso de tipo `FIADO_REcurrente` | Automático (consecuencia de resolver el caso, no una decisión explícita sobre el cliente) | Frenar más fiado a un cliente que acumuló ≥2 pedidos con saldo pendiente en 7 días | Indefinido (sin campo de expiración) | Solo manualmente, vía toggle (fila B) | Fiado (vía `puedeCrearPedido`) | **No** — la mutación de `Cliente` no tenía `logAudit` propio, solo el `PATCH` del `Caso` en sí quedaba registrado | Era una **señal de riesgo mutando en silencio una decisión de crédito** — exactamente lo que se corrigió |
| B | `PATCH /api/clientes/[id]` — toggle manual en ficha de cliente | ADMIN/ASISTENTE (`requireRole`) | Click explícito en el botón "Bloquear/Desbloquear fiados" en `clientes-client/index.tsx` (`toggleBloqueado`), con diálogo de confirmación ("¿Bloquear fiados para este cliente?") | **Humano**, explícito, con confirmación | Decisión administrativa directa: un humano decide, por la razón que sea, frenar el fiado de un cliente | Indefinido — no existe `bloqueadoEn`/expiración en `schema.prisma` (a diferencia de `verificadoEn`, que sí existe para `verificado`) | Mismo botón, mismo endpoint, con `bloqueado: false` — 100% manual, **no existe ningún desbloqueo automático** (pagar la deuda no desbloquea) | Fiado (vía `puedeCrearPedido`, igual que A) + generación automática de recurrentes (`recurrentes.ts`: un cliente bloqueado solo puede "SALTAR", nunca generarse) | **Sí** — `logAudit({ entidad: 'Cliente', accion: 'UPDATE', datos: { verificado, bloqueado }, casoId })`, con `casoId` opcional para trazar si vino de un caso | Decisión administrativa explícita, sin relación necesaria con `Caso` |
| C | `PATCH /api/clientes/[id]` — botón "Bloquear fiados" en `caso-guia-modal.tsx` | ADMIN/ASISTENTE, desde dentro de un `Caso` de tipo **`RECLAMACIONES_MULTIPLES`** (`alertas-config.ts:236`) — **no** `FIADO_RECURRENTE` | Click explícito en la acción sugerida del caso | **Humano**, explícito, un clic (sin diálogo de confirmación propio — reusa el mismo endpoint que B) | Frenar fiado a un cliente con ≥3 reclamaciones/disputas históricas (patrón de posible fraude o cliente conflictivo) | Igual que B: indefinido, mismo campo | Igual que B: solo manual | Igual que B | **Sí**, mismo `logAudit` que B, y en este caso `casoId` normalmente sí viaja (la UI de casos lo puede enviar) | Es el **mismo mecanismo técnico que B**, pero **disparado desde la lectura de una señal de riesgo** (reclamaciones), no desde la ficha del cliente en frío. Zona gris explícita: ¿la señal se convirtió aquí en autorización porque el humano decidió actuar, o es igual a B por ser una acción humana deliberada? |
| D | Cron `vencimiento-promesas` (diario, 6am) | Sistema (`CRON_SECRET`, sin usuario humano) | `promesaPagoFecha` de algún pedido del cliente vencida y el pedido sigue sin pagar (`estadoPago` fuera de `PAGADO/ANTICIPADO/VENCIDO/ANULADO`) | **Automático**, sin intervención humana | Frenar fiado quando una promesa de pago concreta ya venció | Indefinido — mismo campo sin expiración | Solo manualmente, vía B — **el cron nunca desbloquea, solo bloquea** | Igual que A/B/C (fiado + recurrentes) | **Parcial** — escribe en `Historial` con `entidad: 'Pedido'` (no `'Cliente'`); el bloqueo del cliente queda mencionado dentro del JSON (`clienteBloqueado: true`) pero **no genera una fila de historial propia del `Cliente`** como sí hace B/C vía `logAudit` | Regla de negocio automática de crédito — la más "pura" de las 4 en el sentido de que nace de una condición objetiva y verificable (fecha vencida), no de juicio humano ni de una señal ambigua |

---

## 2. Lo que NO afecta `cliente.bloqueado` (alcance confirmado)

Verificado por grep exhaustivo de todos los lectores de `cliente.bloqueado` en `src/`:

- **No bloquea pagos/abonos.** `pagar-fiado` y `cartera/abonos` no leen `bloqueado` — un cliente bloqueado puede seguir pagando su deuda sin restricción (correcto: bloquear el pago contradiría el propósito).
- **No bloquea entrega, embarques ni cierre** de pedidos ya creados.
- **Sí bloquea:** creación de pedidos nuevos por cualquier canal (Pedido normal, Venta Rápida, Venta Libre — los tres pasan por `puedeCrearPedido`), y la generación automática de pedidos recurrentes (`recurrentes.ts`, un cliente bloqueado queda forzado a "SALTAR" esa generación).

---

## 3. Respuesta a las 2 preguntas del equipo

### ¿Qué significa realmente `cliente.bloqueado` hoy?

No tiene un significado único — son **4 orígenes distintos convergiendo en el mismo booleano sin distinción posterior**:
1. Una señal de riesgo que un humano decidió convertir en acción (fila B, disparada desde la ficha del cliente, sin relación con ningún caso).
2. La misma acción, pero disparada específicamente al mirar una alerta de reclamaciones múltiples (fila C).
3. Una regla automática y objetiva de vencimiento de promesa de pago (fila D).
4. *(Ya retirado)* Una consecuencia automática de resolver una alerta de fiado recurrente (fila A).

Una vez escrito, el campo **no conserva memoria de cuál de estos orígenes lo generó** — no hay `bloqueadoEn`, no hay `bloqueadoPor`, no hay `bloqueadoMotivo` en `schema.prisma`. La única forma de reconstruir el origen es buscar en `Historial`/`logAudit`, y ni siquiera ahí es uniforme (D no deja rastro bajo `entidad: 'Cliente'`).

### ¿Quién debe tener autoridad para cambiar esa condición?

Esta es la pregunta que el equipo pidió explícitamente **no** responder por mi cuenta como conclusión de producto. Lo que sí puedo entregar, como insumo, es la tensión concreta que hay que resolver:

- Si la respuesta es *"solo la autoridad de crédito"*, entonces B, C y D dejan de escribir `cliente.bloqueado` directamente y en su lugar todas alimentan una señal/solicitud hacia esa autoridad — de forma simétrica a lo que ya se decidió para `Caso`/`FIADO_RECURRENTE`.
- Si la respuesta es *"el bloqueo administrativo directo (B) es legítimo y distinto de una excepción de crédito puntual"*, entonces hay que decidir si C (que usa el mismo mecanismo que B pero nace de una señal de `Caso`) cuenta como B o como A — hoy son indistinguibles en el código porque comparten endpoint.
- D es el caso más fácil de encuadrar como parte formal de la autoridad de crédito (es una regla objetiva, no discrecional) — pero mientras no se decida, sigue siendo un escritor directo fuera de cualquier autoridad, con un rastro de auditoría más débil que B/C.

---

## 4. Lo que este documento NO decide (a propósito)

- No concluye que B/C deban eliminarse, fusionarse o mantenerse.
- No concluye que D deba absorberse dentro de la futura autoridad de crédito.
- No propone el diseño de `PedidoExcepcionCredito` ni su relación con estos 4 orígenes — eso viene después de cerrar este gate, según lo pedido.

## 5. Recomendación mínima de trazabilidad (independiente de la decisión de arquitectura)

Con cualquier respuesta que se elija, **hoy no hay forma de saber quién bloqueó a un cliente ni por qué**, más allá de bucear en `Historial`. Si el equipo quiere, como paso separado y de bajo riesgo (no requiere decidir la autoridad de crédito todavía), se podría agregar `bloqueadoEn`/`bloqueadoMotivo`/`bloqueadoPor` a `Cliente` — mismo patrón que ya existe para `verificadoEn`. Esto no prejuzga ninguna de las opciones de la sección 3; solo hace que, se decida lo que se decida, el origen quede trazable desde ahora en adelante. No lo implementé porque es un cambio de schema y el equipo no lo pidió — queda como sugerencia, no como acción tomada.
