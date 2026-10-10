// @tests CrearPedidoUseCase — integridad del cobro en ventas anónimas (P0)
// Incidentes cubiertos (docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md):
//   §1  — el Hub creaba ventas anónimas entregadas sin Pago y el servidor
//         aceptaba dejar saldo a cargo de CONSUMIDOR_FINAL.
//   §11 — el cambio de una venta anónima se acreditaba como saldo a favor del
//         canónico y la venta siguiente lo consumía: su Pago quedaba por
//         `total − cambio` aunque se cobró completo.
// Verifica contra Postgres real (no mocks):
//   1. CF sin pago → DEUDOR_REQUERIDO y no se persiste nada.
//   2. CF con pago parcial → DEUDOR_REQUERIDO.
//   3. CF pagado con billete mayor, dos veces seguidas → cada Pago = total,
//      PAGADO, saldo 0, y el canónico nunca acumula saldo a favor.
//   4. Un cliente real sí puede quedar con saldo (no se rompe el fiado).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
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

describe('CrearPedidoUseCase — cobro de ventas anónimas (P0)', () => {
  let useCase: CrearPedidoUseCase
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
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
      resolverCoordsDeLink,
      new GetFiadoStatusUseCase(new PrismaPedidoRepository(), new PrismaClienteRepository()),
    )
  })

  const ventaAnonima = (pagos: Array<{ metodo: 'EFECTIVO' | 'NEQUI'; monto: number }>, tag: string) => ({
    clienteId: 'CONSUMIDOR_FINAL',
    canal: 'PUNTO' as const,
    origen: 'VENTA_RAPIDA' as const,
    items: [{ producto: 'PACA_AGUA' as const, cantidad: 2 }],
    pagos,
    createdById: adminId,
    createdByRole: 'ADMIN' as const,
    offlineId: uniqueId(tag),
  })

  it('venta anónima sin pago → DEUDOR_REQUERIDO y no persiste el pedido', async () => {
    const input = ventaAnonima([], 'cf-sin-pago')
    await expect(useCase.execute(input)).rejects.toThrow('DEUDOR_REQUERIDO')
    const persistido = await testPrisma.pedido.findFirst({ where: { offlineId: input.offlineId } })
    expect(persistido).toBeNull()
  })

  it('venta anónima con pago parcial → DEUDOR_REQUERIDO', async () => {
    await expect(useCase.execute(ventaAnonima([{ metodo: 'EFECTIVO', monto: 1 }], 'cf-parcial')))
      .rejects.toThrow('DEUDOR_REQUERIDO')
  })

  it('billete mayor al total, dos ventas seguidas → cada Pago = total y CF sin saldo a favor', async () => {
    for (const tag of ['cf-billete-1', 'cf-billete-2']) {
      const r = await useCase.execute(ventaAnonima([{ metodo: 'EFECTIVO', monto: 50_000 }], tag))
      const pedido = await testPrisma.pedido.findUniqueOrThrow({
        where: { id: r.pedido.id },
        include: { pagos: true },
      })
      const total = Number(pedido.total)
      expect(total).toBeGreaterThan(0)
      expect(pedido.estadoPago).toBe('PAGADO')
      expect(Number(pedido.saldo)).toBe(0)
      expect(Number(pedido.totalPagado)).toBe(total)
      expect(pedido.pagos).toHaveLength(1)
      expect(Number(pedido.pagos[0].monto)).toBe(total)
      expect(pedido.pagos[0].metodo).toBe('EFECTIVO')

      const cf = await testPrisma.cliente.findUniqueOrThrow({ where: { id: 'CONSUMIDOR_FINAL' } })
      expect(Number(cf.saldoFavor)).toBe(0)
    }
  })

  it('pago combinado en venta anónima → un Pago por método, suma = total', async () => {
    // precio de lista: se lee del primer resultado para no acoplarse al seed.
    const probe = await useCase.execute(ventaAnonima([{ metodo: 'EFECTIVO', monto: 50_000 }], 'cf-probe'))
    const total = probe.pedido.total
    const parteNequi = Math.floor(total / 2)
    const r = await useCase.execute(ventaAnonima([
      { metodo: 'NEQUI', monto: parteNequi },
      { metodo: 'EFECTIVO', monto: total - parteNequi },
    ], 'cf-combinado'))
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: r.pedido.id } })
    expect(pagos).toHaveLength(2)
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(total)
  })

  it('cliente real puede quedar con saldo (el fiado no se rompe)', async () => {
    const cliente = await testPrisma.cliente.create({
      data: { nombre: 'Cliente', apellido: uniqueId('fiado'), telefono: uniqueId('tel').slice(-10) },
    })
    const r = await useCase.execute({
      clienteId: cliente.id,
      canal: 'PUNTO',
      origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
      createdById: adminId,
      createdByRole: 'ADMIN',
      offlineId: uniqueId('real-fiado'),
    })
    const pedido = await testPrisma.pedido.findUniqueOrThrow({ where: { id: r.pedido.id } })
    expect(Number(pedido.saldo)).toBeGreaterThan(0)
  })
})
