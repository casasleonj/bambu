// @tests CrearPedidoUseCase — cliente canónico CONSUMIDOR_FINAL
// Hallazgo cubierto: sin el lookup-or-create, cada venta anónima creaba
// un cliente "Consumidor Final" con CUID distinto, contaminando la lista.
// Verifica:
//   1. Ejecutar 2 veces con clienteId='CONSUMIDOR_FINAL' → 1 solo cliente en DB
//   2. El cliente retornado es el canónico (id='CONSUMIDOR_FINAL')
//   3. El canónico tiene activo=false (no aparece en listas)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  uniqueId,
  getAdminUser,
} from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

describe('CrearPedidoUseCase — cliente canónico CONSUMIDOR_FINAL', () => {
  let useCase: CrearPedidoUseCase
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
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

  it('dos ventas anónimas usan el mismo cliente canónico sin duplicar', async () => {
    const baseInput = {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO' as const,
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 5000 }],
      createdById: adminId,
      createdByRole: 'ADMIN' as const,
    }

    const r1 = await useCase.execute({ ...baseInput, offlineId: uniqueId('vr-canonical-1') })
    const r2 = await useCase.execute({ ...baseInput, offlineId: uniqueId('vr-canonical-2') })

    expect(r1.pedido).toBeDefined()
    expect(r2.pedido).toBeDefined()
    expect(r1.pedido.clienteId).toBe('CONSUMIDOR_FINAL')
    expect(r2.pedido.clienteId).toBe('CONSUMIDOR_FINAL')
    expect(r1.deduped).toBeFalsy()
    expect(r2.deduped).toBeFalsy()

    // Exactamente 1 cliente "Consumidor Final" debe existir
    const consumidoresFinal = await testPrisma.cliente.findMany({
      where: { nombre: 'Consumidor Final' },
    })
    expect(consumidoresFinal).toHaveLength(1)
    expect(consumidoresFinal[0].id).toBe('CONSUMIDOR_FINAL')
    expect(consumidoresFinal[0].activo).toBe(false)
  })

  it('si el canónico no existe, el fallback lo crea con id literal', async () => {
    // Borramos el canónico para simular un entorno sin seed.
    // Las FKs de Pedido/Factura sobre Cliente son RESTRICT, así que primero
    // limpiamos los registros dependientes del canónico.
    await testPrisma.$transaction(async (tx) => {
      await tx.pago.deleteMany({ where: { pedido: { clienteId: 'CONSUMIDOR_FINAL' } } })
      await tx.factura.deleteMany({ where: { clienteId: 'CONSUMIDOR_FINAL' } })
      await tx.pedido.deleteMany({ where: { clienteId: 'CONSUMIDOR_FINAL' } })
      await tx.cliente.deleteMany({ where: { id: 'CONSUMIDOR_FINAL' } })
    })

    const r1 = await useCase.execute({
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO' as const,
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 5000 }],
      offlineId: uniqueId('vr-fallback'),
      createdById: adminId,
      createdByRole: 'ADMIN' as const,
    })

    expect(r1.pedido.clienteId).toBe('CONSUMIDOR_FINAL')

    const canónico = await testPrisma.cliente.findUnique({
      where: { id: 'CONSUMIDOR_FINAL' },
    })
    expect(canónico).not.toBeNull()
    expect(canónico?.nombre).toBe('Consumidor Final')
    expect(canónico?.activo).toBe(false)
  })
})
