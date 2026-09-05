# AGUA BAMBÚ — RESULTADO DE LA AUDITORÍA DE CONVERGENCIA N2

**Versión:** 1.0
**Fecha:** 2026-09-04
**Responde a:** `AGUA_BAMBU_N2_AUDITORIA_CONVERGENCIA_v1.0.md` (instrucción del equipo)
**Base técnica:** `main` `324d8e50` (post `#188`)
**Regla seguida:** jerarquía de fuentes §2 de la instrucción — Contexto Maestro (`plan-maestro-v11.1-equipo-desarrollo.md`) → ADRs aceptados → conversaciones/planes históricos (`CUMPLIMIENTO_PARCIAL_{ALS,PLAN}_v2.md`) → código real de `main`.

**No modifica schema/endpoints/UI/lógica de dominio** (regla §12 de la instrucción). Es solo análisis.

---

## Resultado en una frase

**De los 9 "gates" del N2 ALS/Plan, 5 ya estaban convergidos antes de que se escribiera el N2 ALS** (y en un caso — Gate 1 — el propio N2 ALS/Plan planteaba una hipótesis que **contradice** una decisión ya congelada). Quedan genuinamente abiertas **2 decisiones de producto** (semántica de `Actividad.modo`, fórmula del diferencial) + **1 pregunta de UX/producto no formulada hasta ahora** (punto de creación de `ObligacionPendiente`) + **1 bloqueo externo** (fiscalidad).

---

## LISTA 1 — CONVERGIDO (no debe reabrirse)

