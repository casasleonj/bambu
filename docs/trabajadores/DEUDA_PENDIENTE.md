# Deuda pendiente del trabajador (#566)

Qué ve cada rol y de dónde sale la cifra. Solo lectura; abonar y repartir el descuento por días son otras entregas (#570, #569).

## Qué cuenta como deuda

| Origen | Se muestra como | Pedido |
|---|---|---|
| `DeudaTrabajador` `PRESTAMO` | Préstamo | no |
| `DeudaTrabajador` `ADELANTO_NOMINA` | Adelanto de nómina | no |
| `DeudaTrabajador` `DEFICIT_EFECTIVO` con pedido o texto «Fiado no cobrado» | Fiado no cobrado | sí (`pedidoId`) |
| `DeudaTrabajador` `DEFICIT_EFECTIVO` sin pedido | Descuadre de caja | no |
| `DeudaTrabajador` `OTRO` | Otra deuda | no |
| `DescuentoRepartidor` con `aplicadoEnNomina = false` | Faltante de embarque | no |

Solo entran deudas con saldo (`montoPendiente > 0`) y descuentos todavía no aplicados en una nómina. «Falta pagar» es el saldo; «Total» es lo original. Un descuadre de caja pasa a ser deuda cuando el caso se resuelve «con cargo»; mientras está pendiente no aparece.

## Pedido de origen

`DeudaTrabajador.pedidoId` (nullable, `onDelete: SetNull`). Lo llena el cron `generar-deudas-trabajador` al crear la deuda. La migración `20261101_deuda_trabajador_pedido_id` rellena las existentes leyendo «Fiado no cobrado: Pedido #N» **solo si** el número y el embarque coinciden con un único pedido; el resto queda en null y se muestra con «—».

## Quién ve qué

| Rol | Lista de trabajadores (bloque en la tarjeta) | Detalle de cualquier trabajador | Mi perfil («Mis deudas») |
|---|---|---|---|
| ADMIN | sí, con acciones | sí | solo si está vinculado a un trabajador |
| ASISTENTE | sí, **sin** crear/editar/desactivar | sí | ídem |
| CONTADOR | sí, sin acciones | sí | ídem |
| REPARTIDOR, SELLADOR | no tienen la pantalla | solo el suyo (403 en otros) | sí |

Sin deuda no se muestra nada (ni bloque ni texto).

## Piezas

| Pieza | Dónde |
|---|---|
| Armado y consulta (fuente única de las cifras) | `src/lib/deuda-trabajador-resumen.ts` |
| Resumen por trabajador (tarjetas) | `GET /api/trabajadores/deudas-resumen` (ADMIN, ASISTENTE, CONTADOR) |
| Detalle de uno | `GET /api/trabajadores/[id]/deudas-pendientes` (los tres roles, o el dueño) |
| Pantalla | `src/components/deudas-trabajador/` y `src/app/(app)/mi-perfil/mis-deudas.tsx` |
| Pruebas | `deuda-trabajador-resumen.test.ts`, `api/trabajadores/__tests__/deudas-pendientes.test.ts`, `e2e/deudas.spec.ts`, `e2e/trabajadores-deuda-roles.spec.ts` |

## Pendiente (no es parte de esta entrega)

- Hoy `GET /api/deudas/[id]` solo exige sesión: cualquier usuario autenticado puede leer una deuda por su id. Está fuera del alcance de #566.
- `POST /api/deudas` y `POST /api/deudas/[id]/abonar` permiten ADMIN y ASISTENTE; el PO pidió que el asistente abone y no cree (#570).
