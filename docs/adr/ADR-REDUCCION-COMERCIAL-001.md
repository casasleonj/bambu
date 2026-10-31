# ADR-REDUCCION-COMERCIAL-001 — Reducción comercial aceptada («el cliente ya no quiere el resto»)

- Estado: **Aceptado** (PO 2026-10-31) — implementado
- Fecha: 2026-10-31
- Fuente: #451; ADR-MONETARIO-002 §2; decisiones del PO del 2026-10-24 (nota de crédito: sí) y del 2026-10-31 (abajo)
- Complementa: ADR-CIERRE-004 (corrección de precio), ADR-CORRECCION-MONETARIA-001, `AjustarPedidoCantidadUseCase` (G11)

## Contexto

El cliente pidió 20, recibió 15 y decide no comprar las 5 restantes. Hoy el pedido sigue valiendo 20 y las 5 quedan como entrega pendiente para siempre. La corrección G11 (`ajustar-cantidad`) es solo para errores de captura: no tiene consentimiento del cliente, ni efecto en factura ni en nota de crédito, y rechaza líneas con algo entregado.

## Decisiones del PO (2026-10-31)

| Tema | Decisión |
|---|---|
| Alcance | Solo la reducción. El caso «el cliente ya pagó más que el nuevo total» queda **rechazado** (ver abajo); acreditarlo a saldo a favor requiere antes poder reversar pagos |
| Nota de crédito | **Sí**, se emite en la reducción, con especial cuidado en los cálculos (ver «Cálculos») |
| Quién autoriza | **Permiso específico por usuario** (`User.puedeAutorizarReduccionComercial`); ser ADMIN no basta |

## Decisión

1. **Comando propio** `POST /api/pedidos/[id]/reducir-pedido`: baja la cantidad PEDIDA de **una línea** (`cantidadReducida`). Nunca toca lo entregado: `cantPedido − cantidadReducida ≥ cantEntrega`. El pedido no puede quedar sin unidades (para eso se cancela o se anula).
2. **Consentimiento observado:** `aceptadoPor` (quién del lado del cliente) y `medio` (`PRESENCIAL`, `TELEFONO`, `MENSAJE`) son obligatorios, además del motivo.
3. **Quién:** ADMIN y ASISTENTE registran. Si quien registra **tiene el permiso**, se aplica en el acto; si no, queda `PENDIENTE` hasta que alguien con el permiso la autoriza o rechaza (`PATCH /api/pedidos/reducciones-comerciales/[id]`). El permiso se lee de la base (no de la sesión), exige usuario activo y rol ADMIN/ASISTENTE, y lo cambia solo un ADMIN (`PUT /api/users/[id]`); cambiar a un rol sin derecho lo quita. No hay regla de «último autorizador»: sin autorizadores las solicitudes simplemente quedan pendientes.
4. **Qué se recalcula**, en una sola transacción bajo el lock `PEDIDO`: `PedidoItem.cantPedido/subtotal`, la columna legacy `c…Ped` (el botellón quita primero lo pendiente a domicilio y luego en fábrica), `Pedido.total/saldo/estadoPago`, `Factura.subtotal/total/saldo/estado` y una `NotaCredito` por el monto. La línea **conserva su precio unitario**; si el precio por volumen debe cambiar, se corrige después con la corrección de precio.
5. **Pagó de más → se rechaza** (`422 REDUCCION_GENERARIA_SOBREPAGO`), igual que en la corrección de precio: `chk_pedido_montopagado_le_total` y `totalPagado = Σ Pago + Σ Abono` (V2) no permiten bajar el total sin reversar pagos. Seguimiento en un issue aparte.
6. **Una solicitud pendiente por línea.** Si la línea cambió antes de autorizar, queda obsoleta (`409 REDUCCION_OBSOLETA`).
7. **Idempotencia:** `offlineId` al solicitar; «ya resuelta → deduped» al resolver. No se encola sin red: necesita validación del servidor.

## Cálculos (con especial cuidado)

- Toda la aritmética va en **centavos enteros** (`Math.round(precio × 100) × cantidad`): `monto`, `totalNuevo`, `saldoNuevo`, la factura y la nota salen de los mismos números. La prueba incluye casos con centavos (`3 × $0,10`, `2 × $11,11`) para que el punto flotante no aparezca.
- **Invariantes** que cada prueba de integración verifica con el verificador de integridad (V1–V15) sobre el pedido: `totalPagado + saldo = total` (V1), factura con el mismo saldo que el pedido (V3), entregado = pedido sin necesitar ajuste (V5). `chk_pedido_estadopago_proyectado` se respeta recalculando `estadoPago` con el nuevo total.
- **Cierre diario sin doble conteo.** `/api/cierre` calcula `totalVentas = Σ Pedido.total del día − Σ NotaCredito de pedidos de días anteriores` (`resumirVentasCierre`, #519). Una nota sobre un pedido **de hoy** no se resta otra vez, porque su total ya bajó; una nota sobre un pedido **de un día anterior** baja las ventas de hoy una sola vez y deja intacto el cierre de ese día. ADR-CIERRE-004 §7 evitó emitir la nota en la corrección de precio por este riesgo de doble conteo; con la regla de #519 la nota de un pedido de hoy no vuelve a restarse, y esta combinación (total baja + nota) está cubierta por `cierre-totales.test.ts`.
- La numeración usa la secuencia `nota_credito_numero_seq` (`NC-00001…`), que no se reutiliza ni se bloquea.
- Las notas de crédito cuentan para la señal «muchas notas por cliente» de las alertas; una reducción aplicada suma una nota.

## Interfaz (pendiente de maqueta)

Esta entrega es solo servidor. Por la regla del PO del 2026-10-27, la interfaz (panel «Reducir el pedido» en el detalle del pedido y la casilla «Puede autorizar reducciones de pedido» en Administración → Usuarios) no se implementa hasta que el PO apruebe una maqueta de escritorio y móvil con sus estados de confirmación, carga y error. El permiso se puede asignar mientras tanto con `PUT /api/users/[id]` (`puedeAutorizarReduccionComercial`). Hay una versión ya probada de ambos componentes en la rama local `wip-451-ui`, que no se publica.

## Implementación

| Pieza | Dónde |
|---|---|
| Reglas puras | `src/modules/pedidos/domain/services/reduccion-comercial.service.ts` |
| Aplicar | `src/modules/pedidos/application/services/aplicar-reduccion-comercial.service.ts` |
| Casos de uso | `…/use-cases/ReduccionComercialUseCases.ts` |
| Tabla `PedidoReduccionComercial` + `User.puedeAutorizarReduccionComercial` (aditiva, idempotente) | `prisma/migrations/20261031_pedido_reduccion_comercial/` |
| API | `…/api/pedidos/[id]/reducir-pedido`, `…/reducciones-comerciales`, `…/api/pedidos/reducciones-comerciales/[id]`, `PUT /api/users/[id]` |
| Pruebas | `reduccion-comercial.test.ts` y `reduccion-comercial-http.test.ts` (Postgres real), `reduccion-comercial.service.test.ts`, `reduccion-comercial-http.test.ts` (mapeo), `cierre-totales.test.ts` |

## Consecuencias

- La migración es solo aditiva: se aplica en producción **antes** del merge (AGENTS.md, paso 7).
- Nadie tiene el permiso al desplegar y aún no hay pantalla para asignarlo ni para registrar reducciones: hasta que se apruebe la maqueta, solo se usa la API.
- Sigue pendiente: el caso «pagó de más» (requiere reversión de pagos y acreditar a `Cliente.saldoFavor`).
