import { describe, expect, it } from 'vitest'
import { calcularNetoCierre, resumirVentasCierre } from '@/lib/cierre-totales'
import { leerArqueoDeclarado } from '@/lib/cierre-arqueo'

describe('cierre: conceptos financieros y conteo declarado', () => {
  it('incluye cartera y ajustes negativos sin duplicar pagos', () => {
    expect(calcularNetoCierre({ baseDia: 50000, cobroVentasHoy: 260000, cobroCartera: 10000, totalGastos: 30000, comisiones: 10000, salarios: 0 })).toBe(280000)
    expect(calcularNetoCierre({ baseDia: 0, cobroVentasHoy: 0.3, cobroCartera: -0.1, totalGastos: 0, comisiones: 0, salarios: 0 })).toBe(0.2)
  })
  it('no resta otra vez notas de pedidos de la fecha o futuros', () => {
    const inicio = new Date('2026-03-10T00:00:00-05:00')
    const r = resumirVentasCierre([{ total: 280000 }], [
      { monto: 20000, pedido: { fecha: new Date('2026-03-09T12:00:00-05:00') } },
      { monto: 30000, pedido: { fecha: inicio } },
      { monto: 5000, pedido: { fecha: new Date('2026-03-11T12:00:00-05:00') } },
    ], inicio)
    expect(r).toEqual({ ventasDePedidosDelDia: 280000, totalNotasCredito: 55000, notasCreditoVentasAnteriores: 20000, notasCreditoSinAjusteVentas: 35000, totalVentas: 260000 })
  })
  it('calcula el conteo desde las denominaciones e ignora totales enviados', () => {
    expect(leerArqueoDeclarado(JSON.stringify({ arqueo: { 50000: 2, 2000: 3 }, totalContado: 999999, diferencia: 0 }), 100000))
      .toEqual({ arqueo: { 50000: 2, 2000: 3 }, totalContado: 106000, diferenciaArqueo: 6000 })
  })
  it.each([{ 50000: -1 }, { 50000: 0.5 }, { 1234: 2 }, { 100000: 1000000 }, { 50000: '2' }])('rechaza conteos no válidos %j', arqueo => {
    expect(() => leerArqueoDeclarado(JSON.stringify({ arqueo }), 0)).toThrow('Arqueo inválido')
  })
  it('admite cierre sin conteo declarado sin inventar un conteo cero', () => {
    expect(leerArqueoDeclarado(undefined, 100000)).toEqual({ arqueo: null, totalContado: null, diferenciaArqueo: null })
  })
})
