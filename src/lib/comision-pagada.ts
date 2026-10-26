import type { Prisma } from '@prisma/client'
import { comisionRepartidoresDelDia, type ComisionRepartidorDia, type TxComision } from '@/lib/comision-repartidor'
import { startOfDayBogota } from '@/lib/dates'

/**
 * Pago de la comisión del repartidor desde la caja (#499). La comisión se calcula sola
 * (`comision-repartidor.ts`); el PAGO es un registro deliberado (`PagoComisionRepartidor`).
 * Cada registro es un pago; si la comisión del día sube después, se paga la diferencia.
 *
 * - `fecha` del registro = día (Bogotá) de la comisión → la nómina del período lo descuenta.
 * - `createdAt` del registro = cuándo salió el dinero → el cierre de ESE día de caja lo resta.
 */

export type TxPagoComision = TxComision & Pick<Prisma.TransactionClient, 'pagoComisionRepartidor' | 'produccion'>

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0)

export interface PagoComisionDia {
  id: string
  monto: number
  createdAt: Date
  pagadoPorNombre: string | null
}

export interface ComisionDiaConEstado extends ComisionRepartidorDia {
  pagado: number
  /** Lo que falta por pagar hoy; nunca negativo. */
  pendiente: number
  pagos: PagoComisionDia[]
}

/** Lo pagado de la comisión de `trabajadorId` para el día `fecha` (YYYY-MM-DD de Bogotá). */
export async function pagadoComisionDia(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, trabajadorId: string, fecha: string): Promise<number> {
  const agg = await tx.pagoComisionRepartidor.aggregate({
    where: { trabajadorId, fecha: startOfDayBogota(fecha) },
    _sum: { monto: true },
  })
  return num(agg._sum.monto)
}

/** Comisión de cada repartidor en el día, con lo pagado y lo pendiente. */
export async function comisionDiaConEstado(tx: TxPagoComision, fecha: string): Promise<ComisionDiaConEstado[]> {
  const [filas, pagos] = await Promise.all([
    comisionRepartidoresDelDia(tx, fecha),
    tx.pagoComisionRepartidor.findMany({
      where: { fecha: startOfDayBogota(fecha) },
      orderBy: { createdAt: 'asc' },
      include: { pagadoPor: { select: { nombre: true, username: true } } },
    }),
  ])
  const porTrabajador = new Map<string, PagoComisionDia[]>()
  for (const p of pagos) {
    const lista = porTrabajador.get(p.trabajadorId) ?? []
    lista.push({
      id: p.id,
      monto: num(p.monto),
      createdAt: p.createdAt,
      pagadoPorNombre: p.pagadoPor ? (p.pagadoPor.nombre || p.pagadoPor.username) : null,
    })
    porTrabajador.set(p.trabajadorId, lista)
  }
  // Quien cobró un pago pero ya no aparece como repartidor activo (p. ej. se desactivó) también se muestra.
  const conteo = new Map(filas.map((f) => [f.trabajadorId, f]))
  const resultado: ComisionDiaConEstado[] = filas.map((f) => {
    const lista = porTrabajador.get(f.trabajadorId) ?? []
    const pagado = lista.reduce((s, p) => s + p.monto, 0)
    return { ...f, pagado, pendiente: Math.max(0, f.total - pagado), pagos: lista }
  })
  for (const [trabajadorId, lista] of porTrabajador) {
    if (conteo.has(trabajadorId)) continue
    const t = await tx.trabajador.findUnique({ where: { id: trabajadorId }, select: { nombre: true } })
    resultado.push({
      trabajadorId,
      nombre: t?.nombre ?? 'Trabajador',
      entregasAgua: 0, entregasHielo: 0, entregasBotellon: 0,
      comAgua: 0, comHielo: 0, comBotellon: 0, total: 0,
      porOrigen: { embarque: 0, sinEmbarque: 0 },
      pagado: lista.reduce((s, p) => s + p.monto, 0),
      pendiente: 0,
      pagos: lista,
    })
  }
  return resultado
}

/** Comisión de repartidores que salió de la caja entre `desde` (incluido) y `hasta` (excluido), por fecha de pago. */
export async function comisionPagadaEnCaja(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, desde: Date, hasta: Date): Promise<number> {
  const agg = await tx.pagoComisionRepartidor.aggregate({
    where: { createdAt: { gte: desde, lt: hasta } },
    _sum: { monto: true },
  })
  return num(agg._sum.monto)
}

/** Lo pagado de la comisión de un trabajador para días dentro de `[ini, fin]` (lo descuenta la nómina del período). */
export async function comisionPagadaEnPeriodo(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, trabajadorId: string, ini: Date, fin: Date): Promise<number> {
  const agg = await tx.pagoComisionRepartidor.aggregate({
    where: { trabajadorId, fecha: { gte: ini, lte: fin } },
    _sum: { monto: true },
  })
  return num(agg._sum.monto)
}

/** Comisión de sellador del día (Producción): sigue saliendo de la caja como antes, pero ya sin tecleo. */
export async function comisionSelladorDia(tx: Pick<Prisma.TransactionClient, 'produccion'>, desde: Date, hasta: Date): Promise<number> {
  const producciones = await tx.produccion.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    select: { comSellTotal: true },
  })
  return producciones.reduce((s, p) => s + num(p.comSellTotal), 0)
}

export interface ComisionesDelCierre {
  repartidores: ComisionDiaConEstado[]
  /** Comisión de sellador del día (Producción). */
  sellador: number
  /** Lo que salió de la caja este día por comisión de repartidores. */
  pagadoRepartidores: number
  /** Lo que el cierre resta de la caja: sellador + repartidores pagados. */
  total: number
}

/**
 * Las comisiones que el cierre de caja resta para un día. Las calcula el SERVIDOR
 * (el cliente ya no teclea la cifra): `desde`/`hasta` son los límites del día de caja.
 */
export async function comisionesDelCierre(tx: TxPagoComision, fecha: string, desde: Date, hasta: Date): Promise<ComisionesDelCierre> {
  const [repartidores, sellador, pagadoRepartidores] = await Promise.all([
    comisionDiaConEstado(tx, fecha),
    comisionSelladorDia(tx, desde, hasta),
    comisionPagadaEnCaja(tx, desde, hasta),
  ])
  return { repartidores, sellador, pagadoRepartidores, total: sellador + pagadoRepartidores }
}
