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

function makePedido(
  estadoEntrega: EstadoEntrega,
  id = 'ped_1',
  extra: Partial<Parameters<typeof Pedido.create>[0]> = {},
): Pedido {
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
    ...extra,
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
    findById: vi.fn().mockResolvedValue({ id: 'cli_1', nombre: 'Cli', direccion: 'Calle 1', barrio: 'Centro', telefono: '300' }),
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
  void preciosResueltos
  const pricingPort: IPricingPort = {
    loadPricingContext: vi.fn().mockResolvedValue({}),
    // Precio vigente de hoy: 12000 (distinto del histórico 10000 del pedido de prueba).
    resolverPrecios: vi.fn().mockImplementation(async (items: Array<{ codigo: ProductCode; cantidad: number }>) =>
      items.map((i) => ({ producto: i.codigo, cantidad: i.cantidad, precio: 12000, subtotal: 12000 * i.cantidad, origen: 'base' })),
    ),
  }
  // F3: el use case ahora corre bajo `PEDIDO:{id}` y audita con `tx` —
  // el fakeTx necesita un `historial.create` (patrón de EntregarPedidoUseCase.test).
  const historialCreate = vi.fn().mockResolvedValue({})
  const fakeTx = {
    historial: { create: historialCreate },
  } as unknown as TransactionClient
  const txManager: ITransactionManager = {
    execute: (fn) => fn(fakeTx),
    executeWithLock: (_namespace, _entityKey, fn) => fn(fakeTx),
  }
  const executeWithLock = vi.fn(
    (_namespace: string, _entityKey: string, fn: (tx: TransactionClient) => Promise<unknown>) => fn(fakeTx),
  )
  txManager.executeWithLock = executeWithLock as unknown as ITransactionManager['executeWithLock']
  const useCase = new ActualizarPedidoUseCase(pedidoRepo, facturaRepo, clienteRepo, pricingPort, txManager, async () => null)
  return { useCase, pedidoRepo, facturaRepo, clienteRepo, pricingPort, executeWithLock, historialCreate }
}

