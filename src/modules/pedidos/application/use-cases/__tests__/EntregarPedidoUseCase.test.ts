/**
 * BAMBU-LOG-004: el pedido hijo creado por una entrega PARCIAL individual
 * (vía POST /api/pedidos/[id]/entrega, no el cierre de embarque) debe
 * heredar negocioId y el snapshot de dirección del padre. Antes, solo se
 * copiaba clienteId (Pedido.crearPedidoHijo() en el dominio no incluía
 * negocioId/direccionEntrega/barrioEntrega) — mismo bug que en
 * ProcesarPedidoService (cierre), pero en la implementación paralela
 * usada por la entrega individual.
 */
import { describe, it, expect, vi } from 'vitest'
import { EntregarPedidoUseCase } from '../EntregarPedidoUseCase'
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
import type { IFacturaRepository } from '../../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../../domain/repositories/IPagoRepository'
import type { ITransactionManager, TransactionClient } from '../../../infrastructure/transactions/PrismaTransactionManager'
import type { EntregarPedidoInput } from '../../dto'

function makePedidoConNegocio(): Pedido {
  return Pedido.create({
    id: PedidoId.from('ped_padre'),
    numero: 42,
    clienteId: 'cli_1',
    negocioId: 'neg_1',
    direccionEntrega: 'Cra 10 #20-30',
    barrioEntrega: 'Centro',
    canal: CanalVO.from('DOMICILIO'),
    origen: OrigenPedidoVO.from('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.from('EN_RUTA'),
    estadoPago: EstadoPagoVO.from('PENDIENTE'),
    // 5 pedidas de PACA_AGUA, se entregarán solo 3 -> faltante de 2
    items: [new PedidoItem('PACA_AGUA' as ProductCode, 5, Money.fromDecimal(10000), 'base', 0)],
    total: Money.fromDecimal(50000),
    totalPagado: Money.fromDecimal(0),
    pagos: [],
    fecha: new Date('2026-06-30T10:00:00Z'),
  })
}

describe('EntregarPedidoUseCase — BAMBU-LOG-004: hijo hereda negocioId/dirección', () => {
  it('entrega PARCIAL crea un hijo con el mismo negocioId y dirección del padre', async () => {
    const pedido = makePedidoConNegocio()
    let hijoGuardado: Pedido | undefined

    const pedidoRepo: IPedidoRepository = {
      findById: vi.fn().mockResolvedValue(pedido),
      findByNumero: vi.fn(),
      findByOfflineId: vi.fn(),
      findByEntregaOfflineId: vi.fn(),
      findByAnulacionOfflineId: vi.fn(),
      findByCancelacionOfflineId: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      save: vi.fn().mockImplementation(async (p: Pedido) => {
        hijoGuardado = p
        return p
      }),
      update: vi.fn().mockImplementation(async (p: Pedido) => p),
      findPendingByCliente: vi.fn(),
      countByClienteAndDate: vi.fn(),
    }
    const facturaRepo: IFacturaRepository = {
      findByPedidoId: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      anularByPedidoId: vi.fn(),
    }
    const pagoRepo: IPagoRepository = {
      findByPedidoId: vi.fn(),
      createMany: vi.fn(),
    }
    const fakeTx = {
      pedido: { aggregate: vi.fn().mockResolvedValue({ _max: { numero: 100 } }) },
      historial: { create: vi.fn().mockResolvedValue({}) },
      // FASE 8: getNextNumero ahora usa secuencia atómica (nextval).
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ nextval: BigInt(101) }]),
    } as unknown as TransactionClient
    const txManager: ITransactionManager = {
      execute: (fn) => fn(fakeTx),
      executeWithLock: (_namespace, _entityKey, fn) => fn(fakeTx),
    }

    const useCase = new EntregarPedidoUseCase(pedidoRepo, facturaRepo, pagoRepo, txManager)

    const input: EntregarPedidoInput = {
      pedidoId: 'ped_padre',
      itemsEntregados: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 3 }],
    }

    const result = await useCase.execute(input)

    expect(result.hijo).toBeDefined()
    expect(hijoGuardado).toBeDefined()
    expect(hijoGuardado!.negocioId).toBe('neg_1')
    expect(hijoGuardado!.direccionEntrega).toBe('Cra 10 #20-30')
    expect(hijoGuardado!.barrioEntrega).toBe('Centro')
  })
})
