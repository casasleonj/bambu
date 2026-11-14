import { calcularPorFuentes, tarifasRepartidor } from './comision-repartidor-calculo'
import type { Prisma } from '@prisma/client'
import { comisionRepartidoresDelDia, type ComisionRepartidorDia, type TxComision } from '@/lib/comision-repartidor'
import { startOfDayBogota } from '@/lib/dates'
import { dayInBogota } from '@/lib/date-helpers'

/**
 * Pago de la comisión del repartidor desde la caja (#499). La comisión se calcula sola
 * (`comision-repartidor.ts`); el PAGO es un registro deliberado (`PagoComisionRepartidor`).
 * Cada registro es un pago; si la comisión del día sube después, se paga la diferencia.
 *
 * - `fecha` del registro = día (Bogotá) de la comisión → la nómina del período lo descuenta.
 * - `fechaPagoReal` = día comprobado del desembolso → caja. `createdAt` conserva la captura.
 * - Legado NULL: se conserva explícitamente el criterio anterior por captura, sin inventar una fecha física.
 */

export type TxPagoComision = TxComision & Pick<Prisma.TransactionClient, 'pagoComisionRepartidor' | 'produccion'>

const num = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0)

export interface PagoComisionDia {
  id: string
  monto: number
  createdAt: Date
  pagadoPorNombre: string | null
  fechaPagoReal?: Date | null
  metodo?: string
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
      // #645: aquí solo los pagos por entregas; los del sellador (PRODUCCION) van en su propio bloque.
      where: { fecha: startOfDayBogota(fecha), concepto: 'REPARTO' },
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
      fechaPagoReal: p.fechaPagoReal,
      metodo: p.metodo,
      pagadoPorNombre: p.pagadoPor ? (p.pagadoPor.nombre || p.pagadoPor.username) : null,
    })
    porTrabajador.set(p.trabajadorId, lista)
  }
  // Quien cobró un pago pero ya no aparece como repartidor activo (p. ej. se desactivó) también se muestra.
  const conteo = new Map(filas.map((f) => [f.trabajadorId, f]))
  const resultado: ComisionDiaConEstado[] = filas.map((f) => {
    const lista = porTrabajador.get(f.trabajadorId) ?? []
    const pagado = lista.reduce((s, p) => s + Math.round(p.monto * 100), 0) / 100
    return { ...f, pagado, pendiente: Math.max(0, Math.round((f.total - pagado) * 100) / 100), pagos: lista }
  })
  for (const [trabajadorId, lista] of porTrabajador) {
    if (conteo.has(trabajadorId)) continue
    const t = await tx.trabajador.findUnique({ where: { id: trabajadorId }, select: { nombre: true } })
    resultado.push({
      trabajadorId,
      nombre: t?.nombre ?? 'Trabajador',
      ...calcularPorFuentes([], tarifasRepartidor({ comRepartAgua: null, comRepartHielo: null, comRepartBotellon: null })),
      pagado: lista.reduce((s, p) => s + Math.round(p.monto * 100), 0) / 100,
      pendiente: 0,
      pagos: lista,
    })
  }
  return resultado
}

/**
 * Comisión de repartidores que salió de la caja entre `desde` (incluido) y `hasta` (excluido), por fecha
 * de pago. #305: solo cuenta lo pagado en EFECTIVO; lo pagado por transferencia, Nequi o Daviplata no
 * salió de la caja.
 */
export function whereFechaPagoComision(desde: Date, hasta: Date): Prisma.PagoComisionRepartidorWhereInput {
  return { OR: [
    { fechaPagoReal: { gte: desde, lt: hasta } },
    { fechaPagoReal: null, createdAt: { gte: desde, lt: hasta } },
  ] }
}

export interface PagoComisionCaja {
  id: string
  trabajadorId: string
  nombre: string
  monto: number
  metodo: string
  fechaTrabajo: string
  fechaPagoReal: string | null
  registradoAt: string
}

/** Una sola lectura atribuida por día para suma, detalle y advertencia de legado. No modifica pagos. */
export async function leerPagosComisionCaja(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, desde: Date, hasta: Date) {
  const filas = await tx.pagoComisionRepartidor.findMany({
    where: whereFechaPagoComision(desde, hasta), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { trabajador: { select: { nombre: true } } },
  })
  const pagos: PagoComisionCaja[] = filas.map(p => ({
    id: p.id, trabajadorId: p.trabajadorId, nombre: p.trabajador.nombre, monto: num(p.monto), metodo: p.metodo,
    fechaTrabajo: dayInBogota(p.fecha), fechaPagoReal: p.fechaPagoReal ? dayInBogota(p.fechaPagoReal) : null,
    registradoAt: p.createdAt.toISOString(),
  }))
  const suma = (efectivo: boolean) => pagos.reduce((s, p) => s + ((p.metodo === 'EFECTIVO') === efectivo ? Math.round(p.monto * 100) : 0), 0) / 100
  return { pagos, efectivo: suma(true), otrosMedios: suma(false), sinFechaVerificada: pagos.filter(p => p.fechaPagoReal === null).length }
}

export async function comisionPagadaEnCaja(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, desde: Date, hasta: Date): Promise<number> {
  return (await leerPagosComisionCaja(tx, desde, hasta)).efectivo
}

/** #305: comisión de repartidores pagada ese día por un medio distinto del efectivo (informativo; no resta de la caja). */
export async function comisionPagadaOtrosMedios(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, desde: Date, hasta: Date): Promise<number> {
  return (await leerPagosComisionCaja(tx, desde, hasta)).otrosMedios
}

