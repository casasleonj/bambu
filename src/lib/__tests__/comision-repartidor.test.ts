// @tests #499 — reglas puras de tarifas del repartidor
import { describe, it, expect } from 'vitest'
import { tarifasRepartidor } from '../comision-repartidor'

describe('tarifasRepartidor', () => {
  it('usa la tarifa del trabajador cuando existe', () => {
    expect(tarifasRepartidor({ comRepartAgua: 400, comRepartHielo: 250, comRepartBotellon: 500 }, 300))
      .toEqual({ agua: 400, hielo: 250, botellon: 500 })
  })

  it('sin tarifa propia (null) usa COM_REPARTIDOR para agua y hielo, y 200 para botellón', () => {
    expect(tarifasRepartidor({ comRepartAgua: null, comRepartHielo: null, comRepartBotellon: null }, 300))
      .toEqual({ agua: 300, hielo: 300, botellon: 200 })
  })

  it('sin tarifa propia ni COM_REPARTIDOR usa 200', () => {
    expect(tarifasRepartidor({ comRepartAgua: null, comRepartHielo: null, comRepartBotellon: null }))
      .toEqual({ agua: 200, hielo: 200, botellon: 200 })
  })

  it('una tarifa en 0 cuenta como «sin definir» y usa la general (#500)', () => {
    expect(tarifasRepartidor({ comRepartAgua: 0, comRepartHielo: 0, comRepartBotellon: 0 }, 300))
      .toEqual({ agua: 300, hielo: 300, botellon: 200 })
    expect(tarifasRepartidor({ comRepartAgua: 0, comRepartHielo: 250, comRepartBotellon: 0 }))
      .toEqual({ agua: 200, hielo: 250, botellon: 200 })
  })
})

// Regresiones de la estimación del cierre y aritmética monetaria.
describe('cálculo por unidades y fuentes', () => {
  it('Decimal y JSON string cero usan la tarifa de reparto general, nunca la de sellado', async () => {
    const { Prisma } = await import('@prisma/client')
    expect(tarifasRepartidor({ comRepartAgua: new Prisma.Decimal(0), comRepartHielo: '0', comRepartBotellon: null }, 300)).toEqual({ agua: 300, hielo: 300, botellon: 200 })
  })
  it('rechaza configuraciones no finitas como tarifa y conserva el fallback documentado', () => {
    expect(tarifasRepartidor({ comRepartAgua: 'NaN', comRepartHielo: -2, comRepartBotellon: 0 }, Infinity)).toEqual({ agua: 200, hielo: 200, botellon: 200 })
  })
  it('diez unidades por 200 son 2000, independientemente de que la venta cueste 50000', async () => {
    const { calcularPorFuentes } = await import('../comision-repartidor-calculo')
    const c = calcularPorFuentes([{ id: 'e1', href: '/embarques/e1', origen: 'EMBARQUE_VIVO', unidades: { agua: 10, hielo: 0, botellon: 0 } }], { agua: 200, hielo: 300, botellon: 400 })
    expect(c.total).toBe(2000)
    expect(c.comAgua).toBe(2000)
    expect(c.porOrigen).toEqual({ embarque: 2000, sinEmbarque: 0 })
  })
  it('no deja fracciones fantasma al sumar y restar pagos en centavos', async () => {
    const { calcularPorFuentes } = await import('../comision-repartidor-calculo')
    const c = calcularPorFuentes([{ id: 'p1', href: '/pedidos/p1', origen: 'SIN_EMBARQUE', unidades: { agua: 3, hielo: 0, botellon: 0 } }], { agua: 0.1, hielo: 0.2, botellon: 0.3 })
    expect(c.total).toBe(0.3)
    expect(c.porOrigen.sinEmbarque).toBe(0.3)
    expect(c.porOrigen.embarque).toBe(0)
  })
})
