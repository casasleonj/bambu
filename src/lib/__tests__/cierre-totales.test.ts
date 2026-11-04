import { describe, expect, it } from 'vitest'
import { calcularEfectivoEsperado, calcularNetoCierre, resumirVentasCierre } from '@/lib/cierre-totales'
import { leerArqueoDeclarado } from '@/lib/cierre-arqueo'

describe('cierre: conceptos financieros y conteo declarado', () => {
  it('incluye cartera y ajustes negativos sin duplicar pagos', () => {
    expect(calcularNetoCierre({ baseDia: 50000, cobroVentasHoy: 260000, cobroCartera: 10000, totalGastos: 30000, comisiones: 10000, salarios: 0 })).toBe(280000)
    expect(calcularNetoCierre({ baseDia: 0, cobroVentasHoy: 0.3, cobroCartera: -0.1, totalGastos: 0, comisiones: 0, salarios: 0 })).toBe(0.2)
  })
  it('#601: el efectivo esperado no incluye Nequi ni otros pagos digitales (cierre real del 31-oct, importes exactos)', () => {
    // Efectivo 839.400 y Nequi 113.700; base 50.000; gastos 346.500; comisiones 84.000.
    const neto = calcularNetoCierre({ baseDia: 50000, cobroVentasHoy: 839400 + 113700, cobroCartera: 0, totalGastos: 346500, comisiones: 84000, salarios: 0 })
    const efectivoEsperado = calcularEfectivoEsperado({ baseDia: 50000, efectivoPagos: 839400, cobroCarteraEfectivo: 0, totalGastos: 346500, comisiones: 84000, salariosEfectivo: 0 })
    expect(neto).toBe(572600)
    expect(efectivoEsperado).toBe(458900)
    // Con 485.200 contados: contra el neto total «faltaban» 87.400; contra el efectivo esperado sobran 26.300.
    expect(485200 - neto).toBe(-87400)
    expect(485200 - efectivoEsperado).toBe(26300)
  })
  it('#601: suma los abonos en efectivo, resta salarios en efectivo y trabaja en centavos', () => {
    expect(calcularEfectivoEsperado({ baseDia: 10000, efectivoPagos: 5000.1, cobroCarteraEfectivo: 2000.2, totalGastos: 1000, comisiones: 500, salariosEfectivo: 300.3 })).toBe(15200)
    expect(calcularEfectivoEsperado({ baseDia: 0, efectivoPagos: 0, cobroCarteraEfectivo: -100, totalGastos: 0, comisiones: 0, salariosEfectivo: 0 })).toBe(-100)
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
  it('reducción comercial (#451): la nota sobre un pedido de hoy no resta otra vez; sobre uno de un día anterior sí', () => {
    const inicio = new Date('2026-03-10T00:00:00-05:00')
    // Pedido de hoy: 20 × 2.500, ya baja a 15 × 2.500 = 37.500 y la nota de 12.500 es de hoy.
    const hoy = resumirVentasCierre([{ total: 37500 }], [{ monto: 12500, pedido: { fecha: new Date('2026-03-10T09:00:00-05:00') } }], inicio)
    expect(hoy.totalVentas).toBe(37500)
    // Pedido de ayer reducido hoy: hoy no suma ese pedido y la nota baja las ventas de hoy una sola vez.
    const ayer = resumirVentasCierre([], [{ monto: 12500, pedido: { fecha: new Date('2026-03-09T09:00:00-05:00') } }], inicio)
    expect(ayer.totalVentas).toBe(-12500)
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
