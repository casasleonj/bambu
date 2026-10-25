// @tests ADR-CIERRE-002 §6 — topes de entrada del cierre (#444): valores extremos
// se rechazan con 400 y mensaje (antes: 500 por desborde de Decimal(10,2) o aceptados sin aviso).
import { describe, it, expect } from 'vitest'
import { CerrarEmbarqueSchema } from '@/lib/validators'

const pedido = (over: Record<string, unknown> = {}) => ({ pedidoId: 'p1', entregado: 'COMPLETO', pagado: 'NO_PAGADO', pagos: [], ...over })
const base = (over: Record<string, unknown> = {}) => ({ pedidos: [pedido()], productos: [{ producto: 'PACA_AGUA' }], ...over })
const ok = (v: unknown) => CerrarEmbarqueSchema.safeParse(v).success

describe('CerrarEmbarqueSchema — topes (#444)', () => {
  it('un cierre normal pasa', () => {
    expect(ok(base({ gastos: [{ categoria: 'Gasolina', monto: 23000 }], dineroEntregado: 12600 }))).toBe(true)
  })

  it('gasto de $99.999.999.999 se rechaza', () => {
    expect(ok(base({ gastos: [{ categoria: 'Gasolina', monto: 99_999_999_999 }] }))).toBe(false)
  })

  it('nota de 2 MB se rechaza (gasto, observaciones, justificaciones)', () => {
    const grande = 'x'.repeat(2_000_000)
    expect(ok(base({ gastos: [{ categoria: 'Otros', monto: 1000, nota: grande }] }))).toBe(false)
    expect(ok(base({ obs: grande }))).toBe(false)
    expect(ok(base({ justificacionFaltante: grande }))).toBe(false)
    expect(ok(base({ justificacionDiscrepancia: grande }))).toBe(false)
  })

  it('70 gastos y 200 ventas libres se rechazan; 5 gastos pasan', () => {
    const gasto = { categoria: 'Otros', monto: 1000 }
    expect(ok(base({ gastos: Array(70).fill(gasto) }))).toBe(false)
    expect(ok(base({ gastos: Array(5).fill(gasto) }))).toBe(true)
    const vl = { clienteId: 'c1', cPacaAgua: 1, pagos: [] }
    expect(ok(base({ ventasLibres: Array(200).fill(vl) }))).toBe(false)
    expect(ok(base({ ventasLibres: Array(3).fill(vl) }))).toBe(true)
  })

  it('pagos y dinero entregado fuera de rango se rechazan', () => {
    expect(ok(base({ dineroEntregado: 99_999_999_999 }))).toBe(false)
    expect(ok(base({ pedidos: [pedido({ pagos: [{ metodo: 'EFECTIVO', monto: 99_999_999_999 }] })] }))).toBe(false)
    expect(ok(base({ pedidos: [pedido({ pagos: Array(15).fill({ metodo: 'EFECTIVO', monto: 1 }) })] }))).toBe(false)
  })

  it('cantidades absurdas se rechazan', () => {
    expect(ok(base({ ventasLibres: [{ clienteId: 'c1', cPacaAgua: 5_000_000, pagos: [] }] }))).toBe(false)
  })
})
