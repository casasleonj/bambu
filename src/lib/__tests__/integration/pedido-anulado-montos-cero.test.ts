// @tests #512 — un pedido anulado o cancelado queda con TODOS sus montos en 0
// Hallazgo cubierto: `cancelar()` ponía total y pagado en 0, pero `anular()` solo el pagado.
// Verifica contra Postgres real (no mocks):
//   1. Anular un pedido entregado y pagado deja total, saldo y totalPagado en 0.
//   2. Cancelar uno pendiente y pagado hace lo mismo (paridad).
//   3. La nota de crédito conserva lo que se había cobrado y la fila Pago no se borra.
//   4. Anular uno entregado con fiado (sin pagos) también queda en 0 y sin nota de crédito.
//   5. El verificador de integridad no marca ninguno de estos pedidos.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'
import * as audit from '@/lib/audit'
import { testPrisma, resetAndSeed, disconnect, getSeededCliente } from './setup'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { CancelarPedidoUseCase } from '@/modules/pedidos/application/use-cases/CancelarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'
import { verificarIntegridad } from '@/lib/integridad/verificar'

let clienteId: string

async function crearPedido(estado: 'ENTREGADO' | 'PENDIENTE', pagado: number) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: estado, estado,
      estadoPago: calcularEstadoPago(20000, pagado, estado),
      total: 20000, totalPagado: pagado, saldo: 20000 - pagado,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 8, cantEntrega: estado === 'ENTREGADO' ? 8 : 0, precio: 2500, subtotal: 20000 }] },
    },
  })
  if (pagado > 0) {
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: pagado } })
    await testPrisma.receivableEntry.create({
      data: { pedidoId: pedido.id, clienteId, tipo: 'PAGO', monto: pagado, saldoResultante: 20000 - pagado, totalPagadoResultante: pagado },
    })
  }
  await testPrisma.factura.create({
    data: { numero: `FAC-T${randomUUID()}`, pedidoId: pedido.id, clienteId, subtotal: 20000, total: 20000, montoPagado: pagado, saldo: 20000 - pagado, estado: pagado >= 20000 ? 'PAGADA' : 'EMITIDA' },
  })
  return pedido
}

const anular = () => new AnularPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaNotaCreditoRepository(), new PrismaTransactionManager())
const cancelar = () => new CancelarPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaNotaCreditoRepository(), new PrismaTransactionManager())

async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas.filter((r) => r.id !== 'V11').flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

