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

export async function unidadesEntregadasDelDia(db: Db, rango: RangoDia): Promise<UnidadesEntregadasDelDia> {
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
    },
  })
  const todos = await leerEntregasConsulta(db, { ids: candidatos.map((p) => p.id) })
  const porPedido = new Map<string, typeof todos>()
  for (const e of todos) porPedido.set(e.pedidoId, [...(porPedido.get(e.pedidoId) ?? []), e])

  const res: UnidadesEntregadasDelDia = { ...vacio(), aproximados: [] }
  for (const p of candidatos) {
    const acumulado: UnidadesDelDia = {
      agua: p.cPacaAguaEnt,
      hielo: p.cPacaHieloEnt,
      botellon: p.cBotellonFabEnt + p.cBotellonDomEnt,
      bolsaAgua: p.cBolsaAguaEnt,
      bolsaHielo: p.cBolsaHieloEnt,
    }
    if (total(acumulado) === 0) continue
    const eventos = porPedido.get(p.id) ?? []
    const seguro = eventos.length > 0 && eventos.every((e) => !e.incompleto && e.cantidades && !e.precisionDia)
    if (seguro) {
      const entra = delDia.filter((e) => e.pedidoId === p.id).map((e) => e.id)
      for (const e of eventos) {
        if (!entra.includes(e.id)) continue
        for (const l of e.cantidades ?? []) {
          const k = CLAVE[l.producto]
          if (k) res[k] += l.cantidad
        }
      }
      continue
    }
    // Sin detalle por día confiable: todo al día de creación y se informa como aproximado.
    if (p.fecha >= rango.desde && p.fecha < rango.hasta) {
      for (const k of Object.keys(acumulado) as Array<keyof UnidadesDelDia>) res[k] += acumulado[k]
      // Solo es dudoso si la entrega pudo ocurrir otro día; creado y entregado el mismo día no necesita aviso.
      const mismoDia = p.entregadoAt && diaBogota(p.entregadoAt) === diaBogota(p.fecha)
      if (!mismoDia) {
        res.aproximados.push({ pedidoId: p.id, numero: p.numero ?? null, fechaCreacion: p.fecha, unidades: acumulado })
      }
    }
  }
  return res
}
