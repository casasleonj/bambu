import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePedidoPropuesta } from '../use-pedido-propuesta'

const detalle = {
  success: true,
  cliente: {
    id: 'c1',
    pedidos: [{ estadoEntrega: 'ENTREGADO', canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantPedido: 3 }] }],
    productosSugeridos: [],
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => detalle })))
})
afterEach(() => vi.unstubAllGlobals())

describe('usePedidoPropuesta', () => {
  it('no carga solo — sólo con load() explícito', async () => {
    const { result } = renderHook(() => usePedidoPropuesta())
    expect(result.current.cargado).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()

    act(() => result.current.load('c1'))
    await waitFor(() => expect(result.current.cargado).toBe(true))
    expect(result.current.propuestas.map((p) => p.id)).toEqual(['ultima'])
  })

  it('CONSUMIDOR_FINAL no dispara fetch', () => {
    const { result } = renderHook(() => usePedidoPropuesta())
    act(() => result.current.load('CONSUMIDOR_FINAL'))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('clear() resetea el estado', async () => {
    const { result } = renderHook(() => usePedidoPropuesta())
    act(() => result.current.load('c1'))
    await waitFor(() => expect(result.current.propuestas.length).toBe(1))
    act(() => result.current.clear())
    expect(result.current.cargado).toBe(false)
    expect(result.current.propuestas).toEqual([])
  })
})
