/**
 * Tests de comportamiento para ActualizarPedidoUseCase.
 *
 * Antes de este archivo no existía ningún test que instanciara el use case
 * con repos mockeados y verificara persistencia real — los tests previos
 * (direccion-entrega-snapshot.test.ts, actualizar-cliente-negocio-guard.test.ts)
 * son regex sobre el código fuente, no ejercitan el flujo. Eso permitió que
 * tres bugs pasaran desapercibidos (auditoría BAMBU-LOG-001/017/018):
 *
 * - BAMBU-LOG-001: enviar `items` junto con un `estado` no validaba la
 *   transición (solo el enum), permitiendo saltos prohibidos por la
 *   máquina de estados.
 * - BAMBU-LOG-017: `estado: 'ENTREGADO'` sin `items` mutaba el agregado en
 *   memoria pero nunca llamaba a `pedidoRepo.update()` — la API respondía
 *   200 sin persistir nada.
 * - BAMBU-LOG-018: cualquier otra transición simple (o edición de solo
 *   `obs`) reconstruía el pedido con `{...pedido}`, que sobre una instancia
 *   de clase solo copia la propiedad interna `props` y produce un objeto
 *   malformado — la request terminaba en un 500.
 */
import { describe, it, expect, vi } from 'vitest'
import { ActualizarPedidoUseCase } from '../ActualizarPedidoUseCase'
import { Pedido } from '../../../domain/entities/Pedido'
import { CanalVO } from '../../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../../domain/value-objects/EstadoPago'
import { PedidoId } from '../../../domain/value-objects/PedidoId'
import { PedidoItem } from '../../../domain/entities/PedidoItem'
import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'
import type { EstadoEntrega, ItemPedidoResuelto } from '../../../domain/types'
import type { IPedidoRepository } from '../../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../../domain/repositories/IFacturaRepository'
import type { IClienteRepository } from '../../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../../domain/repositories/IPricingPort'
import type { ITransactionManager, TransactionClient } from '../../../infrastructure/transactions/PrismaTransactionManager'
import type { ActualizarPedidoInput } from '../../dto'

function makePedido(estadoEntrega: EstadoEntrega, id = 'ped_1'): Pedido {
  return Pedido.create({
    id: PedidoId.from(id),
    numero: 1,
    clienteId: 'cli_1',
    canal: CanalVO.from('DOMICILIO'),
    origen: OrigenPedidoVO.from('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.from(estadoEntrega),
    estadoPago: EstadoPagoVO.from('PENDIENTE'),
    items: [new PedidoItem('PACA_AGUA' as ProductCode, 2, Money.fromDecimal(10000), 'base', 0)],
    total: Money.fromDecimal(20000),
    totalPagado: Money.fromDecimal(0),
    pagos: [],
    fecha: new Date('2026-06-30T10:00:00Z'),
  })
}

function makeUseCase(pedido: Pedido) {
  const pedidoRepo: IPedidoRepository = {
    findById: vi.fn().mockResolvedValue(pedido),
    findByNumero: vi.fn(),
    findByOfflineId: vi.fn(),
    findByEntregaOfflineId: vi.fn(),
    findByAnulacionOfflineId: vi.fn(),
    findByCancelacionOfflineId: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
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
  const clienteRepo: IClienteRepository = {
    findById: vi.fn(),
    findByTelefono: vi.fn(),
    create: vi.fn(),
    updateDireccion: vi.fn(),
    findNegocioById: vi.fn(),
    getSaldoFavor: vi.fn(),
    aplicarSaldoFavor: vi.fn(),
    incrementarSaldoFavor: vi.fn(),
  }
  const preciosResueltos: ItemPedidoResuelto[] = [
    { producto: 'PACA_AGUA' as ProductCode, cantidad: 2, precio: 10000, subtotal: 20000, origen: 'base' },
  ]
  const pricingPort: IPricingPort = {
    loadPricingContext: vi.fn().mockResolvedValue({}),
    resolverPrecios: vi.fn().mockResolvedValue(preciosResueltos),
  }
  const txManager: ITransactionManager = {
    execute: (fn) => fn({} as TransactionClient),
    executeWithLock: (_namespace, _entityKey, fn) => fn({} as TransactionClient),
  }
  const useCase = new ActualizarPedidoUseCase(pedidoRepo, facturaRepo, clienteRepo, pricingPort, txManager)
  return { useCase, pedidoRepo, facturaRepo }
}

describe('ActualizarPedidoUseCase — validación de transición de estado', () => {
  it('BAMBU-LOG-001: rechaza una transición inválida cuando el body incluye items', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      estadoEntrega: 'ANULADO', // PENDIENTE no permite ir a ANULADO
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 2 }],
      usuarioId: 'user_1',
    }

    await expect(useCase.execute(input)).rejects.toThrow(/Transición inválida/)

    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('permite una transición válida cuando el body incluye items (no regresión)', async () => {
    const pedido = makePedido('EN_RUTA')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      estadoEntrega: 'PENDIENTE', // EN_RUTA -> PENDIENTE está permitido
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 2 }],
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('PENDIENTE')
  })
})

describe('ActualizarPedidoUseCase — persistencia de la transición a ENTREGADO sin items', () => {
  it('BAMBU-LOG-017: persiste el pedido cuando estado=ENTREGADO se envía sin items', async () => {
    const pedido = makePedido('EN_RUTA')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      estadoEntrega: 'ENTREGADO',
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('ENTREGADO')
    expect(result.pedido.entregadoAt).not.toBeNull()
  })
})

describe('ActualizarPedidoUseCase — reconstrucción correcta en transiciones simples y edición de obs', () => {
  it('BAMBU-LOG-018: EN_RUTA -> PENDIENTE (sin items) no lanza y persiste el pedido completo', async () => {
    const pedido = makePedido('EN_RUTA')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      estadoEntrega: 'PENDIENTE',
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('PENDIENTE')
    expect(result.pedido.clienteId).toBe('cli_1')
    expect(result.pedido.items.length).toBe(1)
  })

  it('BAMBU-LOG-018: editar solo obs (sin items, sin estado) no lanza y preserva el resto del pedido', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      obs: 'Nueva observación',
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.obs).toBe('Nueva observación')
    expect(result.pedido.clienteId).toBe('cli_1')
    expect(result.pedido.total).toBe(20000)
  })

  it('PENDIENTE -> CANCELADO (sin items) no lanza y persiste correctamente', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      estadoEntrega: 'CANCELADO',
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('CANCELADO')
  })
})
