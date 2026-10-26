# Gestión temporal de pedidos por el ADMIN sin embarque (#472)

> **TEMPORAL.** Existe solo mientras la sección de Embarques no funciona. Se apaga con un
> interruptor y se retira completa cuando Embarques funcione. Nada de lo registrado se pierde al
> retirarla: las columnas nuevas son historial.

## Qué hace (PR-1)

El ADMIN registra desde el pedido que se entregó, sin pasar por un embarque:

- **Quién entregó** (`Pedido.entregadoPorId`): un solo repartidor por pedido. Obligatorio en
  DOMICILIO. Solo trabajadores activos con moto. En entregas siguientes del mismo pedido queda fijo.
- **Cuándo**: hoy por defecto, hasta 7 días atrás, nunca futura, nunca un día anterior con
  `CierreDia`, nunca una fecha cubierta por una `Nomina` del repartidor (`409 NOMINA_EXISTENTE`:
  esa comisión no se liquidaría). Hoy se admite aunque tenga cierre.
- **Cuánto dinero y quién lo recibió** (`Pago.recibidoPorId`, `null` = oficina). Sin valor por
  defecto. La fecha del hecho va en `Pago.ocurridoAt` solo si no es hoy (#402); `createdAt` es
  siempre el registro.
- **Fiado**: solo a un cliente real y con `promesaPagoFecha` futura. Nunca a `CONSUMIDOR_FINAL`.
- **Entrega parcial**: modelo de PR-1 de entrega parcial (el pedido sigue `PENDIENTE`, total y
  pagado intactos). La factura sigue al saldo del pedido en cuanto hay un cobro.
- **Pedido dentro de un embarque**: sale del embarque en el mismo acto (auditado) y la comisión es
  del repartidor elegido, no del conductor del embarque.

Reutiliza `EntregarPedidoUseCase` (factura, N2, pagos, `ReceivableEntry`, lock `PEDIDO`). La tabla
global de transiciones **no cambia**: `Pedido.puedeEntregarOficina()` es la única vía
`PENDIENTE|NO_ENTREGADO → ENTREGADO`.

## Piezas

| Pieza | Ruta |
|---|---|
| Interruptor | `Config.GESTION_ADMIN_SIN_EMBARQUE` (`src/lib/gestion-admin.ts`), apagado por defecto |
| Ruta de entrega | `POST /api/pedidos/[id]/gestion-admin/entrega` (solo ADMIN) |
| Estado + repartidores | `GET /api/pedidos/gestion-admin/estado` |
| Errores de dominio | `src/modules/pedidos/domain/services/entrega-oficina.errors.ts` |
| Regla nómina | `src/lib/nomina-cobertura.ts` |
| Cobro de fiado con «quién recibió» | `POST /api/pedidos/pagar-fiado` (campos `recibioDinero`, `repartidorId`, `fechaRecepcion`), `registrar-entrega/logica-cobro.ts` y `cobro-oficina-campos.tsx` |
| Regla de fecha compartida | `src/lib/gestion-admin-fecha.ts` (no futura, ≤ 7 días, día no cerrado) |
| Comisión en la nómina | segunda fuente en `POST /api/nomina` (bloque `TEMPORAL-SIN-EMBARQUE(#472)`) |
| Pantalla | `src/app/(app)/pedidos/registrar-entrega/` |
| Hook | `src/hooks/use-gestion-admin.ts` |
| Acción en la ficha | `registrar-entrega` en `pedido-detalle/derive-detalle.ts` |
| Pruebas | `src/lib/__tests__/integration/entrega-oficina-sin-embarque.test.ts`, `nomina-comision-sin-embarque.test.ts`, `pagar-fiado-oficina.test.ts` + unitarias junto a cada pieza |

## Cobro posterior de un fiado (PR-3 de #472)

En **Pedidos → Fiados**, al cobrar, el ADMIN (con la función encendida) ve dos preguntas más:

- **¿Quién recibió el dinero?** («Se pagó en la oficina» o «Lo recibió un repartidor» + cuál). **No viene marcada.** El pago guarda
  `Pago.recibidoPorId` (vacío = oficina).
- **¿Cuándo se recibió?** Hoy por defecto, hasta 7 días atrás, nunca futuro y no un día ya cerrado. Si no es hoy se guarda como
  `Pago.ocurridoAt`; el registro (`createdAt`) sigue siendo el momento real.

Si el repartidor tiene una nómina que cubre esa fecha, se rechaza (`NOMINA_EXISTENTE`). La ASISTENTE y el ADMIN con la función apagada cobran
como siempre, sin estas preguntas: el servidor rechaza los campos nuevos si no es ADMIN (`SOLO_ADMIN`) o si está apagada (`FUNCION_DESACTIVADA`).
Un cobro que ya se aplicó (misma clave) no se vuelve a validar al reintentarse.

## Activación

1. Aplicar `prisma/migrations/20261025_pedido_entregado_por_pago_recibido_por` en producción
   **antes** del merge (aditiva e idempotente, #350).
2. Mergear con el interruptor apagado.
3. La nómina ya suma esta comisión (PR-2 de #472): un pedido a **domicilio**, **entregado por completo**, con
   `entregadoPorId` = el trabajador, **sin embarque** (`embarqueId` nulo) y `entregadoAt` dentro del período, cuenta con
   las mismas tarifas y la misma regla de tipo de pago (COMISIÓN/MIXTO con moto) que las entregas de embarque. Un pedido
   que está en un embarque no se cuenta dos veces. Una entrega **parcial** no paga comisión hasta completarse, y la
   comisión completa es de quien registró la entrega que la completó (un solo repartidor por pedido).
4. Encender `GESTION_ADMIN_SIN_EMBARQUE=true` en `Config`. **Todavía no hay pantalla para esto** (la maqueta 9
   queda para una fase siguiente): se enciende con `POST /api/config {"clave":"GESTION_ADMIN_SIN_EMBARQUE","valor":"true"}`
   como ADMIN, o con SQL. El interruptor se lee **siempre de la base, sin caché** (#479: el caché de `Config` sirve el valor
   viejo una vez tras un cambio), así que apagarlo surte efecto en la petición siguiente.

## Cómo retirarla cuando Embarques funcione

1. Poner `GESTION_ADMIN_SIN_EMBARQUE=false` (los botones desaparecen y el servidor rechaza).
2. Borrar las piezas de la tabla de arriba y cada punto marcado `TEMPORAL-SIN-EMBARQUE(#472)`:
   `grep -rn "TEMPORAL-SIN-EMBARQUE" src prisma docs`.
3. **Conservar** `Pedido.entregadoPorId` y `Pago.recibidoPorId` (historial de comisión y de fiado).
4. Quitar la clave de `Config` y de `prisma/seed.ts`.
