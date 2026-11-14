import { describe, expect, it } from 'vitest'
import { formatImportePedido, formatPrecioUnitario, importeLineaEditable } from '../precio-formato'

describe('#795 presentación de precio e importe', () => {
  it('presenta precio completo y total monetario con precisiones distintas', () => {
    expect(formatPrecioUnitario(2190.47619)).toBe('$2.190,47619')
    expect(formatImportePedido(importeLineaEditable(2190.47619,63))).toBe('$138.000,00')
    expect(formatImportePedido(importeLineaEditable(2190.47619,1))).toBe('$2.190,48')
  })

  it('una entrada inválida no revienta el render ni se confunde con deuda cero', () => {
    for (const [price, quantity] of [[2190.4761904,63],[2300,1.5],[-1,2]]) {
      const importe = importeLineaEditable(price,quantity)
      expect(Number.isNaN(importe)).toBe(true)
      expect(formatImportePedido(importe)).toBe('—')
    }
  })
})
