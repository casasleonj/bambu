# #318 — El repartidor entrega y cobra desde su pantalla

**Issue:** #318 · **Relacionado:** PR-1B/1C (#355), `docs/incidentes/PR1BC_ENTREGA_FISICA_VIVA_2026-10-14.md`
**Estado:** en `main` con los cambios de servidor vigentes desde el merge (no hay flag propio); la entrega física viva sigue detrás de `EMBARQUE_ENTREGA_VIVA_DESDE` (apagado).

## 1. Qué hace

`/repartidor` tiene un botón **«Entregado»** por pedido (solo con el embarque `EN_RUTA`). Abre una hoja de un solo toque:

1. **Cobro** (si el pedido tiene saldo y la config no oculta precios): monto sugerido = lo que se debe, método habitual `EFECTIVO`, y una frase que anticipa el resultado: *pagado / parcial / fiado*. El estado de pago **no se elige**: el servidor lo deduce de lo cobrado contra lo que se debe.
2. **Foto** obligatoria.
3. **GPS** automático (`capturarGpsSilencioso`). Si no se logra, el repartidor elige un motivo de una lista corta (`Sin señal de satélite`, `Dentro de un edificio`, `Permiso de ubicación denegado`) y continúa. Se guarda como `gpsJustificacion` y la entrega queda con `AuditLog.datos.sinGps = true`.
4. Envía `/api/pedidos/[id]/entrega` con `embarqueEntregaId` (misión física) y, si hay cobro, `embarqueId` (misión del dinero), vía `fetchResilient` con **una clave `offlineId` por apertura de la hoja**: el reintento tras un error o sin red no cobra dos veces.

Sin red, la entrega queda encolada y la tarjeta muestra «Pendiente de enviar».

## 2. Regla antifraude (decisión del PO: opción A)

El repartidor **no crea crédito por su cuenta**. Al entregar por completo dejando saldo:

| Situación | Resultado |
|---|---|
| Cobra todo | Entregado y pagado |
| Deja saldo y el pedido tiene `promesaPagoFecha` (la oficina aceptó la deuda) y el cliente no es `CONSUMIDOR_FINAL` | Entregado, parcial o fiado |
| Deja saldo sin `promesaPagoFecha`, o el cliente es `CONSUMIDOR_FINAL` | `422 FIADO_NO_AUTORIZADO`, **no entrega ni cobra** (rollback). La pantalla indica «No entregar: se devuelve al cerrar el embarque» |

- La regla vive **en el servidor** (`EntregarPedidoUseCase`, input `exigirDeudaAceptada`, activado en la route para REPARTIDOR y trabajadores con moto). La pantalla solo la anticipa (`src/lib/cobro-entrega.ts`).
- ADMIN y ASISTENTE no tienen esta restricción (siguen pudiendo dejar saldo al marcar una entrega).
- Si la config `BLOQUEAR_PRECIOS_REPARTIDOR` está activa, el repartidor no ve montos ni cobra: la regla no se aplica (el cobro es de la oficina) y la hoja solo entrega.
- **`promesaPagoFecha` como marca de «deuda aceptada»**: no existe otro campo que lo exprese. Si la oficina no la fija al crear el pedido, el repartidor no podrá dejarlo a deber. Es la decisión conservadora (antifraude); revisar si en la práctica resulta demasiado estricta.

## 3. Cobro que no se pierde en silencio

Si la oficina ya entregó el pedido mientras el repartidor estaba sin señal, el envío del repartidor llega como `deduped`. Antes el cobro se descartaba sin aviso. Ahora la respuesta trae `pagosNoAplicados: true` y la hoja muestra una advertencia de 12 s («el cobro NO se registró; avisa a la oficina»). El dinero cobrado se registra luego por el flujo de cobro/abono.

## 4. Otros cambios de servidor

- Un cobro mayor al saldo responde `422 PAGO_EXCEDE_SALDO` (antes, 500 genérico). La regla ya existía en el dominio (C-BIZ-6).
- `useEntregarPedido` acepta `offlineId` en el payload y expone `pagosNoAplicados`.

## 5. Pruebas

- `src/lib/__tests__/cobro-entrega.test.ts` (9): regla pura.
- `src/lib/__tests__/integration/repartidor-entrega-cobro.test.ts` (10, Postgres real, handler real): cobro completo atribuido al embarque y evento físico; parcial/sin cobro sin deuda aceptada → rechazado y sin cambios; con deuda aceptada → parcial/fiado; ADMIN sin restricción; venta anónima nunca; cobro de más; reintento no duplica; `pagosNoAplicados`. Con el código anterior fallaban 4/10.
- `src/app/(app)/repartidor/__tests__/entrega-cobro-sheet.test.tsx` (10): la hoja.

## 6. Limitaciones conocidas (honestas)

- **Entrega parcial de producto**: la hoja entrega todo lo pendiente; si el cliente recibe menos, el repartidor no entrega y se devuelve en el cierre → #429.
- **Señal en `/casos`** para entregas sin GPS: hoy solo AuditLog → #430.
- **Fiado nuevo en la calle (venta libre)** y su autorización por la oficina: fuera de alcance → #354 / #300.
- **GPS «del repartidor» cuando marca la oficina** → #398.
- No hay prueba E2E con navegador: el Chromium del sandbox no coincide con el de Playwright; la hoja se cubre con pruebas de componente y el servidor con integración real.
