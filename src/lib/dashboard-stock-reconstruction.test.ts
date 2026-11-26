import { describe, expect, it } from 'vitest'
import { reconstruirStockDesdeMovimientos } from './dashboard-stock-reconstruction'

const m = { produccionAgua: 50, produccionHielo: 8, ventasAgua: 40, ventasHielo: 3, perdidasAgua: 2, perdidasHielo: 1, ajustesAgua: -3, ajustesHielo: 0 }

describe('reconstrucción física del inventario #922', () => {
  it('reconstruye con cierre previo y movimientos conciliados', () => {
    expect(reconstruirStockDesdeMovimientos({ agua: 100, hielo: 10 }, m)).toEqual({ agua: 105, hielo: 14 })
  })
  it('no inventa un saldo sin cierre anterior', () => {
    expect(reconstruirStockDesdeMovimientos(null, m)).toBeNull()
  })
  it('no presume ajustes iguales a cero si falta el libro de ajustes', () => {
    const { ajustesAgua: _ajuste, ...incompleto } = m
    expect(reconstruirStockDesdeMovimientos({ agua: 100, hielo: 10 }, incompleto)).toBeNull()
  })
  it('no oculta un descuadre mediante truncamiento a cero', () => {
    expect(reconstruirStockDesdeMovimientos({ agua: 1, hielo: 1 }, { ...m, ventasAgua: 999 })).toBeNull()
  })
})
