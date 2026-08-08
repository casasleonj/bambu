/**
 * Tests para ListarPedidosUseCase.
 *
 * Cubre el fix del cache-driven /pedidos (auditoría de performance P0):
 * - all=true debe soportar un takeLimit configurable (pageSize del caller),
 *   con cap duro de 1000.
 * - count(filter) solo debe pagarse cuando el resultado viene truncado
 *   exactamente al tope (pedidos.length === takeLimit); en caso contrario
 *   pedidos.length ya es el total exacto, sin pagar el COUNT(*).
 * - La rama sin all=true (paginación normal) sigue pagando count siempre,
 *   sin cambios de comportamiento.
 */

import { describe, it, expect, vi } from 'vitest'
import { ListarPedidosUseCase } from '../ListarPedidosUseCase'
import { Pedido } from '../../../domain/entities/Pedido'
import { CanalVO } from '../../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../../domain/value-objects/EstadoPago'
import { PedidoId } from '../../../domain/value-objects/PedidoId'
import { PedidoItem } from '../../../domain/entities/PedidoItem'
import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'
import type { IPedidoRepository } from '../../../domain/repositories/IPedidoRepository'

function makePedidoFixture(id: string): Pedido {
  return Pedido.create({
    id: PedidoId.from(id),
    numero: 1,
    clienteId: 'cli_test',
    canal: CanalVO.from('DOMICILIO'),
    origen: OrigenPedidoVO.from('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.from('PENDIENTE'),
    estadoPago: EstadoPagoVO.from('PENDIENTE'),
    items: [new PedidoItem('PACA_AGUA' as ProductCode, 1, Money.fromDecimal(10000), 'base', 0)],
    total: Money.fromDecimal(10000),
    totalPagado: Money.fromDecimal(0),
    pagos: [],
    fecha: new Date('2026-06-30T10:00:00Z'),
  })
}

function makeMockRepo(overrides: Partial<IPedidoRepository> = {}): IPedidoRepository {
  return {
    findById: vi.fn(),
    findByNumero: vi.fn(),
    findByOfflineId: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
    findPendingByCliente: vi.fn(),
    countByClienteAndDate: vi.fn(),
    ...overrides,
  } as IPedidoRepository
}

describe('ListarPedidosUseCase — all=true, sin truncamiento', () => {
  it('no llama a count() cuando pedidos.length < takeLimit (total exacto = length)', async () => {
    const findMany = vi.fn().mockResolvedValue([makePedidoFixture('ped_1'), makePedidoFixture('ped_2')])
    const count = vi.fn().mockResolvedValue(999)
    const repo = makeMockRepo({ findMany, count })
    const useCase = new ListarPedidosUseCase(repo)

    const result = await useCase.execute({ all: true, pageSize: 500 })

    expect(count).not.toHaveBeenCalled()
    expect(result.total).toBe(2)
    expect(result.pedidos).toHaveLength(2)
  })

  it('pasa el pageSize del caller como take, respetando el default 200 si no se pasa', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const repo = makeMockRepo({ findMany })
    const useCase = new ListarPedidosUseCase(repo)

    await useCase.execute({ all: true })
    expect(findMany).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 200 }), )

    findMany.mockClear()
    await useCase.execute({ all: true, pageSize: 500 })
    expect(findMany).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 500 }))
  })

  it('capea el pageSize a 1000 aunque el caller pida más', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const repo = makeMockRepo({ findMany })
    const useCase = new ListarPedidosUseCase(repo)

    await useCase.execute({ all: true, pageSize: 999999 })
    expect(findMany).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 1000 }))
  })
})

describe('ListarPedidosUseCase — all=true, con truncamiento', () => {
  it('llama a count() cuando pedidos.length === takeLimit (posible truncamiento)', async () => {
    const takeLimit = 3
    const pedidos = [makePedidoFixture('ped_1'), makePedidoFixture('ped_2'), makePedidoFixture('ped_3')]
    const findMany = vi.fn().mockResolvedValue(pedidos)
    const count = vi.fn().mockResolvedValue(500)
    const repo = makeMockRepo({ findMany, count })
    const useCase = new ListarPedidosUseCase(repo)

    const result = await useCase.execute({ all: true, pageSize: takeLimit })

    expect(count).toHaveBeenCalledTimes(1)
    expect(result.total).toBe(500)
    expect(result.pedidos).toHaveLength(3)
  })
})

describe('ListarPedidosUseCase — sin all (paginación normal)', () => {
  it('siempre llama a count(), sin cambios de comportamiento', async () => {
    const findMany = vi.fn().mockResolvedValue([makePedidoFixture('ped_1')])
    const count = vi.fn().mockResolvedValue(1)
    const repo = makeMockRepo({ findMany, count })
    const useCase = new ListarPedidosUseCase(repo)

    const result = await useCase.execute({ page: 1, pageSize: 20 })

    expect(count).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 20, skip: 0 }))
    expect(result.total).toBe(1)
  })

  it('calcula skip correctamente para page > 1', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const repo = makeMockRepo({ findMany })
    const useCase = new ListarPedidosUseCase(repo)

    await useCase.execute({ page: 3, pageSize: 20 })
    expect(findMany).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ take: 20, skip: 40 }))
  })
})
