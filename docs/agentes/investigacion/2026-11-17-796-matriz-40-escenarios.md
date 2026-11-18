# #796 · Matriz de los 40 escenarios (estado real de la evidencia)

**Fecha:** 17-nov-2026. **Base:** rama `ccr-7bd580d5-4itx13` con `main` integrado (a15f378 + commits posteriores).
**Niveles de evidencia (no se mezclan):**
- **EJECUTADO:** hay una prueba o un recorrido de navegador **de #796** que cubre exactamente el escenario y pasó.
- **EXISTENTE:** el repo ya tenía pruebas del área y pasaron en la suite completa, pero **no revisé** que asierten exactamente este caso. Orienta, no demuestra.
- **PARCIAL:** una parte del escenario está probada; se indica qué falta.
- **PENDIENTE:** sin prueba.

**Resultado (actualizado tras la fase 2b):** 19 EJECUTADO · 12 PARCIAL · 5 EXISTENTE · 4 PENDIENTE (= 40). **Con esto el issue no se puede cerrar** (condición 7 del PO): quedan 21 escenarios sin prueba directa completa.

| # | Escenario | Estado | Evidencia / lo que falta |
|---|---|---|---|
| 1 | Creado, entregado y pagado el mismo día | EJECUTADO | `cobro-clasificacion.test` (caso #1119), integración `cobro-clasificacion-796` (A), QA navegador (Cierre y Cartera) |
| 2 | Entrega parcial pagada el mismo día | PARCIAL | Se prueba con la porción entregada; falta un caso con remanente real sin entregar |
| 3 | Pago parcial durante la jornada | EJECUTADO | unit «pago repartido: 10.000 hoy y 20.000 mañana» |
| 4 | Entrega sin pago al corte | PARCIAL | El fiado en vivo lo cubre `parciales-proyecciones-656` (existente); «al corte» es la fase 2 (foto) |
| 5 | Entrega ayer, cobrada hoy | EJECUTADO | unit (#1017), integración (C), QA |
| 6 | Creado ayer, entregado y cobrado hoy | EJECUTADO | unit y QA (B, tipo #1084/#1095) |
| 7 | Creado sin entrega ni pago | PARCIAL | unit de pedido sin entregar; sin dinero no hay cobro que clasificar |
| 8 | Varias entregas el mismo día | EJECUTADO | unit nuevo (escenario 8) |
| 9 | Entregas en distintas jornadas | EJECUTADO | unit FIFO e integración `cobro-mixto-796` (M) |
| 10 | Pago único mixto (cartera + venta actual) | EJECUTADO | unit, integración y QA (Cartera muestra solo la porción de cartera) |
| 11 | Pago insuficiente (FIFO) | EJECUTADO | unit «cada cobro consume solo lo que no cubrió otro» y ejemplo de $35.000 |
| 12 | Cobro de varios pedidos | PARCIAL | El lector clasifica varios pedidos (integración); el reparto de un cobro entre pedidos lo cubre `pagar-fiado-deuda-exigible` (existente) |
| 13 | Varios medios aplicados a varias entregas | PARCIAL | Desglose por medio probado (unit); falta el caso de varios medios sobre varias entregas |
| 14 | Anticipo anterior a la entrega | EJECUTADO | unit (anticipo y prepago; defecto del prepago hallado y corregido), integración (P) |
| 15 | Anticipo superior al valor entregado | EJECUTADO | unit |
| 16 | Excedente a saldo a favor | EXISTENTE | `pagar-fiado-deuda-exigible` («el sobrante queda a favor»); el clasificador no lee saldo a favor |
| 17 | Consumo de saldo a favor sin nuevo ingreso | PARCIAL | unit con `BONO`; `cierre-saldo-favor-ingreso-524` y `dashboard-cobros-526` existentes |
| 18 | Transferencia pendiente de confirmar | PARCIAL | Probado en factura (pantalla e impresa) y clasificador; el efecto en Cierre es existente |
| 19 | Transferencia rechazada (`DISCREPANTE`) | PARCIAL | La factura del cliente no la expone (unit). **Fase 2b:** el dinero de un pago sin abono ya se puede revertir con `NO_RECIBIDO` (integración + QA, bandera encendida); `DISCREPANTE` por sí solo sigue sin revertir (ADR-PAGO §4) |
| 20 | Corrección de efectivo | EJECUTADO | `correccion-abono-corregir` (existente), `corregir-lock-pedido-796` y `corregir-pago-sin-abono-796` (pago en efectivo, resta de la caja física del día); QA 12/12 |
| 21 | Reversión aplicada a varias entregas | PENDIENTE | — |
| 22 | Devolución parcial y total | PENDIENTE | Devolver dinero de un pago no existe; `devolver-saldo-favor` (#560) es otro concepto |
| 23 | Anulación con pagos | EXISTENTE | `anular-cascada-hijos` y afines |
| 24 | Cancelación del remanente no entregado | EXISTENTE | `reduccion-cumplimiento-stock-660`; el caso #1119 real fue exactamente este |
| 25 | Modificación comercial tras una parcial | EXISTENTE | pruebas de corrección de precio y reducción |
| 26 | Corrección retroactiva de la fecha efectiva | PARCIAL | `pago-fecha-correccion` (existente); el clasificador usa `createdAt` (límite documentado) |
| 27 | Consulta histórica tras un cobro posterior | PENDIENTE | Fase 2 del issue (foto al corte) |
| 28 | Corrección después del cierre | PARCIAL | Señal #712 existente; F8 ahora con prueba propia: la corrección de un pago resta de la caja del **día del pago** (`corregir-pago-sin-abono-796`); falta probar que un cierre ya guardado no cambia con una corrección por pago |
| 29 | Cobro próximo al corte | EJECUTADO | unit (23:30 y 00:30 de Bogotá) |
| 30 | Cobro concurrente de dos usuarios | EJECUTADO | `corregir-lock-pedido-796` (fallaba antes del arreglo), dos correcciones totales simultáneas del mismo pago (una gana) y «dos cobros simultáneos» existente |
| 31 | Reintento tras desconexión | EXISTENTE | replay A/B/A y `offlineId` en `pagar-fiado`; no tocado |
| 32 | Doble clic | EJECUTADO | QA: la impresión genera un solo documento |
| 33 | Sincronización offline en otra jornada | PENDIENTE | — |
| 34 | Pedido histórico sin `EntregaExigible` | EJECUTADO | unit, integración (D, E) y QA (marca «Fecha aproximada») |
| 35 | Abono histórico de origen desconocido | EJECUTADO | `cartera-origen-796` (nunca se esconde) |
| 36 | Abono independiente legítimo | EJECUTADO | `cartera-origen-796` y `cartera-abonos-list` |
| 37 | Reconstrucción con información insuficiente | PARCIAL | Se marca «aproximado» y no se finge precisión; la reconstrucción a corte es la fase 2 |
| 38 | Factura digital e impresa con pagos y reversiones | EJECUTADO | unit (impresión), integración (API con roles), QA 13/13 |
| 39 | Conciliación exacta por medio | PARCIAL | Desglose del Cierre y E2E `cierre-desglose-631` pasan; falta conciliar todos los consumidores a la vez |
| 40 | Recarga y persistencia | EJECUTADO | QA: recarga de Cartera y de la factura |

## Módulos que pidió la condición 7 y **no** se validaron
Clientes, venta rápida y venta libre, venta en ruta, embarques, inventario, nómina, finanzas y auditoría **no** se validaron por tocar su código ni por regresión dirigida; solo los cubre la suite completa del repo (5.313 unitarias y 1.197 de integración pasaron sobre la base integrada). Pedidos, Fiados, Cartera, Facturación, Dashboard, Caja y Cierre sí tienen recorrido o prueba de #796.

## Otras ejecuciones en la base integrada
- E2E afectado (facturas, facturas-ux, abonos, cierre-desglose-631, dashboard-cobros-526, cierre-511-513): **29 pasaron, 0 fallaron, 3 omitidos** (`test.skip()` condicionales de los propios specs; no se tocó `e2e/`). Sin comparar contra `main`: no había fallos que comparar. No se corrió el CI de GitHub.
