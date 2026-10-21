// @tests #367 — anular un pedido anula también sus pedidos hijos (pedidoOrigenId),
// en cascada por todo el árbol y en la misma tx. Hijo ENTREGADO → ANULADO (con NC si
// hubo cobros); hijo no entregado → CANCELADO; ya terminales se saltan.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getSeededCliente, uniqueId } from './setup'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

let clienteId: string

function anularUC() {
  return new AnularPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaNotaCreditoRepository(),
    new PrismaTransactionManager(),
  )
}

async function crearPedido(opts: {
  estado: 'ENTREGADO' | 'PENDIENTE' | 'EN_RUTA' | 'CANCELADO'
  pagado?: number
  origenId?: string
}) {
  const pagado = opts.pagado ?? 0
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: opts.estado,
      estado: opts.estado,
      estadoPago: calcularEstadoPago(20000, pagado, opts.estado),
      total: 20000,
      totalPagado: pagado,
      saldo: 20000 - pagado,
      ...(opts.origenId ? { pedidoOrigenId: opts.origenId } : {}),
    },
  })
  if (pagado > 0) {
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: pagado } })
  }
  return pedido
}

describe('anular pedido → cascada a pedidos hijos (#367)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('anula el árbol completo: hijo pagado ENTREGADO → ANULADO + NC; hijo PENDIENTE y nieto → CANCELADO', async () => {
    const padre = await crearPedido({ estado: 'ENTREGADO', pagado: 20000 })
    const hijoEntregado = await crearPedido({ estado: 'ENTREGADO', pagado: 8000, origenId: padre.id })
    const hijoPendiente = await crearPedido({ estado: 'PENDIENTE', origenId: padre.id })
    const nieto = await crearPedido({ estado: 'EN_RUTA', origenId: hijoPendiente.id })

    const res = await anularUC().execute({ pedidoId: padre.id, motivo: 'error', offlineId: uniqueId('casc') })

    expect(res.hijosAnulados).toBe(3)
    expect(new Set(res.hijosIds)).toEqual(new Set([hijoEntregado.id, hijoPendiente.id, nieto.id]))

    const estado = async (id: string) => (await testPrisma.pedido.findUnique({ where: { id } }))?.estadoEntrega
    expect(await estado(padre.id)).toBe('ANULADO')
    expect(await estado(hijoEntregado.id)).toBe('ANULADO')
    expect(await estado(hijoPendiente.id)).toBe('CANCELADO')
    expect(await estado(nieto.id)).toBe('CANCELADO')

    // NC solo donde hubo cobros, por lo efectivamente cobrado de cada pedido
    const ncPadre = await testPrisma.notaCredito.findFirst({ where: { pedidoId: padre.id } })
    const ncHijo = await testPrisma.notaCredito.findFirst({ where: { pedidoId: hijoEntregado.id } })
    expect(Number(ncPadre?.monto)).toBe(20000)
    expect(Number(ncHijo?.monto)).toBe(8000)
    expect(await testPrisma.notaCredito.count({ where: { pedidoId: { in: [hijoPendiente.id, nieto.id] } } })).toBe(0)
  })

  it('hijos ya terminales (CANCELADO) se saltan y no cuentan', async () => {
    const padre = await crearPedido({ estado: 'ENTREGADO' })
    const hijoCancelado = await crearPedido({ estado: 'CANCELADO', origenId: padre.id })
    const hijoVivo = await crearPedido({ estado: 'PENDIENTE', origenId: padre.id })

    const res = await anularUC().execute({ pedidoId: padre.id, motivo: 'x', offlineId: uniqueId('casc2') })

    expect(res.hijosAnulados).toBe(1)
    expect(res.hijosIds).toEqual([hijoVivo.id])
    expect((await testPrisma.pedido.findUnique({ where: { id: hijoCancelado.id } }))?.estadoEntrega).toBe('CANCELADO')
  })

  it('pedido sin hijos: hijosAnulados = 0', async () => {
    const padre = await crearPedido({ estado: 'ENTREGADO' })
    const res = await anularUC().execute({ pedidoId: padre.id, motivo: 'x', offlineId: uniqueId('casc3') })
    expect(res.hijosAnulados).toBe(0)
    expect(res.hijosIds).toEqual([])
  })

  it('reintento idempotente (mismo offlineId): 200 deduped, sin tocar hijos ni duplicar NC', async () => {
    const padre = await crearPedido({ estado: 'ENTREGADO', pagado: 20000 })
    const hijo = await crearPedido({ estado: 'ENTREGADO', pagado: 5000, origenId: padre.id })
    const off = uniqueId('casc4')

    await anularUC().execute({ pedidoId: padre.id, motivo: 'x', offlineId: off })
    const segundo = await anularUC().execute({ pedidoId: padre.id, motivo: 'x', offlineId: off })

    expect(segundo.deduped).toBe(true)
    expect(segundo.hijosAnulados).toBe(0)
    expect(await testPrisma.notaCredito.count({ where: { pedidoId: { in: [padre.id, hijo.id] } } })).toBe(2)
  })
})
