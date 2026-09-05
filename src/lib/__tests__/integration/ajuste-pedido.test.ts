// @tests FASE FINAL — ajuste de pedido (§6 "PEDIDO:pedidoId")
// Dos ajustes concurrentes del mismo pedido se serializan bajo el lock del
// pedido; cada uno registra su PedidoCantidadAjuste con autorización.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'
import { AjustarPedidoCantidadUseCase } from '@/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase'

describe('FASE FINAL — ajuste de pedido (§6)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')
    clienteId = cliente.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dos ajustes concurrentes del mismo pedido se serializan (2 registros)', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_AGUA', cantPedido: 10 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    const resultados = await Promise.allSettled([
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 12,
        motivo: 'ajuste 1',
        autorizadoPorId: adminId,
        offlineId: uniqueId('ajuste-a'),
      }),
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 11,
        motivo: 'ajuste 2',
        autorizadoPorId: adminId,
        offlineId: uniqueId('ajuste-b'),
      }),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(2)

    const ajustes = await testPrisma.pedidoCantidadAjuste.findMany({
      where: { pedidoId: pedido.id },
    })
    expect(ajustes).toHaveLength(2)
    // Ambos leen cantidadOriginal=10 del PedidoItem real (ninguno la fabrica).
    expect(ajustes.every((a) => a.cantidadOriginal === 10)).toBe(true)
    const deltas = ajustes.map((a) => a.delta).sort((a, b) => a - b)
    expect(deltas).toEqual([1, 2])
  })

  it('cantidadOriginal se lee del PedidoItem real, no del cliente', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    await testPrisma.pedidoItem.create({
      data: { pedidoId: pedido.id, producto: 'PACA_HIELO', cantPedido: 7 },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    const result = await useCase.execute({
      pedidoId: pedido.id,
      producto: 'PACA_HIELO',
      cantidadNueva: 9,
      motivo: 'ajuste',
      autorizadoPorId: adminId,
      offlineId: uniqueId('ajuste-real'),
    })

    const ajuste = await testPrisma.pedidoCantidadAjuste.findUnique({
      where: { id: result.ajusteId },
    })
    expect(ajuste?.cantidadOriginal).toBe(7)
    expect(ajuste?.delta).toBe(2)
  })

  it('retry con el mismo offlineId no duplica el ajuste', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    const useCase = new AjustarPedidoCantidadUseCase()
    const offlineId = uniqueId('ajuste-retry')

    const input = {
      pedidoId: pedido.id,
      producto: 'PACA_AGUA',
      cantidadNueva: 6,
      motivo: 'retry',
      autorizadoPorId: adminId,
      offlineId,
    }

    const [r1, r2] = await Promise.all([useCase.execute(input), useCase.execute(input)])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    const count = await testPrisma.pedidoCantidadAjuste.count({ where: { offlineId } })
    expect(count).toBe(1)
  })

  it('rechaza ajuste sin autorización', async () => {
    const pedido = await testPrisma.pedido.create({
      // total=0/totalPagado=0 (default) → PENDIENTE (default estadoEntrega)
      // proyecta ANTICIPADO (chk_pedido_estadopago_proyectado).
      data: { clienteId, canal: 'DOMICILIO', estadoPago: 'ANTICIPADO' },
    })
    const useCase = new AjustarPedidoCantidadUseCase()

    await expect(
      useCase.execute({
        pedidoId: pedido.id,
        producto: 'PACA_AGUA',
        cantidadNueva: 6,
        motivo: 'sin autorizacion',
        autorizadoPorId: '',
      }),
    ).rejects.toThrow(/AJUSTE_EXIGE_AUTORIZACION/)
  })
})
