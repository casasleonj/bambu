/**
 * PR-1 (integridad de entrega parcial): `EntregarPedidoUseCase` ya NO crea un
 * pedido hijo para el faltante. Una entrega parcial deja el pedido PENDIENTE
 * con `cantEntrega` acumulado; `total`/`totalPagado` intactos.
 * (Antes: BAMBU-LOG-004 verificaba que el hijo heredara negocioId/dirección.)
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

describe('EntregarPedidoUseCase — PR-1: entrega parcial no crea hijo', () => {
  it('entrega parcial (3 de 5): NO crea hijo, deja PENDIENTE, total/totalPagado intactos', async () => {
    const pedido = makePedidoConNegocio() // total 50.000, sin pagar
    let guardado: Pedido | undefined

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
        guardado = p
        return p
      }),
      update: vi.fn().mockImplementation(async (p: Pedido) => { guardado = p; return p }),
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
      // N2, guard I-11: sin ObligacionPendiente activa en este escenario.
      obligacionPendiente: { findMany: vi.fn().mockResolvedValue([]) },
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

    // NO se crea pedido hijo.
    expect(result.hijo).toBeUndefined()
    expect(pedidoRepo.save).not.toHaveBeenCalled()

    // El pedido persistido (update) queda PENDIENTE con 3/5 entregadas y la
    // obligación económica intacta.
    expect(guardado).toBeDefined()
    expect(guardado!.estadoEntrega.get()).toBe('PENDIENTE')
    expect(guardado!.items[0].cantEntrega).toBe(3)
    expect(Number(guardado!.total.toDecimal())).toBe(50000)
    expect(Number(guardado!.totalPagado.toDecimal())).toBe(0)
    expect(Number(guardado!.saldo.toDecimal())).toBe(50000)
  })
})
