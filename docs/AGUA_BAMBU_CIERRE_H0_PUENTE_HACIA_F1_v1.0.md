# AGUA BAMBÚ — CIERRE DE H0.5–H0.8: TRAZABILIDAD HACIA EL PLAN MAESTRO (F0→F8)

**Versión:** 1.1
**Fecha:** 2026-09-13 (corrección de fuente el mismo día — ver nota abajo)
**Responde a:** aclaración explícita del equipo — H0.5–H0.8 son trabajo técnico auxiliar de preparación/verificación, subordinado al Plan Maestro v1.0, no una iniciativa paralela ni una nueva arquitectura. Este documento cierra ese hilo y establece la trazabilidad pedida antes de avanzar a F1.

**Nota de fuente (corregida):** no existe un "Plan Maestro Consolidado v3.1" separado — el equipo confirmó que los documentos base son, únicamente, `AGUA_BAMBU_PLAN_MAESTRO_INTEGRIDAD_COMERCIAL_v1.0.md` y `AGUA_BAMBU_ALS_INTEGRIDAD_COMERCIAL_v1.0.als`, ambos ya revisados desde el inicio de este trabajo. La secuencia F0→F8 y la descripción de F1 usadas en este documento vienen directamente de la sección §61 de ese Plan Maestro v1.0 ("F1 — Autoridad de crédito: consolidar cálculo; exposición monetaria; paridad Preview/Commit"), sin ninguna fuente adicional. La v1.0 anterior de este documento dejaba abierta la duda sobre una "v3.1" — queda resuelta: es el mismo v1.0.

**Este documento no es H0.9.** Es el cierre del puente H0.x, no una extensión de la etapa de análisis. H0.5–H0.8 no son un proyecto de "bloqueos" — son la brecha técnica de `cliente.bloqueado`/crédito resuelta *dentro* del modelo de Crédito/Fiado que el Plan Maestro v1.0 ya define, tal como el equipo lo precisó.

---

## 1. Confirmación de las 6 precisiones del equipo

1. **No se crean más gates H0.x.** Este documento cierra la serie. El siguiente trabajo es F1, con su propio Flujo de Entrega (rama, PR, CI) — no otro documento de análisis.
2. **No se inventó ninguna regla de negocio nueva** en H0.5–H0.8 — cada hallazgo está citado con archivo:línea o con una decisión ya tomada por el equipo (H0.6 §0bis, H0.7 aclaración).
3. **No se crearon entidades ni campos nuevos.** `PedidoExcepcionCredito` no existe. `bloqueadoEn`/`bloqueadoPor`/`bloqueadoMotivo` no se agregaron — siguen como PROPUESTA sin implementar, exactamente como el equipo lo pidió mantener.
4. **Los clientes ya bloqueados no se reinterpretaron.** H0.8 §4bis (corregido) establece que se leen tal cual, sin backfill ni reclasificación — el hecho histórico se conserva, y donde no se puede determinar el origen queda documentado como indeterminado, no inventado.
5. **Trazabilidad de los cambios ya hechos:** tabla en la sección 2.
6. **El siguiente paso es F1**, no otro gate — confirmado en la sección 3.

---

## 2. Trazabilidad: qué se hizo, a qué fase sirve, y por qué era necesario

Rama `fix/integridad-comercial-credito-gates-h0` (9 commits, `main` sin tocar).

