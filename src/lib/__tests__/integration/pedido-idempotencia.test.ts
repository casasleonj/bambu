// @tests FASE 1 — idempotencia por clave offline en entrega/anular/cancelar
// (ADR-IDEMPOTENCIA-001, contrato §14)
//
// Antes: el dedup de estos comandos era SOLO por estado (estadoEntrega ==
// ENTREGADO/ANULADO/CANCELADO). Un replay con el mismo offlineId no quedaba
// registrado bajo una clave persistida. Ahora cada comando persiste su
// offlineId (@unique) y el retry retorna deduped:true sin re-ejecutar.
//
// Verifica para cada comando:
//   1. Dos llamadas concurrentes con el MISMO offlineId → 1 gana, 1 deduped.
//   2. La clave idempotente queda persistida en la columna dedicada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  uniqueId,
  getSeededCliente,
} from './setup'
import { EntregarPedidoUseCase } from '@/modules/pedidos/application/use-cases/EntregarPedidoUseCase'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { CancelarPedidoUseCase } from '@/modules/pedidos/application/use-cases/CancelarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

async function crearPedido(estado: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO', clienteId: string) {
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: estado,
      estadoPago: estado === 'ENTREGADO' ? 'PARCIAL' : 'PENDIENTE',
      estado: estado,
      total: 20000,
      totalPagado: estado === 'ENTREGADO' ? 10000 : 0,
      saldo: estado === 'ENTREGADO' ? 10000 : 20000,
      items: {
        create: [
          {
            producto: 'PACA_AGUA',
            cantPedido: 2,
            cantEntrega: estado === 'ENTREGADO' ? 2 : 0,
            precio: 10000,
            subtotal: 20000,
          },
        ],
      },
    },
    include: { items: true },
  })
}

describe('FASE 1 — idempotencia por clave offline (entrega/anular/cancelar)', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await getSeededCliente()
    clienteId = cliente.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('ENTREGA: dos llamadas concurrentes con el mismo offlineId → 1 gana, 1 deduped', async () => {
    const pedido = await crearPedido('EN_RUTA', clienteId)
    const offlineId = uniqueId('entrega')

    const useCase = new EntregarPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PrismaTransactionManager(),
    )

    const input = {
      pedidoId: pedido.id,
      itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 2 }],
      pagos: [],
      offlineId,
    }

    const [r1, r2] = await Promise.all([useCase.execute(input), useCase.execute(input)])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    // La clave idempotente quedó persistida.
    const persisted = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(persisted?.entregaOfflineId).toBe(offlineId)
  })

  it('ANULAR: dos llamadas concurrentes con el mismo offlineId → 1 gana, 1 deduped', async () => {
    const pedido = await crearPedido('ENTREGADO', clienteId)
    const offlineId = uniqueId('anular')

    const useCase = new AnularPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(),
      new PrismaTransactionManager(),
    )

    const input = { pedidoId: pedido.id, motivo: 'test', offlineId }

    const [r1, r2] = await Promise.all([useCase.execute(input), useCase.execute(input)])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    const persisted = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(persisted?.anulacionOfflineId).toBe(offlineId)
  })

  it('CANCELAR: dos llamadas concurrentes con el mismo offlineId → 1 gana, 1 deduped', async () => {
    const pedido = await crearPedido('PENDIENTE', clienteId)
    const offlineId = uniqueId('cancelar')

    const useCase = new CancelarPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(),
      new PrismaTransactionManager(),
    )

    const input = { pedidoId: pedido.id, motivo: 'test', offlineId }

    const [r1, r2] = await Promise.all([useCase.execute(input), useCase.execute(input)])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    const persisted = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(persisted?.cancelacionOfflineId).toBe(offlineId)
  })

  it('las columnas de idempotencia existen con unique index (defensa en DB)', async () => {
    const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Pedido'
        AND indexname LIKE '%OfflineId_key'
    `
    const names = indexes.map((i) => i.indexname)
    expect(names).toContain('Pedido_entregaOfflineId_key')
    expect(names).toContain('Pedido_anulacionOfflineId_key')
    expect(names).toContain('Pedido_cancelacionOfflineId_key')
  })
})
