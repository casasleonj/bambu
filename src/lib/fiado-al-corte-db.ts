import type { Prisma } from '@prisma/client'
import { calcularFiadoAlCorte, type FiadoDePedidoAlCorte, type PedidoParaFiadoAlCorte } from './fiado-al-corte'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'receivableEntry' | 'historial'>

const centavos = (valor: unknown): number => Math.round(Number(valor) * 100)

/** Fecha en que se anuló o canceló un pedido: la primera fila `UPDATE` de su historial con `estado` ANULADO o CANCELADO. */
function fechaDeAnulacion(filas: readonly { fecha: Date; datos: string }[]): Date | null {
  let primera: Date | null = null
  for (const fila of filas) {
    let datos: unknown
    try { datos = JSON.parse(fila.datos) } catch { continue }
    if (!datos || typeof datos !== 'object' || !('estado' in datos)) continue
    if (datos.estado !== 'ANULADO' && datos.estado !== 'CANCELADO') continue
    if (primera === null || fila.fecha.getTime() < primera.getTime()) primera = fila.fecha
  }
  return primera
}

/**
 * Fiado de cada pedido que cumple `where` a la fecha de corte. Solo lecturas.
 * `entregadoAt` de `EntregaExigible` se guarda sin zona (hora UTC): se lee tal cual como UTC.
 */
export async function leerFiadoAlCorte(db: Db, corte: Date, where: Prisma.PedidoWhereInput = {}): Promise<FiadoDePedidoAlCorte[]> {
  const pedidos = await db.pedido.findMany({ where, select: {
    id: true, fecha: true, createdAt: true, total: true, estadoEntrega: true, entregadoAt: true,
    entregasExigibles: { select: { entregadoAt: true, valorEntregado: true } },
    pagos: { select: { monto: true, createdAt: true, ocurridoAt: true } },
    reduccionesComerciales: { where: { estado: 'APLICADA' }, select: { resueltoAt: true, totalAntes: true, totalDespues: true } },
    correccionesPrecio: { where: { estado: 'APLICADA' }, select: { resueltoAt: true, totalAntes: true, totalDespues: true } },
    ajustesCantidad: { select: { id: true } },
  } })
  if (pedidos.length === 0) return []
  const ids = pedidos.map(p => p.id)
  const [reversiones, historial] = await Promise.all([
    db.receivableEntry.findMany({ where: { pedidoId: { in: ids }, tipo: 'REVERSION' }, select: { pedidoId: true, monto: true, createdAt: true } }),
    db.historial.findMany({ where: { entidad: 'Pedido', registroId: { in: ids }, accion: 'UPDATE',
      OR: [{ datos: { contains: '"estado":"ANULADO"' } }, { datos: { contains: '"estado":"CANCELADO"' } }] },
    select: { registroId: true, fecha: true, datos: true } }),
  ])
  const reversionesDe = new Map<string, { fecha: Date; centavos: number }[]>()
  for (const r of reversiones) {
    if (r.pedidoId === null) continue
    const lista = reversionesDe.get(r.pedidoId) ?? []
    lista.push({ fecha: r.createdAt, centavos: centavos(r.monto) })
    reversionesDe.set(r.pedidoId, lista)
  }
  const historialDe = new Map<string, { fecha: Date; datos: string }[]>()
  for (const h of historial) {
    const lista = historialDe.get(h.registroId) ?? []
    lista.push({ fecha: h.fecha, datos: h.datos })
    historialDe.set(h.registroId, lista)
  }

  return pedidos.map(p => {
    const cambios = [...p.reduccionesComerciales, ...p.correccionesPrecio].flatMap(c =>
      c.resueltoAt && c.totalAntes !== null && c.totalDespues !== null
        ? [{ fecha: c.resueltoAt, antesCentavos: centavos(c.totalAntes), despuesCentavos: centavos(c.totalDespues) }] : [])
    const entrada: PedidoParaFiadoAlCorte = {
      id: p.id, creadoAt: p.createdAt, totalCentavos: centavos(p.total), estadoEntrega: p.estadoEntrega, entregadoAt: p.entregadoAt,
      anuladoAt: fechaDeAnulacion(historialDe.get(p.id) ?? []), cambiosDeTotal: cambios,
      hechosDeEntrega: p.entregasExigibles.map(h => ({ entregadoAt: h.entregadoAt, valorCentavos: centavos(h.valorEntregado) })),
      pagos: p.pagos.map(g => ({ fecha: g.ocurridoAt ?? g.createdAt, centavos: centavos(g.monto) })),
      reversiones: reversionesDe.get(p.id) ?? [],
      tieneAjusteDeCantidad: p.ajustesCantidad.length > 0,
    }
    return calcularFiadoAlCorte(entrada, corte)
  })
}
