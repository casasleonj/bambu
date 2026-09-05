# AGUA BAMBÚ — N2: MATRIZ DE PRUEBAS

**Versión:** 1.0 · **Fecha:** 2026-09-05 · **Base:** `main` `c3822999`

Qué prueba debe demostrar cada invariante/caso de `AGUA_BAMBU_N2_ESPECIFICACION_FUNCIONAL_v1.0.md`. Ninguna de estas pruebas existe todavía (el código tampoco) — esta matriz es el contrato de aceptación para cuando se implemente.

## Unitarias

| Invariante/Caso | Test | Ubicación sugerida |
|---|---|---|
| `I-1` cantidad (reutilización) | Ya cubierto por `34A/B/C` existentes — no duplicar, solo extender si `GestionarPendienteUseCase` introduce un nuevo camino de escritura | `obligacion-concurrencia.test.ts` (extender) |
| `I-9` modo inequívoco | `Actividad.modo` nunca `null` para una Actividad `ASIGNADA`/`EN_PROGRESO`/`CUMPLIDA` recién creada | nuevo: `actividad-modo.test.ts` |
| Caso F/G/H — diferencial | `calcularDiferencial()` con histórico=$40.000/actual=$44.000 → `+4.000`; $40.000/$37.000 → `-3.000`; $40.000/$40.000 → `0` | nuevo: `diferencial-calculo.test.ts` (unit, mockeando `resolverPreciosPedido`) |
| `CambiarModoActividadUseCase` — no-op idempotente | mismo modo destino que el actual → no genera evento ni diferencial | nuevo: `cambiar-modo-actividad.test.ts` |
| `LiberarActividadUseCase` — transición de estado | `ASIGNADA`/`EN_PROGRESO` → `CANCELADA`; rechaza si ya `CUMPLIDA`/`CANCELADA` (`ACTIVIDAD_NO_MODIFICABLE`) | nuevo: `liberar-actividad.test.ts` |
| Errores de dominio | cada código de la Especificación Funcional/ALS §10 tiene un test que lo dispara | mismos archivos de arriba |

## Integración (Postgres real)

