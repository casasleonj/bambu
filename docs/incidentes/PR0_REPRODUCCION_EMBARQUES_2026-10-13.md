# PR-0 — Paquete de reproducción: incidente de embarques 2026-10-13

**Incidente:** AB-INC-EMB-2026-10-13 · **ALS:** AB-ALS-EMB-2026-10-13 + Adenda v1.2
**SHA base (`origin/main`):** `080dc7413dd61d2e543fc1a7a7e41649b42ea293`
**Alcance:** solo pruebas y evidencia. **Ningún cambio productivo.** No se mergea en rojo.
**Prueba:** `src/lib/__tests__/integration/embarque-cierre-incidente-2026-10-13.test.ts`
**Ejecución:** `npx vitest run --config vitest.integration.config.ts src/lib/__tests__/integration/embarque-cierre-incidente-2026-10-13.test.ts`
(Postgres local 16, esquema por `prisma db push`; datos 100% sintéticos, producción no tocada.)

Resultado en `main@080dc74`: **8 rojos · 3 verdes** (11 casos).

## Escenarios reproducidos

| Caso | Defecto | Escenario | Esperado (contrato) | Observado en `main` |
|---|---|---|---|---|
| ROJO | **B-01** (caso #331) | Carga 2 BOTELLON; pedido fresco 2 BOTELLON, total y pagado $15.000; cierre `COMPLETO` entregando 2 | `discrepanciaTotal = 0`; 0 `ResponsibilityCase`; ΣENTREGA BOTELLON = 2 | `discrepanciaTotal = 2` (falso faltante). La conciliación lee `pedidosRaw` previo al proceso (`cBotellonFabEnt = 0`) |
| ROJO | **B-01 / I-08** (prueba 3) | Pedido de 10, 3 entregadas en misión anterior; E2 carga 7 y entrega 7 | `discrepanciaTotal = 0`; ΣENTREGA en E2 = 7 | `discrepanciaTotal = 4` (7 − 3 del histórico). El snapshot mezcla cumplimiento acumulado con la misión |
| ROJO | **B-08** (prueba 4) | Pedido de 10 con 3 acumuladas, `NO_ENTREGADO` en E2 | `cPacaAguaEnt = 3`, `PedidoItem.cantEntrega = 3`, estado `PENDIENTE` | Acumulado borrado a `0` (`procesarNoEntregado` pone todo en 0) |
| ROJO ×2 | **B-12** (prueba 5) | Pedido de 10 con 3 acumuladas, `COMPLETO` con delta 0 y con delta 2 | El servidor rechaza; pedido, factura y ledger intactos | La promesa **resuelve**: el cierre acepta `COMPLETO` sin completitud |
| ROJO | **B-11** (prueba 7) | Precio congelado igual; `COMPLETO` del remanente (7 de 10) | 0 `Historial.PRECIO_CIERRE` | 1 fila: `logPrecioCierre` compara el valor del delta ($7.000) con `Pedido.total` ($10.000) |
| ROJO | **B-13** (hallazgo nuevo de PR-0) | Pedido de 2 BOTELLON entregado `COMPLETO` | `PedidoItem(BOTELLON).cantEntrega = 2` | `0`. `updatePedidoItems` busca `BOTELLON_FAB`/`BOTELLON_DOM` pero el ítem se llama `BOTELLON`, así que `updateMany` no afecta ninguna fila |
| ROJO | **B-09 / I-07** | Pedido ya entregado vía `/entrega` (`cEnt = 2`) + `ENTREGA` viva de 2 (`POST /botellones`); carga 2; cierre con delta 0 | Cierre rechazado, o salidas ≤ carga | `cierreRechazado=false`, `ΣENTREGA BOTELLON = 4` con carga 2: el cierre agrega una 2.ª salida desde el snapshot histórico |
| LATENTE | **B-09** (forma post-fix) | `ENTREGA` viva de 2 + entrega de 2 en el cierre; carga 2 | Cierre rechazado, o salidas ≤ carga | Verde **solo porque B-01 omite** la entrega nueva. Debe seguir verde tras arreglar B-01: protege contra el fix ingenuo `post − pre` |
| GUARDA | prueba 6 | Pedido prepago 100%, entrega física ahora | Sin `Pago` nuevo en la misión, saldo 0, sin fiado | Cumple |
| GUARDA | prueba 10 | Replay del mismo cierre con el mismo `offlineId` | Sin duplicar movimientos ni pagos | Cumple (`CierreDedupService`) |

## Hallazgos de PR-0 que modifican el plan

1. **B-13 es nuevo** y no figura en el ALS ni en la adenda. Es del mismo servicio que B-01/B-11/B-12; sugiero incorporarlo a PR-1A.
2. **B-09 tiene dos caras.** Hoy se manifiesta cuando el pedido ya fue entregado antes del cierre. Tras arreglar B-01 de forma ingenua aparecería también en el caso corriente. La prueba `[LATENTE]` debe permanecer verde en PR-1B/1C.
3. Las pruebas del ALS 1, 2 (parcialmente), 8 y 9 **no se incluyen** en PR-0:
   - 2 y 9 requieren el evento físico vivo de `/entrega` (PR-1B), que aún no existe.
   - 8 exige decidir el esquema de auditoría antes/después del precio unitario (PR-1A); fijarlo ahora sería diseñar en una prueba.

## Cobertura de las 12 pruebas bloqueantes de la adenda (§6)

| # | Estado en PR-0 |
|---|---|
| 1 | ROJO (caso #331) |
| 2 | Pendiente de PR-1B (no existe evento físico vivo en `/entrega`) |
| 3 | ROJO |
| 4 | ROJO |
| 5 | ROJO ×2 |
| 6 | GUARDA |
| 7 | ROJO |
| 8 | Pendiente de PR-1A (definir esquema de auditoría) |
| 9 | Pendiente de PR-1B/1C |
| 10 | GUARDA (replay del cierre). El replay de `/entrega` viejo es de PR-1B |
| 11 | ROJO + LATENTE (B-09) |
| 12 | Cubierta por PR-3 (#295) |

## Disciplina de merge

PR-0 se abre como **Draft** y **no se mergea en rojo**. Cada `it` rojo se incorpora al PR de reparación que lo hace pasar (B-08/B-12/B-11/B-13 → PR-1A; B-01/B-09 → PR-1B/1C). El caso $150.000 sigue abierto: ninguna de estas pruebas lo explica.
