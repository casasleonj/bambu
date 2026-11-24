// @tests #796 — reversiones reales frente al lector compartido de fiados (PostgreSQL real, datos sintéticos)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed, disconnect, uniqueId } from './setup'
import { leerFiadosVigentes } from '@/lib/fiados-vigentes-db'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

const AYER = new Date(Date.now() - 36 * 3600_000) // siempre anterior al corte de hoy en Bogotá
let clienteId = ''
const uc = () => new AnularPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(),
  new PrismaNotaCreditoRepository(), new PrismaTransactionManager())
const leer = (pedidoId: string) => db.$transaction(tx => leerFiadosVigentes(tx, { id: pedidoId }))

async function entregadoAyer(total: number, pagado: number) {
  const p = await db.pedido.create({ data: { clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
    estadoPago: pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE', total, totalPagado: pagado, saldo: total - pagado,
    fecha: AYER, entregadoAt: AYER } })
  if (pagado > 0) {
    await db.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: pagado } })
    await db.receivableEntry.create({ data: { pedidoId: p.id, clienteId, tipo: 'PAGO', monto: pagado, saldoResultante: total - pagado, totalPagadoResultante: pagado } })
  }
  return p
}

describe('#796 reversiones frente al lector compartido de fiados', () => {
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await db.cliente.create({ data: { nombre: 'Reversión 796', telefono: randomUUID() } })).id
  })
  afterAll(disconnect)

  it('entregado ayer con abono parcial: fiado = saldo restante, sin pendiente ni sin clasificar', async () => {
    const p = await entregadoAyer(20000, 15000)
    const r = await leer(p.id)
    expect(r.porPedido.get(p.id)).toMatchObject({ fiado: 5000, pendiente: 0, sinClasificar: 0, exigible: 5000 })
    expect(r.corteOperativo).toMatchObject({ clientesFiados: 1, clientesConsultaFiados: 1, fiado: 5000 })
  })

  it('reversión neta de un abono (saldo y totalPagado restituidos): el fiado vuelve a ser el total entregado', async () => {
    const p = await entregadoAyer(20000, 15000)
    await db.receivableEntry.create({ data: { pedidoId: p.id, clienteId, tipo: 'REVERSION', monto: 15000, saldoResultante: 20000, totalPagadoResultante: 0 } })
    await db.pedido.update({ where: { id: p.id }, data: { totalPagado: 0, saldo: 20000, estadoPago: 'PENDIENTE' } })
    const r = await leer(p.id)
    expect(r.porPedido.get(p.id)).toMatchObject({ fiado: 20000, pendiente: 0, sinClasificar: 0, exigible: 20000 })
  })

  it('anular un pedido pagado parcialmente: sale del fiado y de los contadores, sin lanzar', async () => {
    const p = await entregadoAyer(20000, 15000)
    await uc().execute({ pedidoId: p.id, motivo: 'error de facturación', offlineId: uniqueId('an') })
    const r = await leer(p.id)
    expect(r.porPedido.size).toBe(0)
    expect(r.corteOperativo).toMatchObject({ clientesFiados: 0, clientesConsultaFiados: 0, fiado: 0, pendiente: 0, sinClasificar: 0 })
    expect(r.clientes).toBe(0)
  })

  it('anular un pedido entregado y sin pagos tampoco deja fiado', async () => {
    const p = await entregadoAyer(20000, 0)
    await uc().execute({ pedidoId: p.id, motivo: 'duplicado', offlineId: uniqueId('an0') })
    expect((await leer(p.id)).corteOperativo.fiado).toBe(0)
  })
})
