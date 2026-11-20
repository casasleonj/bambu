import type { Prisma } from '@prisma/client'
import { leerFiadoAlCorte } from './fiado-al-corte-db'
import { corteFinDelDiaBogota, type MotivoAproximado } from './fiado-al-corte'
import { leerExigibles } from './entregas-exigibles-db'
import { startOfDayBogota, endOfDayBogota, todayStringBogota } from './dates'
import { logger } from './logger'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'receivableEntry' | 'historial'>

/** Bloque que el Cierre de un día PASADO suma a su respuesta (#796 fase 2). Cierres guardados: solo `pendienteHoy`. */
export interface FiadoAlCorteDelDia {
  estado: 'AL_CORTE' | 'GUARDADO' | 'ERROR'
  /** Día consultado (YYYY-MM-DD, Bogotá). El corte es el fin de ese día. */
  diaCorte: string
  /** Instante del corte (ISO). */
  corteAt?: string
  /** Fiado que quedó al corte, en pesos. No baja porque hoy se cobre. */
  total?: number
  /** Lo que de ese mismo fiado sigue sin cobrar ahora, en pesos (misma definición que `fiado` del Cierre en vivo). */
  pendienteHoy?: number
  /** Pedidos cuyo dato no se pudo ubicar en el tiempo; se dejaron fuera y se declaran. */
  aproximados?: { numero: number; motivos: MotivoAproximado[] }[]
}

const NO_CUENTAN = ['CANCELADO', 'ANULADO'] as const

/**
 * Solo para fechas anteriores a hoy. Nunca lanza: si algo falla devuelve `ESTADO: 'ERROR'` y el Cierre sigue funcionando.
 * `guardado`: el día ya tiene cierre guardado; su cifra no se recalcula (no se reescribe), solo se informa lo pendiente hoy.
 */
export async function resumirFiadoDeDiaPasado(
  db: Db, fechaStr: string, opciones: { guardado: boolean }, hoy: string = todayStringBogota(),
): Promise<FiadoAlCorteDelDia | undefined> {
  if (fechaStr >= hoy) return undefined
  try {
    const rango = { fecha: { gte: startOfDayBogota(fechaStr), lte: endOfDayBogota(fechaStr) } }
    const exigibles = await leerExigibles(db, { ...rango, estadoEntrega: { notIn: [...NO_CUENTAN] } })
    const pendienteHoy = [...exigibles.values()].reduce((s, v) => s + Math.round(v * 100), 0) / 100
    if (opciones.guardado) return { estado: 'GUARDADO', diaCorte: fechaStr, pendienteHoy }

    const corte = corteFinDelDiaBogota(fechaStr)
    const filas = await leerFiadoAlCorte(db, corte, rango)
    const total = filas.reduce((s, f) => s + (f.existia ? f.exigibleCentavos : 0), 0) / 100
    const dudosas = filas.filter(f => f.aproximado)
    const numeros = dudosas.length
      ? new Map((await db.pedido.findMany({ where: { id: { in: dudosas.map(f => f.pedidoId) } }, select: { id: true, numero: true } })).map(p => [p.id, p.numero]))
      : new Map<string, number>()
    return { estado: 'AL_CORTE', diaCorte: fechaStr, corteAt: corte.toISOString(), total, pendienteHoy,
      aproximados: dudosas.map(f => ({ numero: numeros.get(f.pedidoId) ?? 0, motivos: f.motivosAproximado })).sort((a, b) => a.numero - b.numero) }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', fechaStr }, 'Fiado al corte: no se pudo calcular')
    return { estado: 'ERROR', diaCorte: fechaStr }
  }
}
