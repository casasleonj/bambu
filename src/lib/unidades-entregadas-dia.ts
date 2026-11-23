// #650 (2b): unidades «vendidas» de un día = lo entregado ESE día, no lo que se creó ese día.
// Una sola función alimenta cierre, Producción y dashboard para que las tres cifras coincidan.
// Solo lectura. Regla: por pedido, si los eventos de entrega por día suman exactamente el acumulado de
// cada producto, se reparte por día; si no (pedido viejo sin detalle), todo se atribuye al día de creación
// y el pedido se informa como «aproximado». El dinero NO pasa por aquí.
import type { Prisma } from '@prisma/client'
import { leerEntregasConsulta } from '@/lib/entregas-consulta'

type Db = Pick<Prisma.TransactionClient, 'historial' | 'embarqueMovimiento' | 'pedido'>
export type RangoDia = { desde: Date; hasta: Date }

export interface UnidadesDelDia {
  agua: number
  hielo: number
  botellon: number
  bolsaAgua: number
  bolsaHielo: number
}
export interface PedidoAproximado {
  pedidoId: string
  numero: number | null
  fechaCreacion: Date
  unidades: UnidadesDelDia
}
export interface UnidadesEntregadasDelDia extends UnidadesDelDia {
  aproximados: PedidoAproximado[]
}

const vacio = (): UnidadesDelDia => ({ agua: 0, hielo: 0, botellon: 0, bolsaAgua: 0, bolsaHielo: 0 })
const CLAVE: Record<string, keyof UnidadesDelDia> = {
  PACA_AGUA: 'agua',
  PACA_HIELO: 'hielo',
  BOTELLON: 'botellon',
  BOLSA_AGUA: 'bolsaAgua',
  BOLSA_HIELO: 'bolsaHielo',
}
const diaBogota = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const total = (u: UnidadesDelDia) => u.agua + u.hielo + u.botellon + u.bolsaAgua + u.bolsaHielo

export interface UnidadEntregadaDetalle {
  pedidoId: string
  producto: string
  cantidad: number // unidades físicas
  cantidadPrevia: number // unidades físicas anteriores
  cantidadRegalo?: number // ausente cuando la evidencia no distingue regalos
  cantidadRegaloPrevia: number
}

/** Acumulado físico actual, también para el fallback explícitamente aproximado del cierre. */
export function unidadesFisicasEntregadas(p: {
  cPacaAguaEnt: number; cPacaHieloEnt: number; cBotellonFabEnt: number; cBotellonDomEnt: number
  cBolsaAguaEnt: number; cBolsaHieloEnt: number
  items?: Array<{ producto: string; cantEntrega: number; cantRegaloEntrega?: number }>
}): UnidadesDelDia {
  const acumulado = vacio()
  if (p.items?.length) {
    for (const i of p.items) {
      const k = CLAVE[i.producto]
      if (k) acumulado[k] += i.cantEntrega + (i.cantRegaloEntrega ?? 0)
    }
    return acumulado
  }
  return { agua: p.cPacaAguaEnt, hielo: p.cPacaHieloEnt, botellon: p.cBotellonFabEnt + p.cBotellonDomEnt,
    bolsaAgua: p.cBolsaAguaEnt, bolsaHielo: p.cBolsaHieloEnt }
}

/**
 * Las entregas de un pedido permiten repartir por día solo si TODAS traen cantidades y
 * precisión de instante. Es el mismo criterio que usan Dashboard, Producción, Cierre y
 * el balance operativo de Pedidos (#853): no debe copiarse en otro lugar.
 */
export function entregasConDesgloseConfiable(
  eventos: ReadonlyArray<{ incompleto?: boolean; cantidades: unknown; precisionDia?: boolean }>,
): boolean {
  return eventos.length > 0 && eventos.every((e) => !e.incompleto && !!e.cantidades && !e.precisionDia)
}

export async function unidadesEntregadasDelDia(db: Db, rango: RangoDia): Promise<UnidadesEntregadasDelDia> {
  return (await detalleUnidadesEntregadasDelDia(db, rango)).unidades
}