describe('Pedido anulado o cancelado: montos en 0 (#512)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => { await disconnect() })

  it('anular un pedido entregado y pagado deja total, saldo y pagado en 0', async () => {
    const p = await crearPedido('ENTREGADO', 20000)
    await anular().execute({ pedidoId: p.id, motivo: 'prueba' })
    const f = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect(f.estadoEntrega).toBe('ANULADO')
    expect(Number(f.total)).toBe(0)
    expect(Number(f.saldo)).toBe(0)
    expect(Number(f.totalPagado)).toBe(0)
    expect(await violaciones(p.id)).toEqual([])
  })

  it('cancelar uno pendiente y pagado hace lo mismo (paridad)', async () => {
    const p = await crearPedido('PENDIENTE', 20000)
    await cancelar().execute({ pedidoId: p.id, motivo: 'prueba' })
    const f = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect(f.estadoEntrega).toBe('CANCELADO')
    expect([Number(f.total), Number(f.saldo), Number(f.totalPagado)]).toEqual([0, 0, 0])
    expect(await violaciones(p.id)).toEqual([])
  })

  it('la nota de crédito conserva lo cobrado y la fila Pago no se borra', async () => {
    const p = await crearPedido('ENTREGADO', 12000)
    await anular().execute({ pedidoId: p.id, motivo: 'prueba' })
    const nc = await testPrisma.notaCredito.findMany({ where: { pedidoId: p.id } })
    expect(nc).toHaveLength(1)
    expect(Number(nc[0].monto)).toBe(12000)
    expect(await testPrisma.pago.count({ where: { pedidoId: p.id } })).toBe(1)
  })

  it('anular uno entregado con fiado (sin pagos) queda en 0 y sin nota de crédito', async () => {
    const p = await crearPedido('ENTREGADO', 0)
    await anular().execute({ pedidoId: p.id, motivo: 'prueba' })
    const f = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect([Number(f.total), Number(f.saldo), Number(f.totalPagado)]).toEqual([0, 0, 0])
    expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(0)
    expect(await violaciones(p.id)).toEqual([])
  })

  it('reintentar no duplica la nota ni la reversión y conserva los montos en cero', async () => {
    const p = await crearPedido('ENTREGADO', 12000)
    const offlineId = randomUUID()
    await anular().execute({ pedidoId: p.id, motivo: 'Prueba sintética', offlineId })
    const replay = await anular().execute({ pedidoId: p.id, motivo: 'Prueba sintética', offlineId })
    expect(replay.deduped).toBe(true)
    const post = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect([Number(post.total), Number(post.saldo), Number(post.totalPagado)]).toEqual([0, 0, 0])
    expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(1)
    const reversos = await testPrisma.receivableEntry.findMany({ where: { pedidoId: p.id, tipo: 'REVERSION' } })
    expect(reversos).toHaveLength(1)
    expect(Number(reversos[0].saldoResultante)).toBe(0)
    const factura = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: p.id } })
    expect(factura.estado).toBe('ANULADA')
    expect(Number(factura.saldo)).toBe(0)
    expect(Number(factura.total)).toBe(20000)
    expect(Number(factura.montoPagado)).toBe(12000)
  })

  it('anular en cascada deja en cero los hijos entregados y los pendientes sin perder las notas', async () => {
    const padre = await crearPedido('ENTREGADO', 12000)
    const hijo = await crearPedido('ENTREGADO', 8000)
    const pendiente = await crearPedido('PENDIENTE', 0)
    await testPrisma.pedido.updateMany({ where: { id: { in: [hijo.id, pendiente.id] } }, data: { pedidoOrigenId: padre.id } })
    const resultado = await anular().execute({ pedidoId: padre.id, motivo: 'Prueba sintética' })
    expect(resultado.hijosAnulados).toBe(2)
    const post = await testPrisma.pedido.findMany({ where: { id: { in: [padre.id, hijo.id, pendiente.id] } } })
    for (const p of post) expect([Number(p.total), Number(p.saldo), Number(p.totalPagado)]).toEqual([0, 0, 0])
    const notas = await testPrisma.notaCredito.findMany({ where: { pedidoId: { in: [padre.id, hijo.id, pendiente.id] } } })
    expect(notas.map(n => Number(n.monto)).sort((a, b) => a - b)).toEqual([8000, 12000])
    expect(await testPrisma.pago.count({ where: { pedidoId: { in: [padre.id, hijo.id] } } })).toBe(2)
  })

  it('un error al auditar revierte pedido, factura, nota y compensación juntos', async () => {
    const p = await crearPedido('ENTREGADO', 12000)
    const fallo = vi.spyOn(audit, 'logAudit').mockRejectedValueOnce(new Error('Fallo sintético de auditoría'))
    try {
      await expect(anular().execute({ pedidoId: p.id, motivo: 'Prueba sintética' })).rejects.toThrow('Fallo sintético')
    } finally {
      fallo.mockRestore()
    }
    const post = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect([Number(post.total), Number(post.saldo), Number(post.totalPagado)]).toEqual([20000, 8000, 12000])
    expect(post.estadoEntrega).toBe('ENTREGADO')
    expect((await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: p.id } })).estado).toBe('EMITIDA')
    expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(0)
    expect(await testPrisma.receivableEntry.count({ where: { pedidoId: p.id, tipo: 'REVERSION' } })).toBe(0)
    expect(await testPrisma.pago.count({ where: { pedidoId: p.id } })).toBe(1)
  })
})