/** Lo pagado de la comisión de un trabajador para días dentro de `[ini, fin]` (lo descuenta la nómina del período). */
export async function comisionPagadaEnPeriodo(tx: Pick<Prisma.TransactionClient, 'pagoComisionRepartidor'>, trabajadorId: string, ini: Date, fin: Date): Promise<number> {
  const agg = await tx.pagoComisionRepartidor.aggregate({
    where: { trabajadorId, fecha: { gte: ini, lte: fin } },
    _sum: { monto: true },
  })
  return num(agg._sum.monto)
}

/** Comisión de sellador del día (Producción), solo informativa: ya NO sale sola de la caja (#645), se paga con «Pagar». */
export async function comisionSelladorDia(tx: Pick<Prisma.TransactionClient, 'produccion'>, desde: Date, hasta: Date): Promise<number> {
  const producciones = await tx.produccion.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    select: { comSellTotal: true },
  })
  return producciones.reduce((s, p) => s + num(p.comSellTotal), 0)
}

export interface ComisionSelladorDia {
  trabajadorId: string
  nombre: string
  total: number
  pagado: number
  /** Lo que falta por pagar hoy; nunca negativo. */
  pendiente: number
  /** Desglose por producto: unidades producidas y comisión. */
  detalle: { producto: string; unidades: number; comision: number }[]
}

/**
 * #645: comisión de cada sellador con Producción en el día, con lo pagado y lo pendiente. Se paga como la del
 * repartidor (`PagoComisionRepartidor`): solo lo pagado en EFECTIVO baja la caja del cierre y la nómina lo descuenta.
 */
export async function comisionSelladoresDia(
  tx: Pick<Prisma.TransactionClient, 'produccion' | 'pagoComisionRepartidor'>,
  fecha: string, desde: Date, hasta: Date,
): Promise<ComisionSelladorDia[]> {
  const producciones = await tx.produccion.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    select: { trabajadorId: true, comSellTotal: true, trabajador: { select: { nombre: true } }, items: { select: { producto: true, producido: true, comSellador: true } } },
  })
  if (producciones.length === 0) return []
  const porTrabajador = new Map<string, ComisionSelladorDia>()
  for (const pr of producciones) {
    const fila = porTrabajador.get(pr.trabajadorId) ?? { trabajadorId: pr.trabajadorId, nombre: pr.trabajador.nombre, total: 0, pagado: 0, pendiente: 0, detalle: [] }
    fila.total += num(pr.comSellTotal)
    for (const it of pr.items) {
      const d = fila.detalle.find((x) => x.producto === it.producto)
      if (d) { d.unidades += it.producido; d.comision += num(it.comSellador) } else fila.detalle.push({ producto: it.producto, unidades: it.producido, comision: num(it.comSellador) })
    }
    porTrabajador.set(pr.trabajadorId, fila)
  }
  const pagos = await tx.pagoComisionRepartidor.groupBy({
    by: ['trabajadorId'],
    where: { trabajadorId: { in: [...porTrabajador.keys()] }, fecha: startOfDayBogota(fecha), concepto: 'PRODUCCION' },
    _sum: { monto: true },
  })
  const pagadoPor = new Map(pagos.map((g) => [g.trabajadorId, num(g._sum.monto)]))
  return [...porTrabajador.values()].map((f) => {
    const pagado = pagadoPor.get(f.trabajadorId) ?? 0
    return { ...f, pagado, pendiente: Math.max(0, Math.round((f.total - pagado) * 100) / 100) }
  })
}

export interface ComisionesDelCierre {
  pagosCaja: PagoComisionCaja[]
  pagosSinFechaVerificada: number
  repartidores: ComisionDiaConEstado[]
  /** Comisión de sellador del día (Producción), informativa: no resta de la caja hasta que se paga (#645). */
  sellador: number
  /** #645: comisión de cada sellador del día con lo pagado y lo pendiente. */
  selladores: ComisionSelladorDia[]
  /** Lo que salió de la caja este día por comisión de repartidores (solo efectivo). */
  pagadoRepartidores: number
  /** #305: pagado ese día por otros medios (transferencia, Nequi, Daviplata); no resta de la caja. */
  pagadoRepartidoresOtrosMedios: number
  /** Lo que el cierre resta de la caja: lo pagado en EFECTIVO por comisiones (repartidores y selladores). */
  total: number
}

/**
 * Las comisiones que el cierre de caja resta para un día. Las calcula el SERVIDOR
 * (el cliente ya no teclea la cifra): `desde`/`hasta` son los límites del día de caja.
 */
export async function comisionesDelCierre(tx: TxPagoComision, fecha: string, desde: Date, hasta: Date): Promise<ComisionesDelCierre> {
  const [repartidores, sellador, selladores, caja] = await Promise.all([
    comisionDiaConEstado(tx, fecha),
    comisionSelladorDia(tx, desde, hasta),
    comisionSelladoresDia(tx, fecha, desde, hasta),
    leerPagosComisionCaja(tx, desde, hasta),
  ])
  // #645: lo único que resta de la caja es lo PAGADO en efectivo (repartidores y selladores); la comisión generada
  // pero no pagada se paga con «Pagar» o por la nómina, nunca se resta sola (antes se contaba dos veces).
  return { repartidores, sellador, selladores, pagadoRepartidores: caja.efectivo, pagadoRepartidoresOtrosMedios: caja.otrosMedios,
    total: caja.efectivo, pagosCaja: caja.pagos, pagosSinFechaVerificada: caja.sinFechaVerificada }
}
