import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useItemPricing } from '../use-item-pricing'

const tablaBody = {
  success: true,
  tabla: {
    PACA_AGUA: [{ cantMin: 1, cantMax: 9, precio: 3000, precioMinimo: null }, { cantMin: 10, cantMax: null, precio: 2800, precioMinimo: null }],
  },
}
const configsBody = {
  success: true,
  productos: [
    { codigo: 'PACA_AGUA', nombre: 'Paca', aplicaDomicilio: true, sobreCostoDomicilio: 500, precioBase: 3000 },
    { codigo: 'BOTELLON', nombre: 'Botellón', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 8000 },
  ],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('/api/precios/tabla') ? tablaBody : configsBody),
  })))
})
afterEach(() => vi.unstubAllGlobals())

describe('useItemPricing', () => {
  it('carga tabla y configs una sola vez', async () => {
    const { result } = renderHook(() => useItemPricing())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tabla.PACA_AGUA).toHaveLength(2)
    expect(result.current.configs).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('precioBaseFor usa el primer tier de la tabla', async () => {
    const { result } = renderHook(() => useItemPricing())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.precioBaseFor('PACA_AGUA', 'PUNTO')).toBe(3000)
  })

  it('precioBaseFor suma el recargo de domicilio cuando aplicaDomicilio', async () => {
    const { result } = renderHook(() => useItemPricing())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.precioBaseFor('PACA_AGUA', 'DOMICILIO')).toBe(3500)
    // BOTELLON no aplica domicilio → sin recargo
    expect(result.current.precioBaseFor('BOTELLON', 'DOMICILIO')).toBe(result.current.precioBaseFor('BOTELLON', 'PUNTO'))
  })

  it('sin tier en tabla cae a DEFAULT_PRICES', async () => {
    const { result } = renderHook(() => useItemPricing())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // BOTELLON no está en tablaBody → DEFAULT_PRICES o 0, nunca NaN
    expect(Number.isFinite(result.current.precioBaseFor('BOTELLON', 'PUNTO'))).toBe(true)
  })
})
