import { corteFinDelDiaBogota } from './fiado-al-corte'
import { diaBogota } from './cobro-clasificacion'
import { proyectarPagoFIFO } from './entregas-exigibles'

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
  if (cierre < entrega || cierre >= medianoche.getTime() || diaBogota(cierreDeJornadaAt) !== diaBogota(entregadoAt)) return medianoche
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

/** Datos verificables del pedido. No inferir fechas a partir de la creación. */
export interface EntregaParaClasificar {
  id: string
  entregadoAt: Date
  valorEntregado: number
}

export interface PedidoParaDesglose {
  entregas: readonly EntregaParaClasificar[]
  totalPagado: number
  /** Autoridad del saldo exigible actual (leerExigibles). */
  exigible: number
  /** Cierres de la jornada, indexados por YYYY-MM-DD de Bogotá. */
  cierresPorDia: ReadonlyMap<string, Date>
}

/**
 * Adaptador de la clasificación al FIFO existente. Cuando el valor de las entregas
 * no concilia con el exigible vigente (rebajas, cambios de precio, hechos faltantes),
 * NO publica un total aproximado como definitivo: devuelve null.
 */
export function desglosarPedidoConFIFO(
  pedido: PedidoParaDesglose,
  ahora: Date,
): DesgloseDeudaAlCorte | null {
  const cents = (n: number) => Math.round(n * 100)
  if (![pedido.totalPagado, pedido.exigible].every(n => Number.isFinite(n) && n >= 0)) return null
  if (pedido.entregas.some(e => !e.id || !Number.isFinite(e.valorEntregado) || e.valorEntregado < 0 ||
    !Number.isFinite(e.entregadoAt.getTime()) || e.entregadoAt > ahora)) return null
  const ids = new Set(pedido.entregas.map(e => e.id))
  if (ids.size !== pedido.entregas.length) return null
  const proyectadas = proyectarPagoFIFO(pedido.entregas.map(e => ({
    id: e.id, entregadoAt: e.entregadoAt, valorEntregado: e.valorEntregado, asignado: 0,
  })), pedido.totalPagado)
  const saldoFIFO = proyectadas.reduce((s, e) => s + cents(e.valorEntregado) - cents(e.asignado), 0)
  if (saldoFIFO !== cents(pedido.exigible)) return null
  if (pedido.entregas.length === 0 && cents(pedido.exigible) > 0) return null
  return desglosarDeudaAlCorte(proyectadas.map(e => ({
    entregadoAt: e.entregadoAt,
    saldoCentavos: cents(e.valorEntregado) - cents(e.asignado),
    cierreDeJornadaAt: pedido.cierresPorDia.get(diaBogota(e.entregadoAt)) ?? null,
  })), ahora)
}

/**
 * Solo admite la hora del cierre cuando se confirmó que representa el instante
 * EFECTIVO de cierre, no el momento de registrar retroactivamente el documento.
 * El día del cierre debe coincidir con la jornada declarada y no ser futuro.
 */
export function cierreEfectivoVerificado(
  diaJornada: string,
  horaCierre: Date | null,
  registradoAt: Date,
  horaEfectivaConfirmada: boolean,
): Date | null {
  if (!horaEfectivaConfirmada || horaCierre === null) return null
  if (!Number.isFinite(horaCierre.getTime()) || !Number.isFinite(registradoAt.getTime())) return null
  if (diaBogota(horaCierre) !== diaJornada || horaCierre > registradoAt) return null
  return horaCierre
}
