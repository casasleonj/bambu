// @tests #511/#513: comportamiento del resumen compartido de GET y POST.
// Sustituye comprobaciones regex del código por resultados y contratos de consulta.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { construirResumenCierre } from '@/lib/cierre-resumen'

vi.mock('@/lib/comision-pagada', () => ({ comisionesDelCierre: vi.fn(async () => ({ sellador: 0, pagadoRepartidores: 0, total: 0, repartidores: [] })) }))
vi.mock('@/lib/cobro-cartera', () => ({ resumirAbonosDelDia: vi.fn(async () => ({ total: 0, totalEfectivo: 0, abonosIndependientes: 0, ajustesDeCobros: 0 })) }))
vi.mock('@/lib/sueldos-pendientes', () => ({ sueldosPendientesAl: vi.fn(async () => []) }))
const pedido = { fecha: new Date('2026-03-10T17:00:00Z') } // #631: la fecha del pedido separa ventas de hoy y fiados anteriores
const pagos = [
  { metodo: 'EFECTIVO', monto: '123.10', pedido }, { metodo: 'TRANSFERENCIA', monto: '234.20', pedido },
  { metodo: 'NEQUI', monto: '345.30', pedido }, { metodo: 'DAVIPLATA', monto: '456.40', pedido }, { metodo: 'BONO', monto: '567.00', pedido },
]
const pagoFind = vi.fn()
const ventas = [{ id: 'venta-sintetica', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', total: 500, totalPagado: 120, saldo: 380, cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }]
const tx = {
  embarque: { findMany: vi.fn(async () => []) },
  pedido: { findMany: vi.fn(async ({ where }: { where: { estadoEntrega: unknown } }) => typeof where.estadoEntrega === 'string' ? [] : ventas), groupBy: vi.fn(async () => []) },
  produccion: { findMany: vi.fn(async () => []) },
  cierreDia: { findFirst: vi.fn(async () => null) },
  config: { findMany: vi.fn(async () => []) },
  gasto: { aggregate: vi.fn(async () => ({ _sum: { monto: 0 } })), groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
  notaCredito: { findMany: vi.fn(async () => []) }, factura: { findMany: vi.fn(async () => []) },
  cliente: { count: vi.fn(async () => 0) }, descuentoRepartidor: { findMany: vi.fn(async () => []) },
  pago: { findMany: pagoFind, aggregate: vi.fn(async () => ({ _count: 0, _sum: { monto: 0 } })) },
} as unknown as Prisma.TransactionClient

beforeEach(() => {
  vi.clearAllMocks()
  pagoFind.mockImplementation(async ({ where }: { where: { confirmacion?: string } }) => where.confirmacion ? [] : pagos)
})

describe('cierre: ventas y caja mantienen sus fuentes', () => {
  it('suma cuatro medios de dinero nuevo y conserva BONO como crédito aplicado', async () => {
    const { cierre } = await construirResumenCierre(tx, '2026-03-10')
    expect(cierre).toMatchObject({ efectivo: 123.1, transferencia: 234.2, nequi: 345.3, daviplata: 456.4, bono: 567, cobrado: 120, totalVentas: 500, fiado: 380 })
    // El BONO de 567 se conserva en el detalle, pero no entró dinero de nuevo.
    expect(cierre.cobroVentasHoy).toBeCloseTo(1159, 2)
    expect(cierre.cobroDigitalHoy).toBeCloseTo(1035.9, 2)
    // #631: el desglose explica la misma cifra (todo es venta de hoy) y cuadra.
    expect(cierre.desgloseCobros.total).toBeCloseTo(1159, 2)
    expect(cierre.desgloseCobros.digital).toBeCloseTo(1035.9, 2)
    expect(cierre.desgloseCobros.ventasHoy.porMetodo).toEqual({ TRANSFERENCIA: 234.2, NEQUI: 345.3, DAVIPLATA: 456.4 })
    expect(cierre.desgloseCobros.cuadra).toBe(true)
  })
  it('consulta los cobros por registro en Bogotá con límite exclusivo del día siguiente', async () => {
    await construirResumenCierre(tx, '2026-03-10')
    expect(pagoFind).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: new Date('2026-03-10T05:00:00Z'), lt: new Date('2026-03-11T05:00:00Z') },
        regularizacionId: null, pedido: { estadoEntrega: { notIn: ['CANCELADO', 'ANULADO'] } },
      }, select: { metodo: true, monto: true, pedido: { select: { fecha: true } } },
    })
  })
  it('no inventa cobros cuando no hay movimientos de pago', async () => {
    pagoFind.mockResolvedValue([])
    const { cierre } = await construirResumenCierre(tx, '2026-03-10')
    expect(cierre.cobroVentasHoy).toBe(0)
    expect(cierre.cobrado).toBe(120)
  })
})
