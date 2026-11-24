import { corteFinDelDiaBogota } from './fiado-al-corte'
import { diaBogota } from './cobro-clasificacion'

/**
 * #796: fecha efectiva de consolidación de una entrega.
 * El cierre solo cuenta cuando corresponde a la jornada de esa entrega y
 * ocurrió después de entregarla. Un cierre de otra jornada nunca la consolida.
 * Sin cierre, la deuda se consolida a las 00:00 de Bogotá del día siguiente.
 * Función pura: no consulta reloj, caja ni base de datos.
 */
export function corteDeEntrega(
  entregadoAt: Date,
  cierreDeJornadaAt: Date | null,
): Date {
  const medianoche = corteFinDelDiaBogota(diaBogota(entregadoAt))
  if (cierreDeJornadaAt === null) return medianoche
  const cierre = cierreDeJornadaAt.getTime()
  const entrega = entregadoAt.getTime()
  // Un cierre anterior a la entrega no puede convertir en fiado mercancía aún no entregada.
  if (cierre < entrega || cierre >= medianoche) return medianoche
  return cierreDeJornadaAt
}

export interface PorcionDeudaAlCorte {
  entregadoAt: Date
  /** Saldo vigente asignado a esta entrega mediante FIFO, en centavos enteros. */
  saldoCentavos: number
  /** Cierre verificable de la jornada de la entrega, o null si no existe. */
  cierreDeJornadaAt: Date | null
}

export interface DesgloseDeudaAlCorte {
  fiadoCentavos: number
  pendienteOperativoCentavos: number
  exigibleCentavos: number
}

/**
 * Solo clasifica saldos YA calculados y asignados por el motor de exigibles/FIFO.
 * No reemplaza leerExigibles ni recalcula pagos, anticipos o anulaciones.
 */
export function desglosarDeudaAlCorte(
  porciones: readonly PorcionDeudaAlCorte[],
  ahora: Date,
): DesgloseDeudaAlCorte {
  let fiadoCentavos = 0
  let pendienteOperativoCentavos = 0
  for (const porcion of porciones) {
    if (!Number.isSafeInteger(porcion.saldoCentavos) || porcion.saldoCentavos < 0)
      throw new Error('SALDO_PORCION_INVALIDO')
    if (porcion.entregadoAt.getTime() > ahora.getTime())
      throw new Error('ENTREGA_FUTURA_NO_EXIGIBLE')
    if (ahora.getTime() >= corteDeEntrega(porcion.entregadoAt, porcion.cierreDeJornadaAt).getTime())
      fiadoCentavos += porcion.saldoCentavos
    else pendienteOperativoCentavos += porcion.saldoCentavos
  }
  return { fiadoCentavos, pendienteOperativoCentavos,
    exigibleCentavos: fiadoCentavos + pendienteOperativoCentavos }
}
