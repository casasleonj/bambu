import { Prisma } from '@prisma/client'

export class CobrosSinConciliarError extends Error {
  readonly code = 'COBROS_PENDIENTES_CONCILIACION'
  constructor(
    readonly cobros: Array<{ id: string; referencia: string; importe: number }>,
  ) {
    super(
      'Hay cobros de esta fecha pendientes de conciliar. Un administrador debe verificar su origen antes de cerrar el día.',
    )
  }
  get abonoIds() {
    return this.cobros.map((c) => c.id)
  }
}

export type TxCobroCartera = Pick<Prisma.TransactionClient, '$queryRaw'>

export type CobroCartera = {
  fecha: Date
  canal: string
  pedidoNumero: number
  fechaPedido: Date
  id: string
  numero: string
  monto: Prisma.Decimal
  reversion: Prisma.Decimal
  origenCobro: string | null
  pagoOrigenId: string | null
  independienteVerificado: boolean
  pagoId: string | null
  pedidoId: string
  pagoPedidoId: string | null
  metodoPago: string
  pagoMetodo: string | null
  pagoMonto: Prisma.Decimal | null
  pagoFecha: Date | null
  regularizacionId: string | null
}

/**
 * #513: un espejo nunca es otro ingreso, aunque el Pago no sea elegible para
 * esta fecha. Para legado, la clave de /abonos o su CREATE auditado prueban
 * procedencia independiente. No inferir identidad por importes o timestamps.
 */
export async function leerAbonosDelPeriodo(
  tx: TxCobroCartera,
  desde: Date,
  hasta: Date,
  incluirEspejosDePagos = false,
) {
  return tx.$queryRaw<CobroCartera[]>(Prisma.sql`
    SELECT a.id, a.numero, a.fecha, a.monto, p.canal::text AS canal, p.numero AS "pedidoNumero", p.fecha AS "fechaPedido", a."origenCobro", a."pagoOrigenId", a."metodoPago",
      COALESCE(a."pedidoId", f."pedidoId") AS "pedidoId",
      (a."offlineId" IS NOT NULL OR EXISTS (
        SELECT 1 FROM "Historial" h WHERE h.entidad = 'Abono'
          AND h."registroId" = a.id AND h.accion = 'CREATE'
      )) AS "independienteVerificado",
      COALESCE((SELECT SUM(c."montoRevertido") FROM "CorreccionAbono" c WHERE c."abonoId" = a.id), 0) AS reversion,
      g.id AS "pagoId", g."pedidoId" AS "pagoPedidoId", g.metodo::text AS "pagoMetodo",
      g.monto AS "pagoMonto", g."createdAt" AS "pagoFecha", g."regularizacionId"
    FROM "Abono" a
    JOIN "Factura" f ON f.id = a."facturaId"
    JOIN "Pedido" p ON p.id = COALESCE(a."pedidoId", f."pedidoId")
    LEFT JOIN "Pago" g ON g.id = a."pagoOrigenId"
    WHERE ((a.fecha >= ${desde} AND a.fecha < ${hasta})
      OR (${incluirEspejosDePagos} AND g."createdAt" >= ${desde} AND g."createdAt" < ${hasta}))
      AND p."estadoEntrega" NOT IN ('ANULADO', 'CANCELADO')
    ORDER BY a.id`)
}

export function clasificarCobroCartera(
  a: CobroCartera,
): 'INDEPENDIENTE' | 'ESPEJO' | 'PENDIENTE' {
  const independiente =
    a.origenCobro === 'INDEPENDIENTE' ||
    (a.origenCobro === null &&
      a.pagoOrigenId === null &&
      a.independienteVerificado)
  if (independiente && a.pagoOrigenId === null) return 'INDEPENDIENTE'
  const espejo =
    a.origenCobro === 'ESPEJO_PAGO' &&
    a.pagoId !== null &&
    a.pedidoId === a.pagoPedidoId &&
    a.metodoPago === a.pagoMetodo &&
    Number(a.monto) === Number(a.pagoMonto)
  return espejo ? 'ESPEJO' : 'PENDIENTE'
}

export async function resumirAbonosDelDia(
  tx: TxCobroCartera,
  desde: Date,
  hasta: Date,
) {
  const cobros = await leerAbonosDelPeriodo(tx, desde, hasta)
  let independientes = 0
  let reversiones = 0
  const pendientes: Array<{ id: string; referencia: string; importe: number }> =
    []
  for (const a of cobros) {
    const clase = clasificarCobroCartera(a)
    if (clase === 'INDEPENDIENTE') {
      independientes += Math.round(Number(a.monto) * 100)
      reversiones += Math.round(Number(a.reversion) * 100)
      continue
    }
    if (clase !== 'ESPEJO') {
      pendientes.push({
        id: a.id,
        referencia: a.numero,
        importe: Number(a.monto),
      })
      continue
    }
    // El Pago bruto ya está en cobroVentasHoy; su reversión solo resta cuando
    // ese Pago forma parte de la caja de esta fecha (ADR monetario).
    if (
      a.regularizacionId === null &&
      a.pagoFecha &&
      a.pagoFecha >= desde &&
      a.pagoFecha < hasta
    ) {
      reversiones += Math.round(Number(a.reversion) * 100)
    }
  }
  if (pendientes.length) throw new CobrosSinConciliarError(pendientes)
  return {
    abonosIndependientes: independientes / 100,
    ajustesDeCobros: reversiones / 100,
    total: (independientes - reversiones) / 100,
  }
}

export async function sumaAbonosDelDiaSinEspejo(
  tx: TxCobroCartera,
  desde: Date,
  hasta: Date,
): Promise<number> {
  return (await resumirAbonosDelDia(tx, desde, hasta)).total
}