| Invariante/Caso | Test | Ubicación sugerida |
|---|---|---|
| Caso A | Pedido 10/10 entregado → jamás se crea `ObligacionPendiente` | extender `entrega-parcial-integridad.test.ts` o nuevo `gestionar-pendiente-integridad.test.ts` |
| Caso B | Pedido 10, entregadas 6 → **cero** filas en `ObligacionPendiente` tras el cierre (ya cubierto indirectamente por `entrega-parcial-integridad.test.ts`; agregar assert explícito `count(ObligacionPendiente) === 0`) | mismo archivo, reforzar assert |
| Caso C | Gestionar pendiente 4 con `modo=PUNTO` sin cambio de tarifa → `diferencial=0`, `ObligacionPendiente`+`Actividad` creadas con `cantidadOriginal=4` | `gestionar-pendiente-integridad.test.ts` |
| Caso D | Gestionar pendiente 4 con `modo=DOMICILIO` y tarifa distinta → diferencial calculado y aplicado antes de confirmar (no antes de mostrar) | mismo archivo |
| Caso E | `CambiarModoActividadUseCase` sobre una `Actividad` `ASIGNADA` aún no ejecutada → modo cambia, evento de auditoría con modo anterior/nuevo, diferencial recalculado contra el nuevo modo | `cambiar-modo-actividad-integridad.test.ts` |
| Caso F | Diferencial positivo → `Pedido.total` sube exactamente $4.000, `Pedido.saldo` sube $4.000, `Pedido.totalPagado` sin cambios, `PedidoCantidadAjuste.montoDiferencial = 4000` | `diferencial-positivo-integridad.test.ts` |
| Caso G | Diferencial negativo → `Cliente.saldoFavor` sube exactamente $3.000, `Pedido.total` **sin cambios** (nunca baja) | `diferencial-negativo-integridad.test.ts` |
| Caso H | Diferencial cero → `PedidoCantidadAjuste` se crea igual (`montoDiferencial=0`, trazabilidad), ningún campo monetario de `Pedido`/`Cliente` cambia | mismo archivo que F o dedicado |
| Caso I | 2 tramos de cumplimiento (2+2 de una obligación de 4) con tarifas distintas por tramo → `Σ montoDiferencial` de los 2 `PedidoCantidadAjuste` = diferencial real total, `cantidadCumplida` final = `cantidadOriginal`, **nunca** se supera (constraint `chk_obligacion_no_sobreconsumo`) | `diferencial-multiples-parciales-integridad.test.ts` |
| Caso J (sin diferencial cobrado) | Cancelar una `Actividad` `ASIGNADA` antes de ejecutar, sin diferencial confirmado → `ObligacionPendiente.estado=ANULADA`, `Actividad.estado=CANCELADA`, remanente reconstruible 100% desde `Pedido`/`PedidoItem` | `liberar-actividad-integridad.test.ts` |
| Caso J (con diferencial ya cobrado) | Cancelar después de que el diferencial positivo ya se cobró → reversión vía `registrarReversionPedido` + `ReceivableEntry` tipo `REVERSION`, `Pedido.total` vuelve a su valor sin el diferencial | mismo archivo, caso adicional |
| Concurrencia — nueva | Dos `GestionarPendienteUseCase` concurrentes sobre el mismo `Pedido`/`PedidoItem` con cantidades que juntas exceden el remanente → el lock `PEDIDO:{pedidoId}` serializa; el segundo rechaza con `CANTIDAD_EXCEDE_PENDIENTE`, nunca crea una `ObligacionPendiente` con `cantidadOriginal` inflado | `gestionar-pendiente-concurrencia.test.ts` |
| Concurrencia — asignación (reutiliza 34A/B/C) | Dos asignaciones concurrentes sobre la `ObligacionPendiente` creada por "Gestionar pendiente" → mismo comportamiento ya probado en `obligacion-concurrencia.test.ts`, sin regresión | reutilizar suite existente, agregar caso con `ObligacionPendiente` originada por este flujo (no solo por seed directo) |
| Idempotencia — `GestionarPendienteUseCase` | Replay con mismo `offlineId` → devuelve la misma `ObligacionPendiente`/`Actividad`, no duplica | `gestionar-pendiente-integridad.test.ts` |
| Idempotencia — `CambiarModoActividadUseCase`/`LiberarActividadUseCase` | Replay con mismo `offlineId` → no duplica el evento ni re-aplica el diferencial dos veces (requiere `PedidoCantidadAjuste.offlineId`, ver ALS §7/§14) | `cambiar-modo-actividad-integridad.test.ts`, `liberar-actividad-integridad.test.ts` |
| No regresión — PR-1 | El flujo ordinario de entrega parcial (sin "Gestionar pendiente") sigue exactamente igual tras estos cambios — 0 `ObligacionPendiente` creadas, mismo comportamiento de `entrega-parcial-integridad.test.ts` | correr la suite existente sin modificar, debe seguir verde |
| No regresión — F-A (recurrentes) | `saldoFavor` sigue consumiéndose correctamente en `CrearPedidoUseCase` y en la consolidación de recurrentes tras agregar el llamador nuevo (diferencial negativo) | correr `recurrentes-aplicar-credito-integridad.test.ts` sin modificar, debe seguir verde |
| No regresión — F-B (cierre) | Un diferencial positivo cobrado hoy (nuevo `Pago`/incremento de `totalPagado` vía cartera) aparece correctamente en la caja del día por fecha de captura | correr `auditoria-post-pr2-cierre-dia.test.ts` sin modificar, debe seguir verde; agregar caso nuevo si el cobro de diferencial pasa por un `Pago` explícito |
| **`I-11` (hallazgo adversarial) — no doble entrega** | Crear `ObligacionPendiente`+`Actividad` para 4 unidades gestionadas; intentar entregar esas mismas 4 por la vía ordinaria (`EntregarPedidoUseCase` o cierre de embarque) → debe rechazar con `SOBREPOSICION_CON_OBLIGACION_ACTIVA`, nunca incrementar `cantEntrega` más allá de `cantPedido − cantidadOriginal` mientras la Obligación esté `ABIERTA` | `entrega-ordinaria-vs-obligacion-activa.test.ts` (nuevo, integración) — **bloqueante, debe existir antes de habilitar `GestionarPendienteUseCase` en producción** |
| Diferencial no-stale (hallazgo adversarial) | Calcular diferencial en preview, cambiar la tarifa vigente, confirmar → el monto aplicado es el recalculado en la transacción de confirmación, no el del preview | `cambiar-modo-actividad-integridad.test.ts` (agregar caso) |

## E2E

| Caso | Spec sugerida |
|---|---|
| Gestionar pendiente → PUNTO, sin diferencial | `e2e/gestionar-pendiente.spec.ts` (nuevo) |
| Gestionar pendiente → DOMICILIO, con diferencial positivo mostrado antes de confirmar | mismo archivo |
| Cambiar modo antes de ejecutar (Caso E) | mismo archivo |
| Cancelar antes de ejecutar, sin y con diferencial ya cobrado (Caso J) | mismo archivo |
| Regresión: entrega parcial ordinaria (sin gestionar) sigue sin crear pendientes gestionables espontáneamente | extender specs existentes de entrega parcial si las hay, o agregar assert en el nuevo spec |

**Nota:** el estado actual de E2E en este repo tiene un patrón de fallas amplias no relacionadas con el contenido de los tests (`AGENTS.md #20/#25`) — los E2E de esta matriz se agregan igual (son el contrato de aceptación funcional), pero no se bloquea el merge de la implementación exclusivamente por el estado general de la suite E2E, siguiendo la misma cadencia usada en el resto de esta serie de PRs (`Type check + Tests` + `Integration tests` como gate real).