| Commit / documento | Qué hace | Fase que prepara o ejecuta | Por qué era necesario antes de F1 |
|---|---|---|---|
| `33f14f77` fix venta-libre sobrepago | Evita que un pago mayor al total viole constraints de DB (`chk_pedido_saldo_nonneg`) | Puente (no es F1 en sí — es un bug de integridad de datos monetarios encontrado en la misma auditoría) | Un crash de producción en la ruta de creación de pedidos no puede convivir con la construcción de una autoridad de crédito sobre esos mismos datos |
| `64ca24d6` fix Preview/Commit crédito | `PreviewPedidoUseCase` ahora respeta el mismo guard (`totalPagado < total`) que `CrearPedidoUseCase`/`venta-libre` ya aplicaban | **Es, literalmente, la "paridad entre Preview y Commit" que F1 define como uno de sus objetivos** — ver nota abajo | Sin esto, cualquier Autoridad de Crédito que se construya heredaría una divergencia ya conocida entre la simulación (Preview) y la ejecución real (Commit) |
| `b1938b44` refactor consolidación `pedido-utils` | Elimina la duplicación de `puedeFiar`/`puedeCrearPedido`/`getEstadoFiados` (antes: copias byte-a-byte en dos archivos) | **Es, literalmente, "consolidar el cálculo de crédito"**, otro objetivo explícito de F1 — ver nota abajo | F1 no puede construir una autoridad única sobre un cálculo que hoy vive duplicado en dos lugares que podrían divergir con el tiempo |
| `7c29c5df` fix `Caso` `FIADO_REcurrente` | Retira la mutación automática de `cliente.bloqueado` desde la resolución de un caso de alerta | Puente — condición de entrada para F1 | F1 apunta a "una única autoridad efectiva para las decisiones de crédito" — no se puede declarar esa autoridad única mientras `Caso` siga teniendo, aunque sea residualmente, un camino que cambia la elegibilidad crediticia por fuera de ella |
| `c3739be9` doc convergencia | Audita el Plan Maestro nuevo contra el estado real de `main` | Puente / insumo | Punto de partida de todo lo demás — sin esto no se sabía qué ya existía y qué era brecha real |
| `3ee18201` H0.5 | Inventario de escritores de `cliente.bloqueado` | Puente | Insumo directo para que F1 sepa exactamente qué tiene que subordinar bajo la autoridad |
| `f65cc1e4` H0.6 | Clasifica CRÉDITO/RIESGO/ADMINISTRACIÓN + modelo de dos niveles (`Cliente.bloqueado` vs. `PedidoExcepcionCredito`) | Puente | Sin esta separación, F1 y una futura F2 (si F2 fuera excepciones puntuales) correrían el riesgo de mezclarse en una sola entidad |
| `a9b143e6` H0.7 | Define cómo B/C/D se relacionan con la futura Autoridad (delega/transforma/se convierte en señal) | Puente | Es el plan de transición que F1 puede ejecutar directamente, en vez de tener que diseñarlo desde cero dentro de la fase |
| `b8c22a4a` H0.8 | Matriz línea-por-línea de qué código cambia, orden de corte (C depende de B), y qué pasa con el histórico | Puente | Es la lista de trabajo técnico concreto que F1 puede tomar como punto de partida |

### Nota importante sobre `64ca24d6` y `b1938b44`

Estos dos commits no son solo "preparación" en sentido estricto — **ya ejecutan, de forma acotada, dos de los cuatro objetivos que el equipo describió para F1** ("paridad entre Preview y Commit" y "consolidar el cálculo de crédito"). No decido por mi cuenta si eso significa que ya son "parte de F1 mergeada por adelantado" o si deben re-presentarse formalmente dentro del PR de F1 para mantener el registro de fases limpio — es una decisión de proceso del equipo, no técnica. Lo señalo explícitamente para que no se pierda ni se cuente dos veces.

Lo que **no** se tocó, y sigue siendo trabajo genuino de F1: la exposición monetaria consolidada y la autoridad única efectiva (la entidad/servicio "Autoridad de Crédito" en sí no existe todavía — ver H0.7/H0.8, sigue como PROPUESTA sin implementar).

---

## 3. Qué sigue: F1, no un gate más

El trabajo avanza a **F1 — Autoridad de Crédito**, con el alcance que el equipo ya definió: consolidar el cálculo de crédito (parcialmente ya hecho, ver nota arriba), la exposición monetaria, la paridad Preview/Commit (parcialmente ya hecho) y una única autoridad efectiva.

H0.5–H0.8 le entregan a F1, sin que F1 tenga que redescubrirlo:
- Los 3 escritores exactos de `cliente.bloqueado` que deben quedar subordinados a la autoridad (B, C, D — archivo:línea en H0.8).
- El orden de dependencia obligatorio (C no puede cortar antes que B).
- El modelo de dos niveles ya decidido (elegibilidad del Cliente vs. excepción del Pedido) para no mezclar F1 con una futura fase de excepciones puntuales.
- La regla de que los clientes ya bloqueados no se reinterpretan.

F1 en sí — el diseño de la entidad/servicio "Autoridad de Crédito", su implementación, y el corte de los escritores directos — **no está hecho** y no se hace en este documento. Corresponde a su propio ciclo bajo el Flujo de Entrega de `AGENTS.md` (rama propia, PR, CI, aprobación), no a otro documento de análisis.
