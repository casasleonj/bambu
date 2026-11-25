# #1001 · Cobro directo de un pedido entregado hoy con promesa de pago

**Estado:** `IMPLEMENTADO` · `VALIDADO` en pruebas automáticas y en navegador local · `QA PENDIENTE` en preview/CI · sin PR ni merge.

## Qué reemplaza

| | Antes (#597) | Ahora (#1001) |
|---|---|---|
| Pedido entregado **hoy**, con saldo, de un cliente real, **con** `promesaPagoFecha` | `errorCobroPedido` respondía 409 `PEDIDO_VENDIDO_FIADO`: «Cóbralo en la pestaña Fiados». | Se cobra con «Registrar pago», igual que uno sin promesa. |
| Resto de resguardos | Solo este pedido · entregado hoy · sin deuda anterior que el reparto pagaría antes · monto ≤ saldo. | **Sin cambios.** |

## Por qué

Por la regla de #796, lo entregado hoy y sin cobrar es *pendiente del día*: el cliente no figura en Fiados hasta el corte (cierre de la jornada, o 00:00 de Bogotá). La excepción de #597 mandaba a Fiados un pedido que Fiados todavía no muestra, así que no había dónde cobrarlo. Era el mismo callejón de #1001.

## Aprobación

PO, en la sesión del 24-nov-2026, opción «a» de #1001, reconfirmada tras explicarle que la promesa de pago nace en una venta fiada a propósito (`CrearPedidoUseCase`, venta en ruta) y que el servidor la rechazaba a propósito: «Si es necesario cambiar la regla, cámbiala, pero mucho cuidado con bugs, daños sistémicos o regresiones, porque esto toca dinero».

## Consumidores verificados (XMOD)

| Consumidor | Efecto del cambio |
|---|---|
| `pagar-fiado` (POST y GET con `pedidoId`) | Mismo `errorCobroPedido` en ambos; la preparación y su `version` no cambian (no se tocó el contenido de la preparación). |
| Cron `vencimiento-promesas` y alertas `PROMESA_*` | Solo miran pedidos no pagados. Un abono parcial conserva la promesa y sus alertas; un pago completo lo saca de ambos, como cualquier pago. |
| `EntregarPedidoUseCase` / antifraude de fiado a propósito | Validan **antes** de entregar; no intervienen al cobrar después. |
| Cierre y Cartera | El cobro sigue el mismo camino que el de un pedido sin promesa (`sinEspejo`, #796): cuenta como cobro del día de la venta. |
| Idempotencia y reintentos | `offlineId` y `versionDeuda` sin cambios; probado el reintento idéntico (un solo pago). |
| Saldo a favor | Imposible por este camino: monto > saldo responde 400 `MONTO_EXCEDE_PEDIDO` (probado con promesa). |

## Pruebas

`src/lib/__tests__/integration/cobro-pedido-del-dia-597.test.ts`: 6 casos nuevos con promesa (cobro completo, parcial con promesa vigente, reintento idéntico, deuda anterior sigue bloqueando, entrega de otro día sigue bloqueando, monto excedido). Contra la regla vieja fallan 5 de esos 6; el de «otro día» pasa en ambas porque ese resguardo no cambió.

## Evidencia ejecutada (local, datos sintéticos)

- **Integración, suite completa (206 archivos):** 187 pasan y 19 fallan (44 tests). Con el archivo del servidor **original** fallan exactamente los mismos 19 archivos y los mismos 44 tests: no hay fallos nuevos. Son del entorno local (base creada con `db push`: faltan `pg_trgm`, `search_clientes`, CHECK, triggers e índices de las migraciones); el CI usa la base migrada.
- **Navegador (Chromium, ADMIN, escritorio):** dos pedidos de hoy con promesa de pago. El diálogo abre sin bloqueo («El pago se aplica solo a este pedido»); cobro completo ($6.000) y parcial ($4.000 de $10.000) responden 200 y aplican solo al pedido; saldo 0 / PAGADO y saldo 6.000 con promesa conservada; 2 pagos; saldo a favor 0. El Cierre del día muestra Ventas $16.000 = Cobrado hoy $10.000 + Quedó fiado $6.000 («Cuadra con Cobrado hoy») y «Pasarán a Fiados al cerrar» lista solo el pedido parcial.
- **No ejecutado:** móvil en este recorrido de cobro, el cron de vencimientos real y CI/preview.

## Reversión

Código puro, sin migración ni datos: `git revert` basta. Restaura el 409 `PEDIDO_VENDIDO_FIADO` y los textos anteriores.