describe('ActualizarPedidoUseCase — bypass de G11 vía PUT (hallazgo antifraude 2026-09-06)', () => {
  it('rechaza editar items de un pedido ya ENTREGADO (sin cambiar estadoEntrega en el mismo request)', async () => {
    const pedido = makePedido('ENTREGADO')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const input: ActualizarPedidoInput = {
      pedidoId: 'ped_1',
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 1, precioManual: 1 }],
      usuarioId: 'user_1',
    }

    await expect(useCase.execute(input)).rejects.toThrow('PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD')
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('rechaza editar items de un pedido CANCELADO', async () => {
    const pedido = makePedido('CANCELADO')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    await expect(
      useCase.execute({
        pedidoId: 'ped_1',
        items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 1 }],
        usuarioId: 'user_1',
      }),
    ).rejects.toThrow('PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD')
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('rechaza editar items de un pedido ANULADO', async () => {
    const pedido = makePedido('ANULADO')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    await expect(
      useCase.execute({
        pedidoId: 'ped_1',
        items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 1 }],
        usuarioId: 'user_1',
      }),
    ).rejects.toThrow('PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD')
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('rechaza editar items cuando ya hay cantidad entregada (aunque el pedido siga PENDIENTE/parcial)', async () => {
    const pedido = Pedido.create({
      id: PedidoId.from('ped_1'),
      numero: 1,
      clienteId: 'cli_1',
      canal: CanalVO.from('DOMICILIO'),
      origen: OrigenPedidoVO.from('PEDIDO'),
      estadoEntrega: EstadoEntregaVO.from('PENDIENTE'),
      estadoPago: EstadoPagoVO.from('PARCIAL'),
      // cantEntrega=1 de 2 — entrega parcial ya registrada (PR-1).
      items: [new PedidoItem('PACA_AGUA' as ProductCode, 2, Money.fromDecimal(10000), 'base', 1)],
      total: Money.fromDecimal(20000),
      totalPagado: Money.fromDecimal(10000),
      pagos: [],
      fecha: new Date('2026-06-30T10:00:00Z'),
    })
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    await expect(
      useCase.execute({
        pedidoId: 'ped_1',
        items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 1 }],
        usuarioId: 'user_1',
      }),
    ).rejects.toThrow('CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD')
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('no regresión: sigue permitiendo editar items de un pedido abierto sin entrega parcial', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    const result = await useCase.execute({
      pedidoId: 'ped_1',
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 3 }],
      usuarioId: 'user_1',
    })

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('PENDIENTE')
    expect(result.aplicado).toEqual({ campos: ['items'], sinCambios: false })
  })
})

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
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 3 }],
      usuarioId: 'user_1',
    }

    const result = await useCase.execute(input)

    expect(pedidoRepo.update).toHaveBeenCalledTimes(1)
    expect(result.pedido.estadoEntrega).toBe('PENDIENTE')
  })

  it('F3: corre bajo el lock PEDIDO:{id} (no un $transaction plano)', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, executeWithLock } = makeUseCase(pedido)

    await useCase.execute({ pedidoId: 'ped_1', obs: 'nota', usuarioId: 'user_1' })

    expect(executeWithLock).toHaveBeenCalledWith('PEDIDO', 'ped_1', expect.any(Function))
  })

  it('F3 (review): audita 1 sola vez, con tx, en la rama de solo-obs', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, historialCreate } = makeUseCase(pedido)

    await useCase.execute({ pedidoId: 'ped_1', obs: 'nueva nota', usuarioId: 'user_1', casoId: 'caso_9' })

    expect(historialCreate).toHaveBeenCalledTimes(1)
    const arg = historialCreate.mock.calls[0][0].data
    expect(arg.entidad).toBe('Pedido')
    expect(arg.accion).toBe('UPDATE')
    // casoId viaja embebido en `datos` (metadata forense — ver logAudit)
    expect(JSON.parse(arg.datos)._casoId).toBe('caso_9')
  })

  it('F3 (review): audita en la rama de transición de estado (antes no auditaba)', async () => {
    const pedido = makePedido('EN_RUTA')
    const { useCase, historialCreate } = makeUseCase(pedido)

    await useCase.execute({ pedidoId: 'ped_1', estadoEntrega: 'PENDIENTE', usuarioId: 'user_1' })

    expect(historialCreate).toHaveBeenCalledTimes(1)
  })

  it('F3 (review): NO audita si no hubo cambios', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, historialCreate } = makeUseCase(pedido)

    await useCase.execute({ pedidoId: 'ped_1', usuarioId: 'user_1' })

    expect(historialCreate).not.toHaveBeenCalled()
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