| # | Qué | Fuente con autoridad |
|---|---|---|
| 1 | Modelo conceptual: `Pedido` = obligación comercial; `ObligacionPendiente` = cantidad pendiente; `Actividad` = trabajo ejecutable; `Embarque` = ejecución logística; `Pago`/`Abono` = únicos hechos monetarios. 4 ledgers separados (obligaciones/físico/monetario/responsabilidad). | Plan Maestro V11.1 §1-§2 (Contexto Maestro) |
| 2 | Semántica de cantidades de `ObligacionPendiente`: `cantidadOriginal/Cumplida/Asignada`, `cantidadDisponible` **derivada, nunca almacenada**, invariante `cantidadCumplida + cantidadAsignada <= cantidadOriginal`. | ADR-OBLIGACION-001 (congelado), implementado con `chk_obligacion_no_sobreconsumo` + tests 34A/B/C |
| 3 | `Actividad` puede existir sin `embarqueId`; máx. 1 asignación activa por `(obligación, embarque)`, protegida por constraint DB, no por disciplina de aplicación. | ADR-ACTIVIDAD-001 (congelado), `Actividad_obligacion_embarque_activa_unique` |
| 4 | Lock de concurrencia del cumplimiento = `OBLIGACION:{obligacionId}` (no el de la Actividad). | Plan Maestro V11.1 §6, implementado en `AsignarActividadUseCase` |
| 5 | `saldoFavor` es crédito general del cliente, **nunca** reserva de producto/cantidad. | Plan Maestro V11.1 §2 (`Cliente.saldoFavor` = Canónico, sin earmark), N2 Plan Producto §11, confirmado en código (`CrearPedidoUseCase` lo consume greedy por cualquier pedido nuevo) |
| 6 | `Pago`/`Abono` siguen siendo la única autoridad monetaria; ninguna entidad de obligación/actividad puede convertirse en segunda fuente de `total`/`totalPagado`/cartera. `Pedido.saldo`/`totalPagado` = canónico; `ReceivableEntry` = proyección de auditoría, nunca ledger competidor. | Plan Maestro V11.1 §1-§2, §12; reafirmado en N2 ALS §14 y Plan Producto §11 |
| 7 | No crear `PaymentAllocation`/`Fulfillment` prematuramente; no crear nuevos `Pedido` para representar faltantes físicos. | Plan Maestro V11.1 (arquitectura de 4 ledgers), N2 Plan Producto §11, hallazgo propio verificado contra código (2026-09-02, `[[cumplimiento-parcial-obligacion-actividad]]`) |
| 8 | **`PlanActividad` y `Actividad` son entidades deliberadamente separadas para el MVP.** El planificador (capa de rutas) **no crea ni referencia** `Actividad`/`ObligacionPendiente`. No es una brecha a cerrar — es una decisión explícita del PO. | **ADR-PLANIFICADOR-006 §2** ("`PlanActividad` NO es el modelo `Actividad` de Embarques... Son cosas distintas. El MVP no crea ni referencia `Actividad`"), aceptado 2026-08-30 |
| 9 | **[Corregido — ver erratum al final]** Para el flujo `PlanActividad tipo=ENTREGA` del planificador de rutas (el único implementado hoy), la materialización va **Planificación → Embarque** directo (vía `Pedido.embarqueId`), sin pasar por `Actividad`. Contrato completo: `PlanDia CONFIRMED → MaterializarPlanUseCase → CrearEmbarqueUseCase → Embarque ABIERTO → asigna pedidoIds`, con `offlineId` determinista (`hash(planId, version, grupoId)`) y saga de fallo parcial (`INTEGRATION_PARTIAL`, reintentable). Esto **no** contradice el diagrama `Planificación→Actividad→Embarque` del equipo — ese diagrama describe el flujo de "Gestionar pendiente"/cambio de modo (y el futuro epic de cobros), que sí pasa por `Actividad` por diseño y todavía no está implementado. | **ADR-PLANIFICADOR-003** (congelado, contrato P0) para el camino ENTREGA; `CUMPLIMIENTO_PARCIAL_ALS_v2.md §13` para el camino Gestionar-pendiente |
| 10 | Gestionar pendiente / PUNTO→DOMICILIO **no puede ser automático** (nunca "si no recogió → cambiar solo"); requiere acción explícita del usuario con actor + motivo + trazabilidad. El flujo conceptual `Gestionar pendiente → Enviar a domicilio → confirmar cantidad → mostrar diferencial → confirmar → crear/activar Actividad → asignar a Embarque` ya está descrito. | CUMPLIMIENTO_PARCIAL_PLAN_v2 §10 ("regla de producto"), reafirmado sin cambios en N2 ALS §9-10 y Plan Producto §9. **Convergido a nivel conceptual** — el contrato técnico exacto va en Lista 2. |
| 11 | El diferencial **no es una nueva venta ni una reescritura del pedido histórico**. Lo pendiente conserva su precio histórico snapshot; el diferencial (si existe) es una obligación económica **nueva y separada**, del tamaño exacto de la diferencia. | CUMPLIMIENTO_PARCIAL_PLAN_v2 §12-13, N2 Plan Producto §9. **Convergido el concepto** — la fórmula exacta NO (Lista 3). |
| 12 | La fiscalidad del diferencial requiere definición externa (contador + proveedor de facturación electrónica + normativa DIAN) antes de implementar cualquier mayor valor. La factura original nunca se modifica destructivamente. | CUMPLIMIENTO_PARCIAL_PLAN_v2 §14, N2 Plan Producto §14 (gate 9). **Convergido que es bloqueo externo** — la respuesta en sí no. |
| 13 | La caja física se concilia por **fecha de captura del `Pago`** (`Pago.createdAt`); ventas/entregas/cartera conservan su propia fecha semántica. | **Ya implementado y mergeado** — PR #187 (F-B), citado como vigente en N2 ALS §14 |
| 14 | Entrega parcial **no crea un `Pedido` hijo**; el pedido original conserva `total`/`totalPagado` intactos (sin recalcular a la baja). | **Ya implementado y mergeado** — PR-1 (#175). Ver nota crítica en la Revisión adversarial: el *mecanismo* real no coincide con la redacción de la instrucción de auditoría (usa acumulación en el propio `Pedido`, no `ObligacionPendiente`). |

---

## LISTA 2 — CONTRATO / IMPLEMENTACIÓN (conceptualmente cerrado, falta contrato técnico o wiring)

| # | Qué | Qué falta exactamente |
|---|---|---|
| 1 | Wiring de `ObligacionPendiente` al ciclo de vida real del pedido | Nada de producción crea una `ObligacionPendiente` hoy. El modelo, las constraints y `AsignarActividadUseCase`/`/api/obligaciones/[id]/asignar` existen y están testeados (34A/B/C), pero cero callers. Falta decidir **el punto de creación** — ver Lista 3 #3, porque no es solo técnico. |
| 2 | Comando "Gestionar pendiente → Enviar a domicilio" | El flujo conceptual está descrito (Lista 1 #10) pero no existe el comando de dominio (`CambiarModoActividad` es un nombre hipotético, N2 ALS §10), ni endpoint, ni use case, ni auditoría del cambio de modo. |
| 3 | Contrato `Actividad ↔ Embarque` para `COBRO`/`RECOGIDA_BOTELLON` | El schema ya soporta el enum; la materialización solo mira `tipo=ENTREGA` hoy. `ADR-PLANIFICADOR-006 §3` ya nombra los 2 ADRs prerequisito (`ADR-EMBARQUES-ACTIVIDAD-PLAN`, `ADR-PLANIFICADOR-CARTERA`) — **correctamente diferidos al epic de cobros, no bloquean N2 de entregas.** No abrir estos ADRs todavía. |
| 4 | Liberar/cancelar una `Actividad` ya asignada | `ADR-OBLIGACION-001`/Plan Maestro V11.1 §7 describen el flujo de "cancelar/liberar" (`LOCK → disminuir cantidadAsignada → actualizar Actividad → commit`) como parte del contrato de asignación, pero **no existe ningún caso de uso que lo implemente** (`AsignarActividadUseCase` solo asigna; no hay `LiberarActividadUseCase`). Contrato ya especificado en el Plan Maestro — falta solo implementarlo cuando haya un caller real. |

---

## LISTA 3 — DECISIÓN REALMENTE ABIERTA (al PO)

| # | Pregunta | Por qué es genuinamente abierta |
|---|---|---|
| 1 | Semántica exacta de `Actividad.modo`: ¿enum final `PUNTO`/`DOMICILIO`? ¿distingue modo solicitado/planificado/ejecutado? ¿quién lo cambia? ¿cómo se audita? | El propio corpus (CUMPLIMIENTO_PARCIAL_PLAN_v2 §11, N2 ALS §7, N2 Plan Producto §8) pide explícitamente **un ADR dedicado** antes de tocar schema — nunca se resolvió. No es solo "falta implementar", es una decisión de modelado que puede tener 2+ diseños razonables. |
| 2 | Fórmula exacta del diferencial DOMICILIO (qué reglas de precio/promoción/volumen aplican sobre el valor histórico pendiente). | CUMPLIMIENTO_PARCIAL_PLAN_v2 §13 lo deja explícitamente como "Pendiente de regla" — el *concepto* (diferencial ≠ nueva venta) está cerrado, la *fórmula* nunca se fijó. |
| 3 | **Punto de creación de `ObligacionPendiente`**: ¿nace automáticamente en TODA entrega parcial, o solo cuando el operador elige explícitamente "Gestionar pendiente"? | No aparece formulada en ningún documento previo. Es una decisión de UX/producto real: si nace siempre, cada entrega parcial genera un registro de seguimiento aunque el cliente nunca pida re-enviar el resto; si nace solo bajo demanda, el "Gestionar pendiente" tiene que poder reconstruir la cantidad pendiente desde `Pedido`/`PedidoItem` en el momento en que el operador lo pide (ya disponible, `cantPedido - cantEntrega`). |
| 4 | ¿Un `ObligacionPendiente` con entregas parciales debe ser "demanda" visible para el planificador de rutas? | `ADR-PLANIFICADOR-002` ya lo deja como pregunta abierta explícita ("Qué falta decidir"), con propuesta MVP = no, "revisar con datos reales del piloto". No convergido, correctamente etiquetado como tal en su propio ADR. |

### Bloqueo externo (separado de las decisiones internas)

- **Fiscalidad del diferencial** (documento fiscal del mayor valor: nota débito / factura por diferencia) — requiere contador + proveedor de facturación electrónica + normativa DIAN vigente. Ningún código del diferencial avanza sin esto. Ya identificado en 3 documentos previos a esta auditoría; sigue sin resolverse porque depende de terceros, no de una decisión interna.

---

## Verificación de las convergencias base (§4 de la instrucción)

Cobertura de los 6 puntos, con evidencia puntual (no se re-diseñó ninguno):

- **§4.1 Modelo conceptual** (patrón histórico ≠ demanda ≠ recurrencia ≠ pedido ≠ programación ≠ planificación ≠ actividad ≠ ejecución ≠ cumplimiento ≠ cartera): confirmado por la separación en 4 ledgers + capas del Plan Maestro V11.1 §1. Nada en el código colapsa dos de estos conceptos en una sola entidad.
- **§4.2 Historial y demanda**: no existe ningún flujo de producción que cree un `Pedido` u `ObligacionPendiente` a partir de historial sin una acción humana explícita (recurrentes requieren `PlantillaRecurrente` + generación explícita/cron con guardas; nada infiere pedidos de "patrones").
- **§4.3 Recurrencia**: `PlantillaRecurrente` es un mecanismo de generación programada, no la definición conceptual de "recurrencia acordada" — no hay evidencia de que el código la trate como tal; no hay contradicción.
- **§4.4 Pedido/programación/planificación**: confirmado — `Pedido` = demanda/obligación; `PlanDia/Grupo/Parada/Actividad` = planificación (propone), el humano confirma/ajusta en `REVIEW` (`ADR-PLANIFICADOR-003 §6`, `trabajadorFinalId`).
- **§4.5 `RutaHabitual`**: **no existe como entidad en el schema** (`prisma/schema.prisma`) ni se menciona en ningún ADR. Lo más cercano es `Ruta` (zona/agrupación) y `PlanDia` (propuesta específica de una fecha) — que ya cumplen la separación pedida. Posible desalineación de nombres entre el vocabulario del ALS del equipo y el código; no bloquea nada porque la propiedad pedida ("no es lista obligatoria de pedidos") se cumple trivialmente para lo que sí existe.
- **§4.6 Preferencias y fechas**: `Pedido.horaPreferida` (recurrentes) es el único campo de preferencia; no hay `fechaProgramada` (`ADR-PLANIFICADOR-002` lo señala explícitamente como ausente y no la inventa — usa `fecha`/reprogramación por Ejecución como proxy del MVP). La separación conceptual completa (disponibilidad/preferencia/solicitud/confirmada/planificada/hora real) **no está implementada como 6 campos distintos** — es una simplificación de MVP ya documentada y aceptada (`ADR-PLANIFICADOR-002`), no una brecha nueva que este análisis descubra.

---

## MATRIZ OBLIGATORIA (§8 de la instrucción)

| Tema | Clasificación | Decisión histórica | Evidencia | Estado código | Brecha | ¿Requiere PO? |
|---|---|---|---|---|---|---|
| PlanActividad ↔ Actividad | **DECISIÓN** (cerrada) | Son entidades deliberadamente separadas para el MVP | ADR-PLANIFICADOR-006 §2 | `PlanActividad` materializa a `Pedido.embarqueId` (ADR-PLANIFICADOR-003); `Actividad` sin callers de producción | Ninguna — es diseño, no deuda | No |
| Actividad.modo | **PENDIENTE** (legítimo) | Se necesita, forma exacta no decidida | CUMPLIMIENTO_PARCIAL_PLAN_v2 §11, N2 ALS §7 | Campo no existe en `Actividad` (confirmado en `#188`) | Falta ADR dedicado | **Sí** |
| Materialización (camino ENTREGA: Planificación→Embarque; camino Gestionar-pendiente: →Actividad→Embarque) | **DECISIÓN** (cerrada, implementada solo el camino ENTREGA) | Contrato P0 completo para ENTREGA | ADR-PLANIFICADOR-003 (ENTREGA), ALS v2 §13 (Gestionar-pendiente) | `MaterializarPlanUseCase`/`CrearEmbarqueUseCase` existen; el camino con `Actividad` no está implementado | Ninguna en lo decidido — falta implementar el 2º camino | No |
| Actividad ↔ Embarque | **DECISIÓN** (cerrada) + **CONTRATO** parcial | `embarqueId` nullable, 1 asignación activa por constraint | ADR-ACTIVIDAD-001 | Implementado (schema+lock+constraint); falta "liberar" (Lista 2 #4) y wiring real (Lista 2 #1) | Falta caller de producción + `LiberarActividadUseCase` | No (es ejecución técnica) |
| Gestionar pendiente | **DECISIÓN** (cerrada, conceptual) + **CONTRATO** pendiente | Flujo explícito descrito, nunca automático | CUMPLIMIENTO_PARCIAL_PLAN_v2 §10 | No implementado | Falta comando de dominio + endpoint | No (salvo el punto de creación de ObligacionPendiente, ver abajo) |
| PUNTO → DOMICILIO | **DECISIÓN** (cerrada, conceptual) | Acción explícita, nunca inferencia automática, con auditoría | CUMPLIMIENTO_PARCIAL_PLAN_v2 §10, N2 ALS §10 | No implementado | Falta comando de dominio (`CambiarModoActividad`) | No |
| Replanificación (nivel Pedido↔Plan) | **DECISIÓN** (cerrada, implementada) | Trigger de replanificación al detectar cambio real | ADR-PLANIFICADOR-005 | Implementado a nivel Pedido/Plan | Falta el equivalente a nivel Actividad/Obligación (Lista 2 #4) | No |
| Diferencial | **DECISIÓN** (concepto) + **PENDIENTE** (fórmula) | ≠ nueva venta, preserva precio histórico | CUMPLIMIENTO_PARCIAL_PLAN_v2 §12-13 | No implementado (bloqueado, correctamente) | Fórmula exacta sin definir | **Sí** |
| Fiscalidad | **BLOQUEO EXTERNO** | Requiere contador/FE/DIAN | CUMPLIMIENTO_PARCIAL_PLAN_v2 §14, N2 Plan §14 gate 9 | N/A | N/A | No es una pregunta al PO — es una gestión externa |
| Pago ↔ cumplimiento | **DECISIÓN** (cerrada) | No crear `PaymentAllocation`; `Pedido.saldo`/`totalPagado` canónico; Actividad nunca es fuente monetaria | Plan Maestro V11.1 §1-§2, §12; N2 Plan Producto §11 | Modelo actual (sin `PaymentAllocation`) es **suficiente** — no hay evidencia de que sea insuficiente | Ninguna | No |

---

## Revisión adversarial (§10 de la instrucción)

Hallazgos que sí aparecieron al buscar explícitamente los patrones pedidos:

1. **Hipótesis convertida en requisito, Gate 1**: la instrucción de auditoría (y el propio N2 ALS §2/§4 en su primera versión) plantea "PlanActividad ↔ Actividad" como si la reconciliación fuera trabajo pendiente de N2. **No lo es** — `ADR-PLANIFICADOR-006` (2026-08-30, anterior al N2 ALS) ya decidió explícitamente que son entidades separadas para el MVP, con 2 ADRs nombrados para cuando se abra el epic de cobros. Tratarlo como gate abierto de N2 habría multiplicado una decisión de producto que ya existía. Corregido en la Lista 1/matriz de arriba.
2. **Propuesta convertida en decisión, §4.7 de la instrucción**: el texto de la instrucción da por sentado que "representar el pendiente mediante `ObligacionPendiente`" es una "decisión ya resuelta". **Es inexacto**: lo que PR-1 (#175) implementó y está en producción (N1) es que el pendiente vive **implícito en el propio `Pedido`** (`cantEntrega` acumulativo, `total`/`totalPagado` intactos) — **sin tocar `ObligacionPendiente` en absoluto**. `ObligacionPendiente` sigue sin ningún caller de producción. La decisión real y ya implementada es "no pedido hijo, conserva total/totalPagado" — el "mediante `ObligacionPendiente`" es la aspiración de N2, no lo que ya ocurrió. Ver Lista 1 #14 y Lista 2 #1.
3. **Código usado como autoridad de producto (evitado)**: se verificó cada afirmación de "HECHO" contra `main` (ver `AGUA_BAMBU_N2_VERIFICACION_TECNICA.md`, PR anterior #188) pero las *decisiones* de esta auditoría vienen de ADRs/Plan Maestro/planes históricos, nunca del código por sí solo — el código solo confirma o refuta el estado técnico, como pide la instrucción §7.
4. **Referencia obsoleta detectada (no es un gate, es higiene documental)**: `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001` §2 (aceptado 2026-09-01, antes de PR-1) todavía dice *"El repartidor eligiendo 'entregar parcial ahora, resto después' ... usa el flujo de entrega parcial existente (pedido-hijo)"*. Ese mecanismo (pedido-hijo) **ya no existe** — PR-1 lo retiró. No se corrige ese ADR en este PR (regla §12: no modificar nada fuera de esta auditoría) — se deja señalado para que el equipo lo actualice cuando toque ese ADR.
5. **No se encontraron**: gates falsamente cerrados, contradicciones sin resolver entre Plan Maestro y ADRs, duplicación de entidades nueva, deuda monetaria accidental, pérdida de histórico, huecos de concurrencia/offline no cubiertos, ni tratamiento fiscal inventado en ningún documento de la cadena.

---

## Respuesta directa a la pregunta del §11 de la instrucción

> ¿Qué de N2 ya estaba decidido y qué realmente falta decidir?

**Ya decidido (no reabrir):** el modelo de 4 ledgers, la semántica de cantidades de `ObligacionPendiente`/`Actividad`, que `PlanActividad` y `Actividad` son entidades separadas por diseño, que la materialización del camino `ENTREGA` del planificador es hacia `Embarque` directo (el camino "Gestionar pendiente" sí pasa por `Actividad`, sin implementar todavía — ver erratum), que `saldoFavor` no es reserva de producto, que el dinero nunca se duplica en `Actividad`, que "Gestionar pendiente"/PUNTO→DOMICILIO deben ser explícitos y auditables, y que el diferencial no es una venta nueva.

**Falta decidir (al PO):** la semántica exacta de `Actividad.modo`, la fórmula del diferencial, y el punto de creación de `ObligacionPendiente` (automático vs. bajo demanda del operador).

**Bloqueo externo:** la fiscalidad del diferencial.

**Falta solo implementar (sin nueva decisión):** el wiring de `ObligacionPendiente`/`Actividad`, el comando "Gestionar pendiente/CambiarModoActividad", y `LiberarActividadUseCase`.

Con esto, N2 se reduce de "9 gates abiertos" a **3 decisiones de producto reales** (una de ellas parcialmente resuelta a nivel de concepto) + **1 bloqueo externo** + trabajo de implementación sobre contratos ya cerrados.

---

## Erratum (2026-09-04, tras revisión del equipo)

1. **"Materialización real es Planificación→Embarque" era impreciso.** Corregido arriba (fila 9 de la Lista 1, matriz, y respuesta final): esa afirmación describe únicamente el camino `PlanActividad tipo=ENTREGA` del planificador de rutas (`ADR-PLANIFICADOR-003`), que es lo único implementado hoy. El camino "Gestionar pendiente"/cambio de modo **sí** materializa vía `Actividad → Embarque`, tal como lo describe el diagrama del equipo (`Planificación → Actividad → Embarque → Ejecución → Cumplimiento`, `CUMPLIMIENTO_PARCIAL_ALS_v2.md §13`) — simplemente todavía no está implementado. No es una contradicción entre el equipo y este análisis; era una generalización de más en la redacción original.
2. **Ver `AGUA_BAMBU_N2_DECISION_MINIMA_v1.0.md`** para la revisión de segunda vuelta de las 3 decisiones (A/B/C), pedida explícitamente por el equipo antes de llevarlas al PO — incluye la revisión de si "Gestionar pendiente/PUNTO→DOMICILIO explícito" tenía de verdad status de DECISIÓN o solo de PROPUESTA nunca corregida, y el hallazgo central sobre el punto de creación de `ObligacionPendiente`.
