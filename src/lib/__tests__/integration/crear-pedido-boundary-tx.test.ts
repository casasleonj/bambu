// @tests CrearPedidoUseCase — boundary transaccional bajo SECUENCIA:pedido.
// Si la creación del pedido hace rollback DESPUÉS de actualizar la dirección
// del cliente (ej. CLIENTE_DEBE por la Autoridad de Crédito), no debe quedar
// ningún rastro: ni el UPDATE de Cliente ni su fila de Historial. Antes, la
// auditoría de `updateDireccion` se escribía con el prisma global en auto-commit
// (fuera de la tx) y sobrevivía al rollback.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Mismo mock que pedido-dedup.test.ts: getConfig usa unstable_cache, que
// requiere un incrementalCache que solo existe dentro de un request de Next.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'

describe('CrearPedidoUseCase — rollback no deja auditoría huérfana de dirección', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('Admin user not found')
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('CLIENTE_DEBE después de updateDireccion → ni UPDATE ni Historial persisten', async () => {
    // Cliente bloqueado: la Autoridad de Crédito rechaza cualquier operación
    // que deje saldo pendiente, y ese chequeo corre DESPUÉS de updateDireccion.
    const cliente = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Boundary Tx',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Direccion Original',
        barrio: 'Barrio Original',
        activo: true,
        bloqueado: true,
      },
    })

    const useCase = new CrearPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PrismaClienteRepository(),
      new PrismaPricingAdapter(),
      new PrismaTransactionManager(),
      resolverCoordsDeLink,
      new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository()),
    )

    await expect(
      useCase.execute({
        clienteId: cliente.id,
        canal: 'PUNTO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [], // sin pago → queda saldo → CLIENTE_DEBE
        actualizarCliente: { direccion: 'Direccion Nueva', barrio: 'Barrio Nuevo' },
        offlineId: uniqueId('offline-boundary'),
        createdById: adminId,
        createdByRole: 'ADMIN',
      }),
    ).rejects.toThrow(/CLIENTE_DEBE/)

    // Antes del fix, la auditoría fire-and-forget podía aterrizar un instante
    // después del rollback: se da margen para no dar un falso verde.
    await new Promise((r) => setTimeout(r, 300))

    const despues = await testPrisma.cliente.findUnique({ where: { id: cliente.id } })
    expect(despues?.direccion).toBe('Direccion Original')
    expect(despues?.barrio).toBe('Barrio Original')

    const auditorias = await testPrisma.historial.count({
      where: { entidad: 'Cliente', registroId: cliente.id },
    })
    expect(auditorias).toBe(0)
  })
})
