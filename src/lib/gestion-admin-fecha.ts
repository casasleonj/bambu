// TEMPORAL-SIN-EMBARQUE(#472): reglas de fecha de un hecho (entrega o cobro) que
// el administrador registra desde la oficina. Las comparten la entrega de oficina
// y el cobro de fiados para que "hasta cuándo se puede registrar" sea una sola regla.
import type { Prisma } from '@prisma/client'
import { endOfDayBogota, startOfDayBogota, todayStringBogota } from './dates'
import {
  EntregaOficinaError,
  DIAS_MAX_ATRAS_ENTREGA_OFICINA,
} from '@/modules/pedidos/domain/services/entrega-oficina.errors'

export type HechoOficina = 'entrega' | 'cobro'

/** Día calendario de Bogotá (YYYY-MM-DD) de un instante. */
export const diaBogota = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

const TEXTO: Record<HechoOficina, { futura: string; antigua: string }> = {
  entrega: {
    futura: 'La fecha de entrega no puede ser futura.',
    antigua: `Solo se puede registrar una entrega de hasta ${DIAS_MAX_ATRAS_ENTREGA_OFICINA} días atrás.`,
  },
  cobro: {
    futura: 'La fecha en que se recibió el dinero no puede ser futura.',
    antigua: `Solo se puede registrar un cobro de hasta ${DIAS_MAX_ATRAS_ENTREGA_OFICINA} días atrás.`,
  },
}

/**
 * Valida la fecha del hecho: no futura, no más de 7 días atrás y no en un día
 * anterior ya cerrado. El día de hoy se admite aunque tenga cierre (un hecho real
 * que llega tarde no se bloquea; queda auditado). Lanza `EntregaOficinaError`.
 */
export async function validarFechaHechoOficina(
  tx: Pick<Prisma.TransactionClient, 'cierreDia'>,
  fecha: Date,
  hecho: HechoOficina,
): Promise<void> {
  const ahora = Date.now()
  const instante = fecha.getTime()
  if (instante > ahora + 5 * 60_000) {
    throw new EntregaOficinaError('FECHA_FUTURA', TEXTO[hecho].futura)
  }
  if (instante < ahora - DIAS_MAX_ATRAS_ENTREGA_OFICINA * 24 * 3_600_000) {
    throw new EntregaOficinaError('FECHA_MUY_ANTIGUA', TEXTO[hecho].antigua)
  }
  const dia = diaBogota(fecha)
  if (dia < todayStringBogota()) {
    const cierre = await tx.cierreDia.findFirst({
      where: { fecha: { gte: startOfDayBogota(dia), lte: endOfDayBogota(dia) } },
      select: { id: true },
    })
    if (cierre) {
      throw new EntregaOficinaError('DIA_CERRADO', 'Ese día ya está cerrado. Elige un día que siga abierto.')
    }
  }
}
