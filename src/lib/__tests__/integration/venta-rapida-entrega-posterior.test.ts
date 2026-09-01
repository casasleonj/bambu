// @tests CrearPedidoUseCase — venta rápida con entrega posterior
// ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 (paso 2, venta rápida).
//
// Verifica:
//   1. venta rápida + entregado:false + prepago total → PENDIENTE + ANTICIPADO,
//      cantEntrega = 0, cantPedido intacto.
//   2. venta rápida + entregado:true (o ausente) → ENTREGADO + PAGADO (histórico).
//   3. entregado:false NO afecta a un pedido normal (ya nace PENDIENTE).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

describe('CrearPedidoUseCase — venta rápida con entrega posterior', () => {
  let useCase: CrearPedidoUseCase
  let clienteId: string
  let adminId: string
  // Pago holgado: `normalizarPagos` cabecea el excedente al total del pedido,
  // así el prepago siempre queda completo sin depender del precio sembrado.
  const PAGO_HOLGADO = 9_999_999

  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Entrega Posterior',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        limitePedidosFiados: 20,
        activo: true,
      },
    })
    clienteId = c.id
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('Admin user not found')
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  beforeEach(() => {
    useCase = new CrearPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PrismaClienteRepository(),
      new PrismaPricingAdapter(),
      new PrismaTransactionManager(),
    )
  })

  it('venta rápida + entregado:false + prepago total → PENDIENTE + ANTICIPADO, cantEntrega 0', async () => {
    const res = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: PAGO_HOLGADO }],
      ventaRapida: true,
      entregado: false,
      offlineId: uniqueId('vr-posterior'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    const pedido = await testPrisma.pedido.findUnique({
      where: { id: res.pedido.id },
      include: { items: true },
    })
    expect(pedido?.estadoEntrega).toBe('PENDIENTE')
    expect(pedido?.estado).toBe('PENDIENTE')
    expect(pedido?.estadoPago).toBe('ANTICIPADO')
    expect(pedido?.origen).toBe('VENTA_RAPIDA')
    expect(Number(pedido?.saldo)).toBe(0)
    for (const item of pedido!.items) {
      expect(item.cantEntrega).toBe(0)
      expect(item.cantPedido).toBeGreaterThan(0)
    }
    expect(pedido?.cPacaAguaEnt).toBe(0)
    expect(pedido?.cPacaAguaPed).toBe(2)
  })

  it('venta rápida + entregado:true → ENTREGADO + PAGADO (comportamiento histórico)', async () => {
    const res = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
      pagos: [{ metodo: 'EFECTIVO', monto: PAGO_HOLGADO }],
      ventaRapida: true,
      entregado: true,
      offlineId: uniqueId('vr-ahora'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    const pedido = await testPrisma.pedido.findUnique({
      where: { id: res.pedido.id },
      include: { items: true },
    })
    expect(pedido?.estadoEntrega).toBe('ENTREGADO')
    expect(pedido?.estadoPago).toBe('PAGADO')
    for (const item of pedido!.items) {
      expect(item.cantEntrega).toBe(item.cantPedido)
    }
  })

  it('venta rápida sin `entregado` → ENTREGADO (default retrocompatible)', async () => {
    const res = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: PAGO_HOLGADO }],
      ventaRapida: true,
      offlineId: uniqueId('vr-default'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })
    const pedido = await testPrisma.pedido.findUnique({ where: { id: res.pedido.id } })
    expect(pedido?.estadoEntrega).toBe('ENTREGADO')
  })

  it('pedido normal + entregado:false → PENDIENTE igual (no cambia nada)', async () => {
    const res = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
      entregado: false,
      offlineId: uniqueId('normal-posterior'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })
    const pedido = await testPrisma.pedido.findUnique({
      where: { id: res.pedido.id },
      include: { items: true },
    })
    expect(pedido?.estadoEntrega).toBe('PENDIENTE')
    for (const item of pedido!.items) {
      expect(item.cantEntrega).toBe(0)
    }
  })
})
