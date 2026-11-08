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

/** Lectura de abonos y correcciones: solo SQL crudo. */
export type TxLecturaCartera = Pick<Prisma.TransactionClient, '$queryRaw'>

/** Resumen del día: además lee los ingresos de saldo a favor (#524). */
export type TxCobroCartera = TxLecturaCartera & Pick<Prisma.TransactionClient, 'ingresoSaldoFavor'>

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
  /** #646: para listar el abono en el cierre (quién y a qué factura). */
  clienteNombre?: string | null
  facturaNumero?: string | null
}

/**
 * #513: un espejo nunca es otro ingreso, aunque el Pago no sea elegible para
 * esta fecha. Para legado, la clave de /abonos o su CREATE auditado prueban
 * procedencia independiente. No inferir identidad por importes o timestamps.
 */
export async function leerAbonosDelPeriodo(
  tx: TxLecturaCartera,
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
      g.monto AS "pagoMonto", g."createdAt" AS "pagoFecha", g."regularizacionId",
      cl.nombre AS "clienteNombre", f.numero AS "facturaNumero"
    FROM "Abono" a
    LEFT JOIN "Cliente" cl ON cl.id = a."clienteId"
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

/** #646: un abono pagado a una factura por aparte (no al recibir el pedido), para listarlo en el cierre. */
export interface AbonoDelDia {
  abonoId: string
  numero: string
  cliente: string
  factura: string | null
  pedidoId: string | null
  pedidoNumero: number | null
  metodo: string
  monto: number
  fecha: string
  /** Lo que se le corrigió o devolvió a este abono (suma de sus correcciones). */
  corregido: number
}

/** #646: una corrección que resta de los cobros del día (tipo y motivo guardados al corregir). */
export interface CorreccionDelDia {
  numero: string
  abonoNumero: string
  tipo: string
  monto: number
  motivo: string
  autorizadoPor: string
  cliente: string
  pedidoId: string | null
  pedidoNumero: number | null
  fecha: string
}

type FilaCorreccion = {
  numero: string; tipo: string; montoRevertido: Prisma.Decimal; motivo: string; createdAt: Date; abonoNumero: string
  pedidoId: string | null; pedidoNumero: number | null; cliente: string | null; autorizadoNombre: string | null; autorizadoUsuario: string | null
}

async function leerCorreccionesDeAbonos(tx: TxLecturaCartera, abonoIds: string[]): Promise<CorreccionDelDia[]> {
  if (abonoIds.length === 0) return []
  const filas = await tx.$queryRaw<FilaCorreccion[]>(Prisma.sql`
    SELECT c.numero, c.tipo, c."montoRevertido", c.motivo, c."createdAt", a.numero AS "abonoNumero",
      p.id AS "pedidoId", p.numero AS "pedidoNumero", cl.nombre AS cliente,
      u.nombre AS "autorizadoNombre", u.username AS "autorizadoUsuario"
    FROM "CorreccionAbono" c
    JOIN "Abono" a ON a.id = c."abonoId"
    JOIN "Factura" f ON f.id = a."facturaId"
    LEFT JOIN "Pedido" p ON p.id = COALESCE(a."pedidoId", f."pedidoId")
    LEFT JOIN "Cliente" cl ON cl.id = a."clienteId"
    LEFT JOIN "User" u ON u.id = c."autorizadoPorId"
    WHERE c."abonoId" IN (${Prisma.join(abonoIds)})
    ORDER BY c."createdAt", c.numero`)
  return filas.map((f) => ({
    numero: f.numero, abonoNumero: f.abonoNumero, tipo: f.tipo, monto: Number(f.montoRevertido), motivo: f.motivo,
    autorizadoPor: (f.autorizadoNombre?.trim() || f.autorizadoUsuario) ?? 'Sin dato',
    cliente: f.cliente ?? 'Sin cliente', pedidoId: f.pedidoId, pedidoNumero: f.pedidoNumero, fecha: f.createdAt.toISOString(),
  }))
}

export async function resumirAbonosDelDia(
  tx: TxCobroCartera,
  desde: Date,
  hasta: Date,
) {
  const cobros = await leerAbonosDelPeriodo(tx, desde, hasta)
  let independientes = 0
  let reversiones = 0
  // #601: la parte en EFECTIVO (lo único que entra o sale de la caja física).
  let independientesEfectivo = 0
  let reversionesEfectivo = 0
  const pendientes: Array<{ id: string; referencia: string; importe: number }> =
    []
  // #646: el detalle explica cuáles son los abonos y las correcciones que suman y restan en el día.
  const abonosDetalle: AbonoDelDia[] = []
  const abonosConCorreccion: string[] = []
  for (const a of cobros) {
    const clase = clasificarCobroCartera(a)
    if (clase === 'INDEPENDIENTE') {
      independientes += Math.round(Number(a.monto) * 100)
      reversiones += Math.round(Number(a.reversion) * 100)
      abonosDetalle.push({
        abonoId: a.id, numero: a.numero, cliente: a.clienteNombre ?? 'Sin cliente', factura: a.facturaNumero ?? null,
        pedidoId: a.pedidoId ?? null, pedidoNumero: a.pedidoNumero ?? null, metodo: a.metodoPago,
        monto: Number(a.monto), fecha: a.fecha.toISOString(), corregido: Number(a.reversion),
      })
      if (Number(a.reversion) > 0) abonosConCorreccion.push(a.id)
      if (a.metodoPago === 'EFECTIVO') {
        independientesEfectivo += Math.round(Number(a.monto) * 100)
        reversionesEfectivo += Math.round(Number(a.reversion) * 100)
      }
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
      if (Number(a.reversion) > 0) abonosConCorreccion.push(a.id)
      if (a.pagoMetodo === 'EFECTIVO') {
        reversionesEfectivo += Math.round(Number(a.reversion) * 100)
      }
    }
  }
  if (pendientes.length) throw new CobrosSinConciliarError(pendientes)
  // #524: el sobrante de un cobro de fiados acreditado a saldo a favor es dinero que entró a la caja
  // de este día pero no tiene pedido ni factura (no es Pago ni Abono). Cuenta como cobro independiente,
  // en su medio; consumir el crédito después no escribe aquí, así que el dinero entra una sola vez.
  const ingresos = await tx.ingresoSaldoFavor.findMany({
    where: { createdAt: { gte: desde, lt: hasta } },
    select: { id: true, metodo: true, monto: true, createdAt: true, cliente: { select: { nombre: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  for (const i of ingresos) {
    const centavos = Math.round(Number(i.monto) * 100)
    independientes += centavos
    if (i.metodo === 'EFECTIVO') independientesEfectivo += centavos
    abonosDetalle.push({
      abonoId: i.id, numero: 'Saldo a favor', cliente: i.cliente.nombre, factura: null,
      pedidoId: null, pedidoNumero: null, metodo: i.metodo, monto: Number(i.monto),
      fecha: i.createdAt.toISOString(), corregido: 0,
    })
  }
  const correcciones = await leerCorreccionesDeAbonos(tx, abonosConCorreccion)
  return {
    detalle: { abonos: abonosDetalle, correcciones },
    abonosIndependientes: independientes / 100,
    ajustesDeCobros: reversiones / 100,
    total: (independientes - reversiones) / 100,
    /** Abonos independientes menos ajustes, solo en efectivo. */
    totalEfectivo: (independientesEfectivo - reversionesEfectivo) / 100,
  }
}

export async function sumaAbonosDelDiaSinEspejo(
  tx: TxCobroCartera,
  desde: Date,
  hasta: Date,
): Promise<number> {
  return (await resumirAbonosDelDia(tx, desde, hasta)).total
}