describe('ActualizarPedidoUseCase — contrato PR-1 (comportamiento, repos mockeados)', () => {
  it('reenviar las mismas líneas NO re-precifica ni toca el total (precio histórico 10000, vigente 12000)', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo, pricingPort } = makeUseCase(pedido)

    const r = await useCase.execute({
      pedidoId: 'ped_1', items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 2 }], usuarioId: 'u',
    })

    expect(r.aplicado).toEqual({ campos: [], sinCambios: true })
    expect(pricingPort.resolverPrecios).not.toHaveBeenCalled()
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('una línea NUEVA se precifica; la existente conserva su precio histórico', async () => {
    const pedido = makePedido('PENDIENTE')
    const { useCase, pedidoRepo, pricingPort } = makeUseCase(pedido)

    await useCase.execute({
      pedidoId: 'ped_1',
      items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 2 }, { producto: 'PACA_HIELO' as ProductCode, cantidad: 1 }],
      usuarioId: 'u',
    })

    const resolvedItems = (pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(resolvedItems.map((i: { codigo: string }) => i.codigo)).toEqual(['PACA_HIELO'])
    const guardado = (pedidoRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Pedido
    expect(guardado.items.find((i) => i.producto === 'PACA_AGUA')!.precio.toDecimal()).toBe(10000)
    expect(guardado.total.toDecimal()).toBe(20000 + 12000)
  })

  it('total nuevo < totalPagado → TotalMenorAPagadoError con el impacto y sin persistir', async () => {
    const pedido = makePedido('PENDIENTE', 'ped_1', { totalPagado: Money.fromDecimal(15000), estadoPago: EstadoPagoVO.from('PARCIAL') })
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    await expect(
      useCase.execute({ pedidoId: 'ped_1', items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 1 }], usuarioId: 'u' }),
    ).rejects.toMatchObject({ name: 'TotalMenorAPagadoError', impacto: { totalAnterior: 20000, totalNuevo: 12000, totalPagado: 15000, diferencia: 3000 } })
    expect(pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('conserva las claves de idempotencia y overrides al editar (toProps completo)', async () => {
    const pedido = makePedido('PENDIENTE', 'ped_1', {
      entregaOfflineId: 'e1', anulacionOfflineId: 'a1', cancelacionOfflineId: 'c1', offlineId: 'o1',
      adminOverrideNota: 'n', adminOverrideBy: 'adm', gpsAccuracy: 5, gpsJustificacion: 'j', entregadoConGps: false,
    })
    const { useCase, pedidoRepo } = makeUseCase(pedido)

    await useCase.execute({ pedidoId: 'ped_1', obs: 'x', usuarioId: 'u' })

    const guardado = (pedidoRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Pedido
    expect(guardado.entregaOfflineId).toBe('e1')
    expect(guardado.anulacionOfflineId).toBe('a1')
    expect(guardado.cancelacionOfflineId).toBe('c1')
    expect(guardado.offlineId).toBe('o1')
    expect(guardado.adminOverrideNota).toBe('n')
    expect(guardado.gpsAccuracy).toBe(5)
    expect(guardado.entregadoConGps).toBe(false)
  })

  it('obs "" limpia la observación; obs idéntica no cuenta como cambio', async () => {
    const pedido = makePedido('PENDIENTE', 'ped_1', { obs: 'vieja' })
    const a = makeUseCase(pedido)
    const r1 = await a.useCase.execute({ pedidoId: 'ped_1', obs: '', usuarioId: 'u' })
    expect(r1.pedido.obs).toBeFalsy()
    expect(r1.aplicado.campos).toEqual(['obs'])

    const b = makeUseCase(makePedido('PENDIENTE', 'ped_1', { obs: 'igual' }))
    const r2 = await b.useCase.execute({ pedidoId: 'ped_1', obs: 'igual', usuarioId: 'u' })
    expect(r2.aplicado.sinCambios).toBe(true)
    expect(b.pedidoRepo.update).not.toHaveBeenCalled()
  })

  it('auditoría con campos/antes/después, una sola vez', async () => {
    const { useCase, historialCreate } = makeUseCase(makePedido('PENDIENTE', 'ped_1', { obs: 'antes' }))
    await useCase.execute({ pedidoId: 'ped_1', obs: 'despues', usuarioId: 'u' })
    expect(historialCreate).toHaveBeenCalledTimes(1)
    const datos = JSON.parse(historialCreate.mock.calls[0][0].data.datos)
    expect(datos.campos).toEqual(['obs'])
    expect(datos.antes).toEqual({ obs: 'antes' })
    expect(datos.despues).toEqual({ obs: 'despues' })
  })

  describe('dirección de entrega', () => {
    it('por defecto (solo items) preserva el snapshot existente del pedido', async () => {
      const pedido = makePedido('PENDIENTE', 'ped_1', { direccionEntrega: 'Snapshot 9', barrioEntrega: 'B9' })
      const { useCase, pedidoRepo } = makeUseCase(pedido)
      await useCase.execute({ pedidoId: 'ped_1', items: [{ producto: 'PACA_AGUA' as ProductCode, cantidad: 3 }], usuarioId: 'u' })
      const g = (pedidoRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Pedido
      expect(g.direccionEntrega).toBe('Snapshot 9')
      expect(g.barrioEntrega).toBe('B9')
    })

    it('solo se recalcula si el body trae dirección/barrio explícitos (!== undefined)', async () => {
      const { useCase, clienteRepo } = makeUseCase(makePedido('PENDIENTE', 'ped_1', { direccionEntrega: 'S' }))
      await useCase.execute({ pedidoId: 'ped_1', obs: 'x', usuarioId: 'u' })
      expect(clienteRepo.findById).not.toHaveBeenCalled()
    })

    it('si el texto coincide con la dirección resuelta, limpia el snapshot', async () => {
      const pedido = makePedido('PENDIENTE', 'ped_1', { direccionEntrega: 'Otra', barrioEntrega: 'OtroB' })
      const { useCase, pedidoRepo } = makeUseCase(pedido)
      await useCase.execute({ pedidoId: 'ped_1', direccionEntrega: 'Calle 1', barrioEntrega: 'Centro', usuarioId: 'u' })
      const g = (pedidoRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Pedido
      expect(g.direccionEntrega).toBeUndefined()
      expect(g.barrioEntrega).toBeUndefined()
    })

    it('edición PARCIAL: enviar solo el barrio conserva la dirección efectiva actual', async () => {
      const pedido = makePedido('PENDIENTE', 'ped_1', { direccionEntrega: 'Snapshot 9', barrioEntrega: 'B9' })
      const { useCase, pedidoRepo } = makeUseCase(pedido)
      await useCase.execute({ pedidoId: 'ped_1', barrioEntrega: 'Nuevo', usuarioId: 'u' })
      const g = (pedidoRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Pedido
      expect(g.direccionEntrega).toBe('Snapshot 9')
      expect(g.barrioEntrega).toBe('Nuevo')
    })

    it('pedido ENTREGADO: dirección → PedidoCerradoError sin persistir', async () => {
      const { useCase, pedidoRepo } = makeUseCase(makePedido('ENTREGADO'))
      await expect(
        useCase.execute({ pedidoId: 'ped_1', direccionEntrega: 'X', usuarioId: 'u' }),
      ).rejects.toMatchObject({ name: 'PedidoCerradoError' })
      expect(pedidoRepo.update).not.toHaveBeenCalled()
    })

    it('actualizarCliente NUNCA se aplica si el pedido va a un negocio/sucursal', async () => {
      const pedido = makePedido('PENDIENTE', 'ped_1', { negocioId: 'neg_1' })
      const { useCase, clienteRepo } = makeUseCase(pedido)
      ;(clienteRepo.findNegocioById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'neg_1', direccion: 'Dir negocio', barrio: 'B', lat: null, lng: null })
      await useCase.execute({
        pedidoId: 'ped_1', direccionEntrega: 'Dir negocio 2', actualizarCliente: { direccion: 'D', barrio: 'B' }, usuarioId: 'u',
      })
      expect(clienteRepo.updateDireccion).not.toHaveBeenCalled()
    })

    it('actualizarCliente con cambio real sí actualiza al cliente (no negocio) y queda auditado', async () => {
      const { useCase, clienteRepo, historialCreate } = makeUseCase(makePedido('PENDIENTE'))
      const r = await useCase.execute({
        pedidoId: 'ped_1', actualizarCliente: { direccion: 'Calle Nueva 5', barrio: 'Norte' }, usuarioId: 'u',
      })
      expect(clienteRepo.updateDireccion).toHaveBeenCalledTimes(1)
      expect(r.aplicado.campos).toContain('actualizarCliente')
      expect(JSON.parse(historialCreate.mock.calls[0][0].data.datos).despues.actualizarCliente.direccion).toBe('Calle Nueva 5')
    })
  })
})
