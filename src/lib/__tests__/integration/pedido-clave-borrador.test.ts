// @tests CrearPedidoUseCase — clave de idempotencia por borrador (plan de integridad v1.2 §5.B)
// Incidente: #285/#286 y #288/#289 — la misma venta registrada dos veces.
// El formulario ahora reusa la MISMA clave (offlineId) en cada reintento del
// borrador; acá se verifica contra Postgres real que N envíos concurrentes con
// esa clave dejan UN pedido, UN pago y UNA factura, y que los demás devuelven
// ese mismo pedido como deduplicado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId, getAdminUser } from './setup'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { resolverCoordsDeLink } from '@/lib/geo/resolver-coords-de-link'
import { GetFiadoStatusUseCase } from '@/modules/pedidos/application/use-cases/GetFiadoStatusUseCase'

describe('CrearPedidoUseCase — misma clave de borrador', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })

  afterAll(async () => {
    await disconnect()
  })

  const nuevoUseCase = () =>
    new CrearPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PrismaClienteRepository(),
      new PrismaPricingAdapter(),
      new PrismaTransactionManager(),
      resolverCoordsDeLink,
      new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository()),
    )

  it('3 envíos concurrentes con la misma clave → 1 pedido, 1 pago, 1 factura; 2 deduplicados', async () => {
    const clave = uniqueId('borrador')
    const input = {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO' as const,
      origen: 'VENTA_RAPIDA' as const,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 100000 }],
      createdById: adminId,
      createdByRole: 'ADMIN' as const,
      offlineId: clave,
    }

    const resultados = await Promise.all([1, 2, 3].map(() => nuevoUseCase().execute(input)))

    expect(resultados.filter((r) => r.deduped)).toHaveLength(2)
    const ids = new Set(resultados.map((r) => r.pedido.id))
    expect(ids.size).toBe(1)

    const pedidos = await testPrisma.pedido.findMany({ where: { offlineId: clave }, include: { pagos: true, factura: true } })
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].pagos).toHaveLength(1)
    expect(pedidos[0].factura).not.toBeNull()
  })

  it('un reintento posterior con la misma clave devuelve el mismo pedido sin crear otro', async () => {
    const clave = uniqueId('borrador-reintento')
    const input = {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO' as const,
      origen: 'VENTA_RAPIDA' as const,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 50000 }],
      createdById: adminId,
      createdByRole: 'ADMIN' as const,
      offlineId: clave,
    }
    const primero = await nuevoUseCase().execute(input)
    const reintento = await nuevoUseCase().execute(input)

    expect(primero.deduped).toBeFalsy()
    expect(reintento.deduped).toBe(true)
    expect(reintento.pedido.id).toBe(primero.pedido.id)
    expect(await testPrisma.pedido.count({ where: { offlineId: clave } })).toBe(1)
  })
})
