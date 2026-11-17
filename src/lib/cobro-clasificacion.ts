// #796 — Clasificación de un cobro: ¿es cobro de la venta del día o recuperación de cartera?
// Funciones puras, sin acceso a datos. Cada cobro se imputa por antigüedad (FIFO, el mismo orden que
// `pagar-fiado`) a las porciones entregadas del pedido. Lo que cubre una entrega del mismo día del cobro es
// venta del día; lo que cubre una entrega de un día anterior es cartera. La fecha de CREACIÓN del pedido solo
// se usa cuando no existe ninguna fecha de entrega, y entonces se marca «aproximado» (nunca se finge precisión).
// El día es el calendario de America/Bogotá (decisión del PO, 17-nov-2026).

const aCentavos = (v: unknown): number => Math.round(Number(v ?? 0) * 100)

export const diaBogota = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export interface PorcionEntregada {
  /** Instante de la entrega (UTC). */
  entregadoAt: Date
  valor: unknown
}

export interface CobroDePedido {
  id: string
  /** Instante de captura del cobro (el mismo que usa la caja del día). */
  at: Date
  monto: unknown
}

export interface PedidoParaClasificar {
  /** Fecha de creación del pedido. */
  fecha: Date
  estadoEntrega: string
  total: unknown
  /** Fecha de la entrega registrada en el pedido, si existe. */
  entregadoAt: Date | null
  /** Hechos de entrega (EntregaExigible); vacío si no hay o la capacidad está apagada. */
  porciones: readonly PorcionEntregada[]
}

export type OrigenFechaEntrega = 'PORCIONES' | 'PEDIDO' | 'CREACION'

export interface ClasificacionCobro {
  /** Centavos del cobro que pertenecen a la venta de la jornada del cobro. */
  ventaDiaCentavos: number
  /** Centavos que recuperan una entrega de una jornada anterior. */
  carteraCentavos: number
  origenFecha: OrigenFechaEntrega
  /** Verdadero si el pedido figura entregado pero no hay fecha de entrega: se usó la de creación. */
  aproximado: boolean
}

export type TipoCobro = 'COBRO_DEL_DIA' | 'CARTERA' | 'MIXTO'

export function tipoDeCobro(c: Pick<ClasificacionCobro, 'ventaDiaCentavos' | 'carteraCentavos'>): TipoCobro {
  if (c.carteraCentavos === 0) return 'COBRO_DEL_DIA'
  if (c.ventaDiaCentavos === 0) return 'CARTERA'
  return 'MIXTO'
}

interface Entrega { dia: string; restante: number }

function entregasDelPedido(p: PedidoParaClasificar): { entregas: Entrega[]; origen: OrigenFechaEntrega } {
  const porciones = p.porciones
    .map((x) => ({ at: x.entregadoAt, valor: aCentavos(x.valor) }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  if (porciones.length > 0) {
    return { entregas: porciones.map((x) => ({ dia: diaBogota(x.at), restante: x.valor })), origen: 'PORCIONES' }
  }
  if (p.entregadoAt) {
    return { entregas: [{ dia: diaBogota(p.entregadoAt), restante: aCentavos(p.total) }], origen: 'PEDIDO' }
  }
  return { entregas: [{ dia: diaBogota(p.fecha), restante: aCentavos(p.total) }], origen: 'CREACION' }
}

/**
 * Clasifica todos los cobros de UN pedido. Los cobros se procesan en orden cronológico y cada uno consume
 * primero las entregas más antiguas que ya habían ocurrido (misma jornada o anterior) al día del cobro.
 * Lo que no cubre ninguna entrega (anticipo, sobrante) se queda como cobro de la jornada, igual que hoy.
 */
export function clasificarCobrosDePedido(
  pedido: PedidoParaClasificar,
  cobros: readonly CobroDePedido[],
): Map<string, ClasificacionCobro> {
  const { entregas, origen } = entregasDelPedido(pedido)
  const aproximado = origen === 'CREACION' && pedido.estadoEntrega === 'ENTREGADO'
  const resultado = new Map<string, ClasificacionCobro>()
  const ordenados = [...cobros].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : 1))
  for (const cobro of ordenados) {
    const diaCobro = diaBogota(cobro.at)
    let porAplicar = aCentavos(cobro.monto)
    let ventaDia = 0
    let cartera = 0
    for (const e of entregas) {
      if (porAplicar <= 0) break
      if (e.dia > diaCobro || e.restante <= 0) continue
      const usado = Math.min(porAplicar, e.restante)
      e.restante -= usado
      porAplicar -= usado
      if (e.dia === diaCobro) ventaDia += usado
      else cartera += usado
    }
    // Sin entrega que lo cubra: anticipo o sobrante. Solo si NO hay ninguna fecha real se conserva la
    // regla anterior (día de creación) para no mover cobros de pedidos todavía sin entregar.
    if (porAplicar > 0) {
      if (origen === 'CREACION' && diaBogota(pedido.fecha) !== diaCobro) cartera += porAplicar
      else ventaDia += porAplicar
    }
    resultado.set(cobro.id, { ventaDiaCentavos: ventaDia, carteraCentavos: cartera, origenFecha: origen, aproximado })
  }
  return resultado
}
