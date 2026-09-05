// @tests ADR-CORRECCION-MONETARIA-001 D.4 (cierra F7) — anular/cancelar un
// pedido pagado emite una ReceivableEntry tipo REVERSION por lo cobrado, en la
// misma tx. Las filas Pago NO se borran. Suma PAGO - REVERSION = 0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getSeededCliente, uniqueId } from './setup'
import { AnularPedidoUseCase } from '@/modules/pedidos/application/use-cases/AnularPedidoUseCase'
import { CancelarPedidoUseCase } from '@/modules/pedidos/application/use-cases/CancelarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

let clienteId: string

async function pedidoPagado(estado: 'ENTREGADO' | 'PENDIENTE', pagado: number) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: estado,
      estado: estado,
      // chk_pedido_estadopago_proyectado: pagado completo + PENDIENTE (aún
      // no entregado) → ANTICIPADO, no PAGADO.
      estadoPago: calcularEstadoPago(20000, pagado, estado),
      total: 20000,
      totalPagado: pagado,
      saldo: 20000 - pagado,
    },
  })
  await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: pagado } })
  await testPrisma.receivableEntry.create({
    data: { pedidoId: pedido.id, clienteId, tipo: 'PAGO', monto: pagado, saldoResultante: 20000 - pagado, totalPagadoResultante: pagado },
  })
  return pedido
}

async function sumaPorTipo(pedidoId: string) {
  const entries = await testPrisma.receivableEntry.findMany({ where: { pedidoId } })
  const pago = entries.filter(e => e.tipo === 'PAGO').reduce((s, e) => s + Number(e.monto), 0)
  const reversion = entries.filter(e => e.tipo === 'REVERSION').reduce((s, e) => s + Number(e.monto), 0)
  return { pago, reversion, neto: pago - reversion }
}

function anularUC() {
  return new AnularPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaNotaCreditoRepository(),
    new PrismaTransactionManager(),
  )
}
function cancelarUC() {
  return new CancelarPedidoUseCase(
    new PrismaPedidoRepository(),
    new PrismaFacturaRepository(),
    new PrismaNotaCreditoRepository(),
    new PrismaTransactionManager(),
  )
}

describe('anular/cancelar pedido pagado → ReceivableEntry REVERSION (D.4)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('ANULAR: emite REVERSION por totalPagado; Pago intacto; PAGO - REVERSION = 0', async () => {
    const pedido = await pedidoPagado('ENTREGADO', 15000)
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'error de facturación', offlineId: uniqueId('an') })

    const s = await sumaPorTipo(pedido.id)
    expect(s.reversion).toBe(15000)
    expect(s.neto).toBe(0)

    const pagos = await testPrisma.pago.count({ where: { pedidoId: pedido.id } })
    expect(pagos).toBe(1) // NO se borra

    const post = await testPrisma.pedido.findUnique({ where: { id: pedido.id } })
    expect(post?.estadoEntrega).toBe('ANULADO')
    expect(Number(post?.totalPagado)).toBe(0)
  })

  it('CANCELAR: idem para un pedido PENDIENTE prepago', async () => {
    const pedido = await pedidoPagado('PENDIENTE', 20000)
    await cancelarUC().execute({ pedidoId: pedido.id, motivo: 'cliente desistió', offlineId: uniqueId('ca') })

    const s = await sumaPorTipo(pedido.id)
    expect(s.reversion).toBe(20000)
    expect(s.neto).toBe(0)
  })

  it('pedido SIN pagos: no emite REVERSION', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
        estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PENDIENTE',
        total: 20000, totalPagado: 0, saldo: 20000,
      },
    })
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'x', offlineId: uniqueId('an0') })
    const rev = await testPrisma.receivableEntry.count({ where: { pedidoId: pedido.id, tipo: 'REVERSION' } })
    expect(rev).toBe(0)
  })

  it('pago SIN ReceivableEntry PAGO (estilo cierre/import): no emite REVERSION (neto ya 0)', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'VENTA_LIBRE',
        estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO',
        total: 20000, totalPagado: 20000, saldo: 0,
      },
    })
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 20000 } })
    // deliberadamente SIN receivableEntry
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'x', offlineId: uniqueId('an-cierre') })
    const rev = await testPrisma.receivableEntry.count({ where: { pedidoId: pedido.id, tipo: 'REVERSION' } })
    expect(rev).toBe(0)
    // el Pago sigue existiendo
    expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(1)
  })

  it('reversión parcial previa (corrección de abono): la REVERSION de anular cubre solo el neto restante', async () => {
    const pedido = await pedidoPagado('ENTREGADO', 15000)
    // simula una corrección de abono previa: REVERSION de 5000 ya registrada
    await testPrisma.receivableEntry.create({
      data: { pedidoId: pedido.id, clienteId, tipo: 'REVERSION', monto: 5000, saldoResultante: 10000, totalPagadoResultante: 10000 },
    })
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'x', offlineId: uniqueId('an-parcial') })
    const s = await sumaPorTipo(pedido.id)
    // PAGO 15000 - (REVERSION 5000 previa + REVERSION 10000 de anular) = 0
    expect(s.neto).toBe(0)
    expect(s.reversion).toBe(15000)
  })

  it('ANULAR idempotente (mismo offlineId): NO duplica la REVERSION', async () => {
    const pedido = await pedidoPagado('ENTREGADO', 12000)
    const off = uniqueId('an-idem')
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'x', offlineId: off })
    await anularUC().execute({ pedidoId: pedido.id, motivo: 'x', offlineId: off })
    const rev = await testPrisma.receivableEntry.count({ where: { pedidoId: pedido.id, tipo: 'REVERSION' } })
    expect(rev).toBe(1)
  })
})