/** Procedencia compartida, con deltas físicos y comerciales para valoraciones diarias. */
export async function detalleUnidadesEntregadasDelDia(db: Db, rango: RangoDia) {
  // Eventos de entrega con fecha dentro del día (más sus hermanos de otros días, para validar la suma).
  const delDia = await leerEntregasConsulta(db, { rango })
  const idsEventos = [...new Set(delDia.map((e) => e.pedidoId))]
  const candidatos = await db.pedido.findMany({
    where: {
      estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
      OR: [{ fecha: { gte: rango.desde, lt: rango.hasta } }, { id: { in: idsEventos } }],
    },
    select: {
      id: true,
      numero: true,
      fecha: true,
      entregadoAt: true,
      cPacaAguaEnt: true,
      cPacaHieloEnt: true,
      cBotellonFabEnt: true,
      cBotellonDomEnt: true,
      cBolsaAguaEnt: true,
      cBolsaHieloEnt: true,
      items: { select: { producto: true, cantEntrega: true, cantRegaloEntrega: true } },
    },
  })
  const todos = await leerEntregasConsulta(db, { ids: candidatos.map((p) => p.id) })
  const porPedido = new Map<string, typeof todos>()
  for (const e of todos) porPedido.set(e.pedidoId, [...(porPedido.get(e.pedidoId) ?? []), e])

  const res: UnidadesEntregadasDelDia = { ...vacio(), aproximados: [] }
  const detalle: UnidadEntregadaDetalle[] = []
  for (const p of candidatos) {
    const acumulado = unidadesFisicasEntregadas(p)
    if (total(acumulado) === 0) continue
    const eventos = porPedido.get(p.id) ?? []
    const seguro = entregasConDesgloseConfiable(eventos)
    if (seguro) {
      const entra = delDia.filter((e) => e.pedidoId === p.id).map((e) => e.id)
      const entraIds = new Set(entra)
      const previas = new Map<string, number>()
      const previasRegalo = new Map<string, number>()
      for (const e of [...eventos].sort((a, b) => +a.fecha - +b.fecha || a.id.localeCompare(b.id))) {
        for (const l of e.cantidades ?? []) {
          const k = CLAVE[l.producto]
          if (!k || l.cantidad <= 0) continue
          const cantidadPrevia = previas.get(l.producto) ?? 0
          const cantidadRegaloPrevia = previasRegalo.get(l.producto) ?? 0
          if (entraIds.has(e.id)) {
            res[k] += l.cantidad
            detalle.push({ pedidoId: p.id, producto: l.producto, cantidad: l.cantidad, cantidadPrevia,
              ...(l.cantidadRegalo !== undefined ? { cantidadRegalo: l.cantidadRegalo } : {}),
              cantidadRegaloPrevia })
          }
          previas.set(l.producto, cantidadPrevia + l.cantidad)
          if (l.cantidadRegalo !== undefined) previasRegalo.set(l.producto, cantidadRegaloPrevia + l.cantidadRegalo)
        }
      }
      continue
    }
    // Sin detalle por día confiable: todo al día de creación y se informa como aproximado.
    if (p.fecha >= rango.desde && p.fecha < rango.hasta) {
      for (const [producto, k] of Object.entries(CLAVE)) {
        res[k] += acumulado[k]
        if (acumulado[k] > 0) {
          const regalos = p.items.reduce((n, i) => n + (i.producto === producto ? (i.cantRegaloEntrega ?? 0) : 0), 0)
          detalle.push({ pedidoId: p.id, producto, cantidad: acumulado[k], cantidadPrevia: 0,
            cantidadRegalo: regalos, cantidadRegaloPrevia: 0 })
        }
      }
      // Solo es dudoso si la entrega pudo ocurrir otro día; creado y entregado el mismo día no necesita aviso.
      const mismoDia = p.entregadoAt && diaBogota(p.entregadoAt) === diaBogota(p.fecha)
      if (!mismoDia) {
        res.aproximados.push({ pedidoId: p.id, numero: p.numero ?? null, fechaCreacion: p.fecha, unidades: acumulado })
      }
    }
  }
  return { unidades: res, detalle }
}
