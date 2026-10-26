import { Prisma } from '@prisma/client'

/**
 * Cobro de cartera del día para el cierre de caja (#513).
 *
 * `pagar-fiado` escribe el mismo dinero dos veces: un `Pago` (que el cierre ya cuenta por
 * `createdAt` en `cobroVentasHoy`) y un `Abono` espejo (mismo pedido, monto y método, en la
 * misma transacción). Sumar los dos metía el cobro dos veces en la caja esperada.
 *
 * Aquí se suman los abonos del día SIN el espejo cuyo `Pago` ya cuenta en la caja. Un abono
 * suelto de `/api/abonos` no tiene `Pago` y sigue contando. Si el `Pago` espejo NO cuenta en la
 * caja de ese día (regularización de otro día, #402, o pedido anulado/cancelado), el abono sí
 * cuenta: es la única huella del dinero que entró hoy.
 *
 * Mismo criterio de espejo que el verificador de integridad (`ABONOS_SIN_ESPEJO`).
 */
export type TxCobroCartera = Pick<Prisma.TransactionClient, '$queryRaw'>

export async function sumaAbonosDelDiaSinEspejo(tx: TxCobroCartera, desde: Date, hasta: Date): Promise<number> {
  const filas = await tx.$queryRaw<Array<{ total: Prisma.Decimal | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(a.monto), 0) AS total
    FROM "Abono" a
    JOIN "Factura" f ON f.id = a."facturaId"
    WHERE a.fecha >= ${desde} AND a.fecha < ${hasta}
      AND NOT EXISTS (
        SELECT 1 FROM "Pago" g
        JOIN "Pedido" p ON p.id = g."pedidoId"
        WHERE g."pedidoId" = COALESCE(a."pedidoId", f."pedidoId")
          AND g.monto = a.monto
          AND g.metodo::text = a."metodoPago"
          AND g."regularizacionId" IS NULL
          AND p."estadoEntrega" NOT IN ('CANCELADO', 'ANULADO')
          AND g."createdAt" >= ${desde} AND g."createdAt" < ${hasta}
          AND ABS(EXTRACT(EPOCH FROM g."createdAt" - a."createdAt")) < 5
      )`)
  return Number(filas[0]?.total ?? 0)
}
