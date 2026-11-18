// @tests totalizarResumen / conteosPorEstado — resumen consolidado de facturas (#758)
import { describe, it, expect } from 'vitest'
import { abonosNetosFactura, conteosPorEstado, detalleItemsFactura, totalizarResumen, type FacturaParaResumen } from '../resumen-facturas'

const f = (estado: FacturaParaResumen['estado'], total: number, montoPagado: number): FacturaParaResumen => ({
  estado,
  total,
  montoPagado,
  saldo: estado === 'ANULADA' ? 0 : total - montoPagado,
})

describe('totalizarResumen', () => {
  it('suma solo las vigentes; las anuladas van aparte aunque conserven montoPagado histórico', () => {
    const { totales, anuladas } = totalizarResumen([
      f('PAGADA', 120_000, 120_000),
      f('PARCIAL', 85_000, 40_000),
      f('EMITIDA', 60_000, 0),
      f('ANULADA', 50_000, 20_000),
    ])
    expect(totales).toEqual({ total: 265_000, totalPagado: 160_000, saldo: 105_000, count: 3 })
    expect(anuladas).toEqual({ count: 1, totalHistorico: 50_000 })
  })

  it('con solo anuladas los totales vigentes quedan en cero', () => {
    const { totales, anuladas } = totalizarResumen([f('ANULADA', 50_000, 0), f('ANULADA', 10_000, 10_000)])
    expect(totales).toEqual({ total: 0, totalPagado: 0, saldo: 0, count: 0 })
    expect(anuladas).toEqual({ count: 2, totalHistorico: 60_000 })
  })

  it('sin facturas devuelve ceros', () => {
    const { totales, anuladas } = totalizarResumen([])
    expect(totales.count).toBe(0)
    expect(anuladas.count).toBe(0)
  })

  it('el saldo de cada factura es el que viene, no se recalcula (el saldo manda)', () => {
    const { totales } = totalizarResumen([{ estado: 'PARCIAL', total: 100, montoPagado: 30, saldo: 70 }])
    expect(totales.saldo).toBe(70)
  })
})

describe('conteosPorEstado', () => {
  it('completa con 0 los estados ausentes', () => {
    expect(conteosPorEstado([{ estado: 'PAGADA', count: 3 }])).toEqual({
      EMITIDA: 0,
      PARCIAL: 0,
      PAGADA: 3,
      ANULADA: 0,
    })
  })
})

describe('detalleItemsFactura (#867)', () => {
  const item = (producto: string, cantPedido: number, precio: number, subtotal: number, cantEntrega = cantPedido) => ({
    producto,
    cantPedido,
    cantEntrega,
    precio,
    subtotal,
  })

  it('usa las etiquetas del catálogo y la suma de subtotales cuadra con el total', () => {
    const { items, otrosAjustes } = detalleItemsFactura(
      [item('PACA_AGUA', 10, 6_000, 60_000), item('BOTELLON', 4, 15_000, 60_000)],
      120_000,
    )
    expect(items.map((i) => i.etiqueta)).toEqual(['Paca Agua', 'Botellón'])
    expect(items.map((i) => i.cantidad)).toEqual([10, 4])
    expect(otrosAjustes).toBe(0)
  })

  it('si no cuadra informa la diferencia como otros ajustes (nunca una cifra que no suma)', () => {
    expect(detalleItemsFactura([item('PACA_AGUA', 10, 6_000, 60_000)], 65_000).otrosAjustes).toBe(5_000)
    expect(detalleItemsFactura([item('PACA_AGUA', 10, 6_000, 60_000)], 55_000).otrosAjustes).toBe(-5_000)
  })

  it('el subtotal sale de la BD y no se recalcula con cantidad × precio', () => {
    const { items } = detalleItemsFactura([item('BOLSA_HIELO', 3, 3_333.333333, 10_000)], 10_000)
    expect(items[0].subtotal).toBe(10_000)
  })

  it('omite ítems sin cantidad y conserva un código desconocido tal cual', () => {
    const { items } = detalleItemsFactura([item('PACA_AGUA', 0, 6_000, 0), item('NUEVO', 2, 1_000, 2_000)], 2_000)
    expect(items).toHaveLength(1)
    expect(items[0].etiqueta).toBe('NUEVO')
  })

  it('sin ítems devuelve la lista vacía y todo el total como ajuste', () => {
    expect(detalleItemsFactura([], 40_000)).toEqual({ items: [], otrosAjustes: 40_000 })
  })
})

describe('abonosNetosFactura (#845)', () => {
  const d = (iso: string) => new Date(`${iso}T15:00:00Z`)

  it('devuelve los abonos en orden cuando suman lo pagado', () => {
    const r = abonosNetosFactura(
      [{ fecha: d('2026-11-09'), monto: 10_000, revertido: 0 }, { fecha: d('2026-11-08'), monto: 30_000, revertido: 0 }],
      40_000,
    )
    expect(r?.map((a) => a.monto)).toEqual([30_000, 10_000])
  })

  it('descuenta lo revertido y omite el abono reversado del todo', () => {
    const r = abonosNetosFactura(
      [
        { fecha: d('2026-11-08'), monto: 30_000, revertido: 10_000 },
        { fecha: d('2026-11-09'), monto: 5_000, revertido: 5_000 },
      ],
      20_000,
    )
    expect(r?.map((a) => a.monto)).toEqual([20_000])
  })

  it('si no cuadra con montoPagado devuelve null: solo se muestra el total', () => {
    expect(abonosNetosFactura([{ fecha: d('2026-11-08'), monto: 30_000, revertido: 0 }], 40_000)).toBeNull()
  })

  it('sin abonos y sin pagado devuelve lista vacía', () => {
    expect(abonosNetosFactura([], 0)).toEqual([])
  })
})
