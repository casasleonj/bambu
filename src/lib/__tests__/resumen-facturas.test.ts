// @tests totalizarResumen / conteosPorEstado — resumen consolidado de facturas (#758)
import { describe, it, expect } from 'vitest'
import {
  abonosNetosFactura,
  conteosPorEstado,
  detalleItemsFactura,
  encabezadoResumen,
  estadosDeResumen,
  fechaMasAntigua,
  totalizarResumen,
  type FacturaParaResumen,
} from '../resumen-facturas'

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
    expect(detalleItemsFactura([], 40_000)).toEqual({ items: [], pendientes: [], pendienteMonto: 0, otrosAjustes: 40_000 })
  })

  it('muestra solo lo ENTREGADO por línea y deja lo pendiente aparte (no se cobra en el detalle)', () => {
    const r = detalleItemsFactura(
      [item('PACA_AGUA', 10, 6_000, 60_000, 4), item('BOTELLON', 2, 15_000, 30_000, 0)],
      90_000,
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ producto: 'PACA_AGUA', cantidad: 4, cantPedida: 10, precio: 6_000, subtotal: 24_000 })
    expect(r.pendientes.map((p) => [p.producto, p.cantidad])).toEqual([['PACA_AGUA', 6], ['BOTELLON', 2]])
    expect(r.pendienteMonto).toBe(66_000)
    expect(r.otrosAjustes).toBe(0)
  })

  it('el valor entregado de una parcial usa el precio con sus decimales (sin redondear antes de multiplicar)', () => {
    const r = detalleItemsFactura([item('BOLSA_HIELO', 3, 3_333.333333, 10_000, 2)], 10_000)
    expect(r.items[0].subtotal).toBe(6_666.67)
    expect(r.pendienteMonto).toBe(3_333.33)
  })
})

describe('estadosDeResumen / encabezadoResumen (#977)', () => {
  it('«Por cobrar» = emitidas + parciales; «Todas» = vigentes sin anuladas', () => {
    expect(estadosDeResumen('POR_COBRAR')).toEqual(['EMITIDA', 'PARCIAL'])
    expect(estadosDeResumen('TODAS')).toEqual(['EMITIDA', 'PARCIAL', 'PAGADA'])
    expect(estadosDeResumen(undefined)).toEqual(['EMITIDA', 'PARCIAL', 'PAGADA'])
    expect(estadosDeResumen('ANULADA')).toEqual(['ANULADA'])
  })

  const totales = { total: 700_000, totalPagado: 280_000, saldo: 420_000, count: 20 }
  const anuladas = { count: 4, totalHistorico: 140_000 }

  it('«Por cobrar» no mezcla pagado ni facturado: solo saldo, cantidad y la más antigua', () => {
    const e = encabezadoResumen('POR_COBRAR', { ...totales, count: 15 }, anuladas, '2026-04-04')
    expect(e).toMatchObject({ etiqueta: 'Saldo que se debe', monto: 420_000, tono: 'debe' })
    expect(e.datos.map((d) => d.etiqueta)).toEqual(['Facturas por cobrar', 'La más antigua'])
    expect(JSON.stringify(e)).not.toMatch(/Pagado|Facturado/)
  })

  it('«Pagadas» muestra solo el total pagado en esas facturas, sin deuda', () => {
    const e = encabezadoResumen('PAGADA', { total: 200_000, totalPagado: 200_000, saldo: 0, count: 5 }, anuladas, null)
    expect(e).toMatchObject({ etiqueta: 'Total pagado en estas facturas', monto: 200_000, tono: 'alDia' })
  })

  it('«Anuladas» muestra el importe histórico como neutro', () => {
    const e = encabezadoResumen('ANULADA', { total: 0, totalPagado: 0, saldo: 0, count: 0 }, anuladas, null)
    expect(e).toMatchObject({ monto: 140_000, tono: 'neutro' })
  })

  it('«Todas» sí lleva facturado y pagado: es el estado de cuenta completo', () => {
    const e = encabezadoResumen('TODAS', totales, anuladas, null)
    expect(e.datos.map((d) => d.etiqueta)).toEqual(['Facturado', 'Pagado'])
  })

  it('«Por cobrar» sin saldo dice que está al día', () => {
    const e = encabezadoResumen('POR_COBRAR', { total: 0, totalPagado: 0, saldo: 0, count: 0 }, anuladas, null)
    expect(e.tono).toBe('alDia')
    expect(e.nota).toBe('Todo al día. No hay saldo pendiente.')
  })

  it('fechaMasAntigua ignora anuladas y facturas sin saldo', () => {
    expect(
      fechaMasAntigua([
        { fecha: '2026-03-01', estado: 'ANULADA', saldo: 0 },
        { fecha: '2026-04-04', estado: 'EMITIDA', saldo: 60_000 },
        { fecha: '2026-03-10', estado: 'PAGADA', saldo: 0 },
        { fecha: '2026-05-01', estado: 'PARCIAL', saldo: 10 },
      ]),
    ).toBe('2026-04-04')
    expect(fechaMasAntigua([])).toBeNull()
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
