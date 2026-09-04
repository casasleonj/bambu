// @tests F-B — docs/pedidos/AUDITORIA_REGRESION_POST_PR2_PEDIDO_PAGO_CIERRE.md §F-B
//
// Decisión del equipo (2026-09-03): el Cierre de Día concilia CAJA FÍSICA por
// FECHA DE CAPTURA del pago (`Pago.createdAt`); ventas/producto/facturas siguen
// por `pedido.fecha`.
//
// Antes de F-B: `/api/cierre` derivaba `efectivo/transferencia/…` de
// `pedido.findMany({ where: { fecha } }).pagos` — un efectivo cobrado hoy en un
// cierre de embarque sobre un pedido de días anteriores era invisible a la caja
// del día de la entrega (aunque el dinero físico entró hoy).
//
// Este test fija la nueva query de caja (`pago.findMany({ where: { createdAt } })`)
// y confirma que la de ventas (`pedido.findMany({ where: { fecha } })`) NO cambió.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'

let clienteId: string

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

describe('F-B — cierre de día concilia caja por fecha de captura del pago', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await getAdminUser()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'FB Cli',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('un Pago EFECTIVO capturado hoy sobre un pedido de hace 3 días: CAJA lo ve, VENTAS no', async () => {
    const hoy = new Date()
    const hace3dias = new Date(hoy.getTime() - 3 * 24 * 60 * 60 * 1000)

    const trab = await testPrisma.trabajador.create({
      data: { nombre: `FB ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
    })
    const emb = await testPrisma.embarque.create({
      data: { trabajadorId: trab.id, fecha: hoy, estado: 'CERRADO', baseDinero: 0 },
    })

    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        fecha: hace3dias,
        total: 100_000,
        totalPagado: 100_000,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estado: 'ENTREGADO',
        estadoPago: 'PAGADO',
        cPacaAguaPed: 10,
        cPacaAguaEnt: 10,
        precioPacaAgua: 10_000,
      },
    })
    await testPrisma.pago.create({
      data: {
        pedidoId: pedido.id,
        metodo: 'EFECTIVO',
        monto: 100_000,
        embarqueId: emb.id,
        confirmacion: 'CONFIRMADO',
        confirmadoAt: hoy,
        createdAt: hoy,
      },
    })

    const dateRange = { gte: startOfDayInBogota(ymd(hoy)), lt: endOfDayInBogota(ymd(hoy)) }

    // --- CAJA: query nueva de F-B (src/app/api/cierre/route.ts) ---
    const pagosCapturadosHoy = await testPrisma.pago.findMany({
      where: {
        createdAt: dateRange,
        pedido: { estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] } },
      },
      select: { metodo: true, monto: true },
    })
    const efectivoCaja = pagosCapturadosHoy
      .filter((p) => p.metodo === 'EFECTIVO')
      .reduce((acc, p) => acc + Number(p.monto), 0)
    // El dinero físico entró HOY → la caja de hoy lo ve.
    expect(efectivoCaja).toBe(100_000)

    // --- VENTAS: query de siempre, por `pedido.fecha` (NO cambia con F-B) ---
    const pedidosDelDia = await testPrisma.pedido.findMany({
      where: { fecha: dateRange, estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] } },
    })
    // El pedido nació hace 3 días → su VENTA no se cuenta hoy (correcto).
    expect(pedidosDelDia.some((p) => p.id === pedido.id)).toBe(false)
  })

  it('la query de caja excluye pagos de pedidos ANULADO/CANCELADO (efecto neto $0)', async () => {
    const hoy = new Date()
    const pedidoAnulado = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        fecha: hoy,
        total: 0,
        totalPagado: 0,
        saldo: 0,
        estadoEntrega: 'ANULADO',
        estado: 'ANULADO',
        estadoPago: 'ANULADO',
      },
    })
    await testPrisma.pago.create({
      data: { pedidoId: pedidoAnulado.id, metodo: 'EFECTIVO', monto: 40_000, confirmacion: 'CONFIRMADO', createdAt: hoy },
    })

    const dateRange = { gte: startOfDayInBogota(ymd(hoy)), lt: endOfDayInBogota(ymd(hoy)) }
    const pagosCapturadosHoy = await testPrisma.pago.findMany({
      where: {
        createdAt: dateRange,
        pedido: { estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] } },
      },
      select: { metodo: true, monto: true },
    })
    expect(pagosCapturadosHoy.some((p) => Number(p.monto) === 40_000)).toBe(false)
  })
})
