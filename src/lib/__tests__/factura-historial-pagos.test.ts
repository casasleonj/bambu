// @tests #796 paso 1 — historial de pagos de la factura: cada pago una vez, espejos fuera, correcciones aparte
import { describe, it, expect } from 'vitest'
import { armarHistorialPagos, ocultarDetalleCorrecciones, type PagoParaHistorial, type AbonoParaHistorial } from '../factura-historial-pagos'

const d = (iso: string) => new Date(iso)
const pago = (id: string, monto: number, at: string, o: Partial<PagoParaHistorial> = {}): PagoParaHistorial =>
  ({ id, metodo: 'EFECTIVO', monto, createdAt: d(at), ocurridoAt: null, confirmacion: 'CONFIRMADO', ...o })
const abono = (id: string, monto: number, at: string, o: Partial<AbonoParaHistorial> = {}): AbonoParaHistorial =>
  ({ id, numero: `ABO-${id}`, monto, metodoPago: 'EFECTIVO', fecha: d(at), pagoOrigenId: null, correcciones: [], ...o })
const corr = (id: string, monto: number, at: string) =>
  ({ id, numero: `COR-${id}`, tipo: 'NO_RECIBIDO', montoRevertido: monto, motivo: 'no llegó', createdAt: d(at), autorizadoPor: 'Admin' })

describe('#796 armarHistorialPagos', () => {
  it('un pago con su abono espejo aparece UNA sola vez', () => {
    const h = armarHistorialPagos([pago('p1', 20000, '2026-11-17T15:15:00Z')], [abono('a1', 20000, '2026-11-17T15:15:00Z', { pagoOrigenId: 'p1' })])
    expect(h.pagos).toHaveLength(1)
    expect(h.pagos[0]).toMatchObject({ clave: 'p1', origen: 'PAGO', numero: 1, monto: 20000 })
    expect(h.totalNeto).toBe(20000)
  })

  it('un pago SIN abono (cobro al entregar) aparece aunque no exista ningún abono', () => {
    const h = armarHistorialPagos([pago('p1', 15000, '2026-11-17T20:40:00Z', { metodo: 'NEQUI', confirmacion: 'REPORTADO' })], [])
    expect(h.pagos).toEqual([expect.objectContaining({ numero: 1, metodo: 'NEQUI', monto: 15000, confirmacion: 'REPORTADO' })])
  })

  it('un abono independiente (sin Pago de origen) es un pago más', () => {
    const h = armarHistorialPagos([pago('p1', 10000, '2026-11-16T15:00:00Z')], [abono('a9', 5000, '2026-11-17T15:00:00Z')])
    expect(h.pagos.map((p) => [p.numero, p.origen, p.monto])).toEqual([[1, 'PAGO', 10000], [2, 'ABONO', 5000]])
    expect(h.pagos[1].clave).toBe('abono:a9')
  })

  it('si el Pago de origen de un espejo no está, el abono se lista: nunca se pierde un cobro', () => {
    const h = armarHistorialPagos([], [abono('a1', 7000, '2026-11-17T15:00:00Z', { pagoOrigenId: 'pago-de-otro-pedido' })])
    expect(h.pagos).toHaveLength(1)
    expect(h.totalPagado).toBe(7000)
  })

  it('ordena por fecha, usa la fecha efectiva si existe y desempata por clave', () => {
    const h = armarHistorialPagos([
      pago('b', 1000, '2026-11-17T15:00:00Z'), pago('a', 2000, '2026-11-17T15:00:00Z'),
      pago('c', 3000, '2026-11-18T15:00:00Z', { ocurridoAt: d('2026-11-16T15:00:00Z') }),
    ], [])
    expect(h.pagos.map((p) => p.clave)).toEqual(['c', 'a', 'b'])
    expect(h.pagos.map((p) => p.numero)).toEqual([1, 2, 3])
  })

  it('la corrección de un abono espejo se liga al número de su pago y resta del neto', () => {
    const h = armarHistorialPagos(
      [pago('p1', 20000, '2026-11-17T15:15:00Z'), pago('p2', 15000, '2026-11-17T20:40:00Z')],
      [abono('a2', 15000, '2026-11-17T20:40:00Z', { pagoOrigenId: 'p2', correcciones: [corr('12', 3000, '2026-11-18T14:00:00Z')] })],
    )
    expect(h.correcciones).toEqual([expect.objectContaining({ numero: 'COR-12', monto: 3000, sobrePagoNumero: 2 })])
    expect(h).toMatchObject({ totalPagado: 35000, totalCorregido: 3000, totalNeto: 32000 })
  })

  it('conserva los centavos exactos', () => {
    const h = armarHistorialPagos([pago('a', 0.1, '2026-11-17T15:00:00Z'), pago('b', 0.2, '2026-11-17T16:00:00Z')], [])
    expect(h.totalPagado).toBe(0.3)
  })

  it('sin pagos ni abonos devuelve todo en cero', () => {
    expect(armarHistorialPagos([], [])).toEqual({ pagos: [], correcciones: [], totalPagado: 0, totalCorregido: 0, totalNeto: 0 })
  })

  it('ocultarDetalleCorrecciones deja el hecho financiero y quita motivo y responsable (no amplía visibilidad)', () => {
    const h = armarHistorialPagos([pago('p1', 5000, '2026-11-17T15:00:00Z')], [abono('a1', 5000, '2026-11-17T15:00:00Z', { pagoOrigenId: 'p1', correcciones: [corr('1', 1000, '2026-11-18T14:00:00Z')] })])
    const o = ocultarDetalleCorrecciones(h)
    expect(o.correcciones[0]).toMatchObject({ numero: 'COR-1', monto: 1000, motivo: null, autorizadoPor: null })
    expect(o.totalNeto).toBe(4000)
  })
})
