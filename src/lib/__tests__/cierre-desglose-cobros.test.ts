// @tests #631 — desglose de cobros por origen y medio, lista de fiados y detalle de pagos por confirmar (funciones puras).
import { describe, it, expect } from 'vitest'
import { desglosarCobros, listarFiadosDelDia, detallarPorConfirmar } from '../cierre-desglose-cobros'

const desde = new Date('2026-03-24T05:00:00Z')
const hasta = new Date('2026-03-25T05:00:00Z')
const hoy = new Date('2026-03-24T17:00:00Z')
const ayer = new Date('2026-03-23T17:00:00Z')
const sinAbonos = { abonosIndependientes: 0, ajustesDeCobros: 0, total: 0, totalEfectivo: 0 }

describe('#631 desglosarCobros', () => {
  it('separa ventas de hoy y fiados anteriores, y efectivo de digital por medio', () => {
    const d = desglosarCobros([
      { metodo: 'EFECTIVO', monto: 150000, pedidoFecha: hoy },
      { metodo: 'NEQUI', monto: 50000, pedidoFecha: hoy },
      { metodo: 'TRANSFERENCIA', monto: 30000, pedidoFecha: ayer },
      { metodo: 'EFECTIVO', monto: 10000, pedidoFecha: ayer },
    ], desde, hasta, sinAbonos, 240000)
    expect(d.ventasHoy).toEqual({ efectivo: 150000, digital: 50000, total: 200000, porMetodo: { NEQUI: 50000 } })
    expect(d.fiadosAnteriores).toEqual({ efectivo: 10000, digital: 30000, total: 40000, porMetodo: { TRANSFERENCIA: 30000 } })
    expect(d.efectivo).toBe(160000)
    expect(d.digital).toBe(80000)
    expect(d.total).toBe(240000)
    expect(d.cuadra).toBe(true)
  })

  it('#745: un BONO de hoy o de fiado anterior se conserva como crédito, no dinero digital', () => {
    const d = desglosarCobros([
      { metodo: 'BONO', monto: 8000, pedidoFecha: hoy },
      { metodo: 'BONO', monto: 4000, pedidoFecha: ayer },
      { metodo: 'NEQUI', monto: 3000, pedidoFecha: hoy },
      { metodo: 'EFECTIVO', monto: 1000, pedidoFecha: ayer },
    ], desde, hasta, sinAbonos, 4000)
    expect(d.ventasHoy).toEqual({ efectivo: 0, digital: 3000, total: 3000, porMetodo: { NEQUI: 3000 } })
    expect(d.fiadosAnteriores).toEqual({ efectivo: 1000, digital: 0, total: 1000, porMetodo: {} })
    expect(d.digital).toBe(3000)
    expect(d.efectivo).toBe(1000)
    expect(d.cuadra).toBe(true)
  })

  it('el límite del día es [desde, hasta): un pedido a las 00:00 de mañana es de otro día', () => {
    const manana = new Date(hasta)
    const d = desglosarCobros([{ metodo: 'EFECTIVO', monto: 5000, pedidoFecha: manana }], desde, hasta, sinAbonos, 5000)
    expect(d.ventasHoy.total).toBe(0)
    expect(d.fiadosAnteriores.efectivo).toBe(5000)
  })

  it('suma los abonos independientes netos de ajustes (efectivo y digital) y cuadra', () => {
    const d = desglosarCobros([{ metodo: 'EFECTIVO', monto: 1000, pedidoFecha: hoy }], desde, hasta,
      { abonosIndependientes: 30000, ajustesDeCobros: 5000, total: 25000, totalEfectivo: 20000 }, 26000)
    expect(d.abonos).toMatchObject({ efectivo: 20000, digital: 5000, total: 25000, independientes: 30000, ajustes: 5000 })
    expect(d.efectivo).toBe(21000)
    expect(d.digital).toBe(5000)
    expect(d.cuadra).toBe(true)
  })

  it('avisa la diferencia cuando no cuadra', () => {
    const d = desglosarCobros([{ metodo: 'EFECTIVO', monto: 650000, pedidoFecha: hoy }], desde, hasta, sinAbonos, 655000)
    expect(d.cuadra).toBe(false)
    expect(d.diferencia).toBe(-5000)
  })

  it('sin pagos todo es cero y no hay medios', () => {
    const d = desglosarCobros([], desde, hasta, sinAbonos, 0)
    expect(d.total).toBe(0)
    expect(d.cuadra).toBe(true)
    expect(d.ventasHoy.porMetodo).toEqual({})
  })

  it('no acumula error de punto flotante con centavos', () => {
    const d = desglosarCobros([
      { metodo: 'NEQUI', monto: 0.1, pedidoFecha: hoy }, { metodo: 'NEQUI', monto: 0.2, pedidoFecha: hoy },
    ], desde, hasta, sinAbonos, 0.3)
    expect(d.digital).toBe(0.3)
    expect(d.cuadra).toBe(true)
  })
})

describe('#631 listarFiadosDelDia', () => {
  const base = { clienteId: 'c1', total: 80000, totalPagado: 0, saldo: 80000, promesaPagoFecha: null }
  it('incluye pedidos con saldo (aunque pagaron una parte), ordena por número y formatea la promesa en hora de Bogotá', () => {
    const r = listarFiadosDelDia([
      { ...base, id: 'p2', numero: 2, cliente: { nombre: 'Pedro', apellido: 'Ruiz' }, totalPagado: 30000, saldo: 50000 },
      { ...base, id: 'p1', numero: 1, cliente: { nombre: 'Ana', apellido: null }, promesaPagoFecha: new Date('2026-11-13T04:00:00Z') },
      { ...base, id: 'p3', numero: 3, cliente: { nombre: 'Pagó', apellido: null }, totalPagado: 80000, saldo: 0 },
    ])
    expect(r.map(f => f.numero)).toEqual([1, 2])
    expect(r[0]).toMatchObject({ cliente: 'Ana', saldo: 80000, promesaPago: '2026-11-12' }) // 23:00 del 12 en Bogotá
    expect(r[1]).toMatchObject({ cliente: 'Pedro Ruiz', pagado: 30000, saldo: 50000, promesaPago: null })
  })
})

describe('#631 detallarPorConfirmar', () => {
  it('trae pedido, cliente, factura (o null) y fecha ISO', () => {
    const r = detallarPorConfirmar([{
      id: 'g1', metodo: 'NEQUI', monto: 90000, createdAt: new Date('2026-11-05T15:42:00Z'),
      pedido: { id: 'p1', numero: 1042, cliente: { id: 'c1', nombre: 'Tienda', apellido: 'La Esperanza' }, factura: { numero: 'F-0318' } },
    }, {
      id: 'g2', metodo: 'TRANSFERENCIA', monto: 60000, createdAt: new Date('2026-11-05T20:10:00Z'),
      pedido: { id: 'p2', numero: 1051, cliente: null, factura: null },
    }])
    expect(r[0]).toEqual({ pagoId: 'g1', pedidoId: 'p1', numero: 1042, clienteId: 'c1', cliente: 'Tienda La Esperanza', factura: 'F-0318', fecha: '2026-11-05T15:42:00.000Z', metodo: 'NEQUI', monto: 90000 })
    expect(r[1]).toMatchObject({ clienteId: null, cliente: 'Sin cliente', factura: null })
  })
})
