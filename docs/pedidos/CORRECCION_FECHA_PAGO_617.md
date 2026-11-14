# Corrección de la fecha efectiva de un pago (#617)

Decisión del PO (2026-11-08) y maqueta aprobada. Sin cambios de dinero: ninguna cifra de caja, cierre ni saldo se mueve.

## Las tres fechas de un pago (#402)
- **Registro** (`Pago.createdAt`): cuándo se anotó. Lo pone la base y **concilia la caja**. Nunca cambia.
- **Efectiva** (`Pago.ocurridoAt`): cuándo se cobró de verdad. `NULL` = el mismo instante del registro.
- **Regularización** (`Pago.regularizacionId`): lote formal (#402). Esos pagos no se editan aquí.

Corregir la fecha efectiva cambia lo que muestran el pedido, el cliente y la factura. **No mueve dinero entre cierres.**

## Qué se puede hacer
`POST /api/pagos/[id]/corregir-fecha` con `{ fecha: 'YYYY-MM-DD', motivo, offlineId? }`.

| Caso | Respuesta |
|---|---|
| Quien corrige no es ADMIN | 403 `FORBIDDEN` (también en `corregirFechaPago`) |
| Falta el motivo (menos de 3 letras) | 400 `MOTIVO_REQUERIDO` |
| Fecha mal escrita o imposible | 400 `FECHA_INVALIDA` |
| Fecha posterior al día del registro | 422 `FECHA_POSTERIOR_AL_REGISTRO` |
| Es la misma fecha que ya tiene | 400 `SIN_CAMBIO` |
| El pago viene de una regularización (#402) | 409 `PAGO_REGULARIZADO` |
| La fecha actual o la nueva cae en un día **pasado ya cerrado** | 409 `DIA_CERRADO`: se rectifica con una regularización formal (#402) |
| Reintento con el mismo `offlineId` | 200 `deduped: true`, sin duplicar |
| Correcto | 201: guarda `ocurridoAt` y una fila en `PagoFechaCorreccion` |

- Día nuevo = día del registro → `ocurridoAt = NULL`. Día anterior → mediodía de Bogotá de ese día (siempre ≤ registro).
- Hoy se admite aunque tenga cierre (un hecho real que llega tarde no se bloquea), igual que `validarFechaHechoOficina`.
- Rastro append-only (`PagoFechaCorreccion`, solo `SELECT, INSERT` para `app_write`): fecha efectiva anterior y nueva, quién, cuándo y motivo; más `Historial` (`Pago`/`UPDATE`, `datos.correccionFechaPago`). Un CHECK exige que cambie la fecha y que haya motivo.
- Serializa con el lock `PEDIDO`, igual que cobros y correcciones de precio.

## Pantalla
Detalle del pedido, sección «Pagos y factura»:
- Cada cobro dice «Se cobró D · registrado R» cuando la fecha efectiva difiere. Un cobro anterior a la creación del pedido lleva el aviso «Fecha anterior a la creación del pedido» (puede ser un anticipo real: no se bloquea).
- Solo el ADMIN ve «Corregir fecha» (no en cobros de regularización ni de pedidos anulados/cancelados): fecha (no pasa del día de registro), motivo obligatorio, aviso «qué cambia y qué no», confirmación («¿Cambiar la fecha del cobro?») y «Guardando…». Un error del servidor (p. ej. día cerrado) se muestra en el formulario sin perder lo escrito.
- Cualquier rol con acceso al detalle ve el historial («Corrección de fecha: A → B · quién · cuándo · motivo»).

## Fuera de alcance (a propósito)
- Mover el dinero entre cierres: contradice #402 (el registro es inmutable). Eso es una regularización formal.
- El historial en las pantallas de Cliente y Factura: esta entrega lo muestra en el detalle del pedido, que es de donde se corrige.
- Un permiso para que el ASISTENTE solicite: el PO decidió solo ADMIN.

## Migración
`20261111_pago_fecha_correccion` (aditiva, idempotente: solo una tabla nueva con su CHECK y sus índices; está en `scripts/migraciones-sql-crudas.txt`). **Aplicar en producción antes del merge** (Flujo de Entrega, paso 7).

## Pruebas
`pago-fecha-correccion.test.ts`, `corregir-fecha-pago.test.tsx`, `pedido-detalle-fecha-pago.test.tsx`, integración `pago-fecha-correccion-617.test.ts` (Postgres real: rastro, auditoría, createdAt intacto, cierre sin cambios, 403, validaciones, día cerrado antes y después, regularización, idempotencia en paralelo, detalle, CHECK) y E2E `pagos-corregir-fecha-617.spec.ts`.
