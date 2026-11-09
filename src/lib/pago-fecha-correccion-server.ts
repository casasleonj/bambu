// #617 — Corrección administrativa auditada de la fecha efectiva de un pago (servidor).
// Solo ADMIN; motivo obligatorio; sin tocar `Pago.createdAt`; un día cerrado se rectifica por regularización formal (#402).

import type { Prisma } from '@prisma/client'
import { withAdvisoryLock } from '@/lib/locks'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'
import { dayInBogota, endOfDayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { CorreccionFechaPagoError, puedeCorregirFechaPago, resolverCorreccionFecha } from '@/lib/pago-fecha-correccion'

export interface CorregirFechaPagoInput {
  pagoId: string
  /** Día en que realmente se cobró (YYYY-MM-DD, Bogotá). */
  fecha: string
  motivo: string
  actorId: string
  actorRol: string
  offlineId?: string
}

export interface CorreccionFechaResultado {
  id: string
  pagoId: string
  fechaAnterior: string
  fechaNueva: string
  deduped: boolean
}

type Tx = Prisma.TransactionClient

/** Un día PASADO con cierre ya no se edita aquí. (Hoy se admite: un hecho real que llega tarde no se bloquea.) */
async function exigirDiaAbierto(tx: Pick<Tx, 'cierreDia'>, dia: string): Promise<void> {
  if (dia >= todayInBogota()) return
  const cierre = await tx.cierreDia.findFirst({
    where: { fecha: { gte: startOfDayInBogota(dia), lte: endOfDayInBogota(dia) } },
    select: { id: true },
  })
  if (cierre) {
    throw new CorreccionFechaPagoError(
      'DIA_CERRADO',
      `El ${dia} ya está cerrado. Para corregir la fecha de un día cerrado hace falta una regularización formal (#402), con quién la autoriza y la evidencia.`,
    )
  }
}

export async function corregirFechaPago(input: CorregirFechaPagoInput): Promise<CorreccionFechaResultado> {
  if (!puedeCorregirFechaPago(input.actorRol)) {
    throw new CorreccionFechaPagoError('FORBIDDEN', 'Solo un administrador puede corregir la fecha de un cobro.')
  }
  const motivo = input.motivo.trim()
  if (motivo.length < 3) throw new CorreccionFechaPagoError('MOTIVO_REQUERIDO', 'Indica por qué se corrige la fecha.')

  // El lock es por pedido (igual que cobros y correcciones de precio): primero se sabe de qué pedido es el pago.
  const previo = await prisma.pago.findUnique({ where: { id: input.pagoId }, select: { pedidoId: true } })
  if (!previo) throw new CorreccionFechaPagoError('PAGO_NOT_FOUND', 'No se encontró ese pago.')

  const r = await withAdvisoryLock('PEDIDO', previo.pedidoId, async (tx): Promise<CorreccionFechaResultado> => {
    if (input.offlineId) {
      const repetida = await tx.pagoFechaCorreccion.findUnique({ where: { offlineId: input.offlineId } })
      if (repetida) {
        return {
          id: repetida.id,
          pagoId: repetida.pagoId,
          fechaAnterior: repetida.fechaAnterior.toISOString(),
          fechaNueva: repetida.fechaNueva.toISOString(),
          deduped: true,
        }
      }
    }
    const pago = await tx.pago.findUnique({
      where: { id: input.pagoId },
      select: { id: true, pedidoId: true, createdAt: true, ocurridoAt: true, regularizacionId: true, monto: true, metodo: true },
    })
    if (!pago) throw new CorreccionFechaPagoError('PAGO_NOT_FOUND', 'No se encontró ese pago.')
    if (pago.regularizacionId) {
      throw new CorreccionFechaPagoError(
        'PAGO_REGULARIZADO',
        'Este pago viene de una regularización formal y no se edita desde aquí.',
      )
    }
    const res = resolverCorreccionFecha({ createdAt: pago.createdAt, ocurridoAt: pago.ocurridoAt }, input.fecha)
    // Días cerrados: tanto la fecha que se corrige como la nueva (A: solo por regularización formal).
    await exigirDiaAbierto(tx, res.diaAnterior)
    await exigirDiaAbierto(tx, res.diaNuevo)

    await tx.pago.update({ where: { id: pago.id }, data: { ocurridoAt: res.ocurridoAt } })
    const fila = await tx.pagoFechaCorreccion.create({
      data: {
        pagoId: pago.id,
        fechaAnterior: res.fechaAnterior,
        fechaNueva: res.fechaNueva,
        motivo,
        corregidoPorId: input.actorId,
        offlineId: input.offlineId ?? null,
      },
    })
    await logAudit(
      {
        entidad: 'Pago',
        registroId: pago.id,
        accion: 'UPDATE',
        datos: {
          correccionFechaPago: {
            correccionId: fila.id,
            pedidoId: pago.pedidoId,
            monto: Number(pago.monto),
            metodo: pago.metodo,
            fechaAnterior: res.fechaAnterior.toISOString(),
            fechaNueva: res.fechaNueva.toISOString(),
            diaAnterior: res.diaAnterior,
            diaNuevo: res.diaNuevo,
            registradoEl: dayInBogota(pago.createdAt),
            motivo,
          },
        },
        usuarioId: input.actorId,
      },
      tx,
    )
    return {
      id: fila.id,
      pagoId: pago.id,
      fechaAnterior: res.fechaAnterior.toISOString(),
      fechaNueva: res.fechaNueva.toISOString(),
      deduped: false,
    }
  })

  if (!r.deduped) void publishRealtimeEvent('pedido.updated', previo.pedidoId).catch(() => {})
  return r
}
