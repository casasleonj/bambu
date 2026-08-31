// @tests evaluarStockCarga — evaluación pura de una carga contra el stock del día
import { describe, it, expect } from 'vitest'
import { evaluarStockCarga, type StockDisponible } from '../use-stock-disponible'

const stock: StockDisponible = {
  PACA_AGUA: 50,
  PACA_HIELO: 20,
  BOTELLON: 10,
  BOLSA_AGUA: 30,
  BOLSA_HIELO: 30,
}

describe('evaluarStockCarga', () => {
  it('sin stock cargado devuelve todo en cero/neutro', () => {
    const r = evaluarStockCarga(null, { PACA_AGUA: 5 })
    expect(r).toEqual({
      hayStockInsuficiente: false,
      status: null,
      productosConDeficit: [],
      requiereMotivo: false,
    })
  })

  it('carga dentro del stock → suficiente, sin déficit', () => {
    const r = evaluarStockCarga(stock, { PACA_AGUA: 10, PACA_HIELO: 5 })
    expect(r.hayStockInsuficiente).toBe(false)
    expect(r.productosConDeficit).toEqual([])
    expect(r.status?.nivel).toBe('suficiente')
  })

  it('detecta el producto que supera su stock', () => {
    const r = evaluarStockCarga(stock, { PACA_AGUA: 60 }) // stock 50
    expect(r.hayStockInsuficiente).toBe(true)
    expect(r.productosConDeficit).toEqual(['PACA_AGUA'])
  })

  it('déficit ≤ 10 NO exige motivo; > 10 SÍ', () => {
    expect(evaluarStockCarga(stock, { PACA_AGUA: 58 }).requiereMotivo).toBe(false) // +8
    expect(evaluarStockCarga(stock, { PACA_AGUA: 61 }).requiereMotivo).toBe(true) // +11
  })

  it('ignora productos con stock 0 en el conteo de déficit', () => {
    const sinBotellon: StockDisponible = { ...stock, BOTELLON: 0 }
    const r = evaluarStockCarga(sinBotellon, { BOTELLON: 5 })
    expect(r.productosConDeficit).toEqual([]) // max 0 → no cuenta como déficit
    expect(r.hayStockInsuficiente).toBe(true) // pero sí es insuficiente
  })

  it('semáforo: ajustado entre 80% y 100%, insuficiente > 100%', () => {
    // grandes disponibles = 50 + 20 + 10 = 80
    expect(evaluarStockCarga(stock, { PACA_AGUA: 70 }).status?.nivel).toBe('ajustado') // 87.5%
    expect(evaluarStockCarga(stock, { PACA_AGUA: 85 }).status?.nivel).toBe('insuficiente') // 106%
  })
})
