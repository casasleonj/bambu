import { Prisma, type PrismaClient } from '@prisma/client'
import { dateRangeForDay } from './date-helpers'
import { leerStockArrastreDiagnostico } from './leer-stock-arrastre-diagnostico'
import { resolverStockInicial } from './stock-inicial'
import { compararArrastreBackend } from './comparar-arrastre-backend'

/** Lectura consistente en sombra, sin escrituras ni consumidores operativos. */
export async function leerComparacionArrastreBackend(db: Pick<PrismaClient, '$transaction'>, dia: string) {
  return db.$transaction(async tx => {
    const diagnostico = await leerStockArrastreDiagnostico(tx, dia)
    const hasta = dateRangeForDay(dia).gte
    const actual = await resolverStockInicial(tx, hasta)
    const cierre = diagnostico.fechaAncla ? await tx.cierreDia.findUnique({
      where: { fecha: dateRangeForDay(diagnostico.fechaAncla).gte },
      select: { necesitaValidacion: true },
    }) : null
    const movimientos = diagnostico.fechaAncla && diagnostico.diasIntermedios !== 0
      ? await tx.embarqueMovimiento.findMany({
        where: { createdAt: { gte: dateRangeForDay(diagnostico.fechaAncla).lt, lt: hasta } },
        select: { id: true, producto: true, tipo: true, cantidad: true, origen: true, destino: true,
          _count: { select: { sustitucionRecepcion: true, sustitucionEntrega: true } } },
      }) : []
    return compararArrastreBackend(diagnostico, actual, cierre?.necesitaValidacion ?? null,
      movimientos.map(m => ({ id: m.id, producto: m.producto, tipo: m.tipo, cantidad: m.cantidad,
        origen: m.origen, destino: m.destino,
        sustitucion: m._count.sustitucionRecepcion + m._count.sustitucionEntrega > 0 })))
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
