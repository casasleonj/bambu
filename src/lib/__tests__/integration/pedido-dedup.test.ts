// @tests CrearPedidoUseCase — dedup por offlineId (F-N10)
// CRÍTICO: dos requests con el mismo offlineId deben producir UN SOLO
// pedido. El segundo debe retornar deduped: true, no chocar con P2002
// ni crear duplicado.
// Verifica:
//   1. Mismo offlineId × 2 → 1 fila en DB, segundo retorna deduped: true
//   2. Sin offlineId → IDs distintos
//   3. offlineId distintos → IDs distintos
//   4. 10 llamadas paralelas mismo offlineId → 1 fila, 9 deduped
//   5. Unique constraint en Pedido.offlineId existe (defensa en DB)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  uniqueId,
} from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

describe('CrearPedidoUseCase — dedup por offlineId', () => {
  let useCase: CrearPedidoUseCase
  let clienteId: string
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    // Crear cliente con limitePedidosFiados alto (20) para evitar el
    // chequeo "ya tiene 3 fiados" del seed.
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Dedup',
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

  it('dos llamadas con el mismo offlineId producen 1 pedido, segundo retorna deduped: true', async () => {
    const offlineId = uniqueId('offline-dedup')

    const result1 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [],
      offlineId,
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    expect(result1.pedido).toBeDefined()
    expect(result1.deduped).toBeFalsy()
    const pedido1Id = result1.pedido.id

    const result2 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [],
      offlineId,
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    expect(result2.deduped).toBe(true)
    expect(result2.pedido.id).toBe(pedido1Id)

    const count = await testPrisma.pedido.count({ where: { offlineId } })
    expect(count).toBe(1)
  })

  it('dos llamadas SIN offlineId crean dos pedidos distintos', async () => {
    const r1 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_HIELO', cantidad: 1 }],
      pagos: [],
      createdById: adminId,
      createdByRole: 'ADMIN',
    })
    const r2 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_HIELO', cantidad: 1 }],
      pagos: [],
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    expect(r1.pedido.id).not.toBe(r2.pedido.id)
    expect(r1.deduped).toBeFalsy()
    expect(r2.deduped).toBeFalsy()
  })

  it('dos llamadas con offlineId DIFERENTE crean dos pedidos distintos', async () => {
    const r1 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'BOLSA_AGUA', cantidad: 5 }],
      pagos: [],
      offlineId: uniqueId('offline-A'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })
    const r2 = await useCase.execute({
      clienteId,
      canal: 'DOMICILIO',
      items: [{ producto: 'BOLSA_AGUA', cantidad: 5 }],
      pagos: [],
      offlineId: uniqueId('offline-B'),
      createdById: adminId,
      createdByRole: 'ADMIN',
    })

    expect(r1.pedido.id).not.toBe(r2.pedido.id)
    expect(r1.deduped).toBeFalsy()
    expect(r2.deduped).toBeFalsy()
  })

  it('10 llamadas paralelas con el MISMO offlineId → 1 pedido, 9 deduped', async () => {
    const offlineId = uniqueId('offline-parallel')

    const promises = Array.from({ length: 10 }, () =>
      useCase.execute({
        clienteId,
        canal: 'DOMICILIO',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [],
        offlineId,
        createdById: adminId,
        createdByRole: 'ADMIN',
      }),
    )

    const results = await Promise.all(promises)

    const ids = new Set(results.map((r) => r.pedido.id))
    expect(ids.size).toBe(1)

    const dedupedCount = results.filter((r) => r.deduped).length
    expect(dedupedCount).toBe(9)

    const count = await testPrisma.pedido.count({ where: { offlineId } })
    expect(count).toBe(1)
  })

  it('Pedido.offlineId tiene unique constraint (defensa en DB)', async () => {
    // Verifica la red de seguridad a nivel de DB.
    // Prisma genera UNIQUE INDEX (no constraint) para @unique a nivel de campo.
    // El nombre es "Pedido_offlineId_key".
    const indexes = await testPrisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'Pedido'
        AND indexdef LIKE '%UNIQUE INDEX%'
        AND (indexname LIKE '%offline%' OR indexname LIKE '%envio%')
    `
    expect(indexes.length).toBeGreaterThan(0)

    // Verificar que la unique constraint REALMENTE rechaza duplicados.
    // Insertar un pedido con un offlineId, después intentar otro con
    // el mismo. El segundo debe fallar.
    const dedupId = uniqueId('unique-test')
    await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        offlineId: dedupId,
      },
    })
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId,
          canal: 'DOMICILIO',
          offlineId: dedupId,
        },
      }),
    ).rejects.toThrow()

    // Cleanup
    await testPrisma.pedido.delete({ where: { offlineId: dedupId } })
  })
})
