// #796 — Clasificación de un cobro: ¿es cobro de la venta del día o recuperación de cartera?
// Funciones puras, sin acceso a datos. NO tiene motor FIFO propio: cada cobro se asigna con `asignarPagoFIFO`
// (src/lib/entregas-exigibles.ts, #656): entregas más antiguas primero, desempate por id. Aquí solo se añade la
// restricción temporal: un cobro solo cubre entregas ocurridas hasta su propia jornada (lo anterior a la entrega es
// anticipo, no cartera). Lo que cubre una entrega del mismo día del cobro es venta del día; lo que cubre una entrega
// de un día anterior es cartera. La fecha de CREACIÓN del pedido solo se usa si no existe ninguna fecha de
// entrega, y entonces se marca «aproximado» (nunca se finge precisión).
// El día es el calendario de America/Bogotá (decisión del PO, 17-nov-2026).

import { asignarPagoFIFO, type EntregaExigibleCalc } from '@/lib/entregas-exigibles'

const aCentavos = (v: unknown): number => Math.round(Number(v ?? 0) * 100)

export const diaBogota = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export interface PorcionEntregada {
  /** Id de la entrega (desempate determinista del FIFO). */
  id: string
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
  /** Cierres efectivos verificados, por jornada de Bogotá (#796). */
  cierresPorDia?: ReadonlyMap<string, Date>
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

interface Entrega extends EntregaExigibleCalc { dia: string }

function entregasDelPedido(p: PedidoParaClasificar): { entregas: Entrega[]; origen: OrigenFechaEntrega } {
  const porciones = p.porciones.filter((x) => aCentavos(x.valor) > 0)
  if (porciones.length > 0) {
    return {
      entregas: porciones.map((x) => ({ id: x.id, entregadoAt: x.entregadoAt, valorEntregado: aCentavos(x.valor) / 100, asignado: 0, dia: diaBogota(x.entregadoAt) })),
      origen: 'PORCIONES',
    }
  }
  const total = aCentavos(p.total) / 100
  if (p.entregadoAt) {
    return { entregas: [{ id: 'pedido:entregado', entregadoAt: p.entregadoAt, valorEntregado: total, asignado: 0, dia: diaBogota(p.entregadoAt) }], origen: 'PEDIDO' }
  }
  return { entregas: [{ id: 'pedido:creacion', entregadoAt: p.fecha, valorEntregado: total, asignado: 0, dia: diaBogota(p.fecha) }], origen: 'CREACION' }
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
  // Anticipo (sobrante de un cobro anterior a la entrega): queda como crédito del pedido y cubre las entregas más
  // antiguas cuando ya ocurrieron, con el mismo FIFO. No cambia cómo se clasificó el dinero al recibirlo (fue de su jornada).
  let credito = 0
  const aplicar = (elegibles: Entrega[], monto: number): { aplicado: Map<string, number>; sobrante: number } => {
    const { deltas, sobrante } = asignarPagoFIFO(elegibles, monto)
    const aplicado = new Map<string, number>()
    for (const e of elegibles) {
      const c = aCentavos(deltas.get(e.id) ?? 0)
      if (c <= 0) continue
      e.asignado = (aCentavos(e.asignado) + c) / 100
      aplicado.set(e.id, c)
    }
    return { aplicado, sobrante: aCentavos(sobrante) }
  }
  for (const cobro of ordenados) {
    const diaCobro = diaBogota(cobro.at)
    let ventaDia = 0
    let cartera = 0
    // Restricción temporal: solo entregas ocurridas hasta el instante del cobro (salvo legado aproximado). El FIFO (antigüedad, id) es el existente.
    const elegibles = entregas.filter((e) => origen === 'CREACION' ? e.dia <= diaCobro : e.entregadoAt <= cobro.at)
    if (credito > 0) credito = aplicar(elegibles, credito / 100).sobrante
    const { aplicado, sobrante } = aplicar(elegibles, Number(cobro.monto ?? 0))
    for (const e of elegibles) {
      const c = aplicado.get(e.id) ?? 0
      const cierre = pedido.cierresPorDia?.get(e.dia)
      const consolidado = origen !== 'CREACION' && cierre !== undefined && Number.isFinite(cierre.getTime()) &&
        diaBogota(cierre) === e.dia && cierre >= e.entregadoAt && cobro.at >= cierre
      if (e.dia === diaCobro && !consolidado) ventaDia += c
      else cartera += c
    }
    // Sin entrega que lo cubra: anticipo o sobrante. Solo si NO hay ninguna fecha real se conserva la
    // regla anterior (día de creación) para no mover cobros de pedidos todavía sin entregar.
    if (sobrante > 0) {
      if (origen === 'CREACION' && diaBogota(pedido.fecha) !== diaCobro) cartera += sobrante
      else {
        ventaDia += sobrante
        credito += sobrante
      }
    }
    resultado.set(cobro.id, { ventaDiaCentavos: ventaDia, carteraCentavos: cartera, origenFecha: origen, aproximado })
  }
  return resultado
}

/**
 * Reparte un importe (por ejemplo el neto de un abono tras correcciones) en la misma proporción que su cobro:
 * parte de la jornada y parte de cartera. Centavos exactos; el resto de redondeo va a cartera para que sumen igual.
 */
export function repartirImporte(
  centavos: number,
  c: Pick<ClasificacionCobro, 'ventaDiaCentavos' | 'carteraCentavos'>,
): { ventaDiaCentavos: number; carteraCentavos: number } {
  const base = c.ventaDiaCentavos + c.carteraCentavos
  if (base <= 0) return { ventaDiaCentavos: 0, carteraCentavos: centavos }
  const dia = Math.round((centavos * c.ventaDiaCentavos) / base)
  return { ventaDiaCentavos: dia, carteraCentavos: centavos - dia }
}
