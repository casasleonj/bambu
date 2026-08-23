import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCrearPedido, type CrearPedidoPayload } from '@/hooks/use-crear-pedido'

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}))

import { fetchResilient } from '@/lib/fetch-resilient'
const fetchResilientMock = vi.mocked(fetchResilient)

const payload: CrearPedidoPayload = {
  clienteId: 'cliente-1',
  canal: 'DOMICILIO',
  items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
}

describe('useCrearPedido', () => {
  beforeEach(() => {
    fetchResilientMock.mockReset()
  })

  it('llama onSuccess con el pedido creado cuando status es ok', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'ok',
      statusCode: 201,
      data: { success: true, pedido: { id: 'p1' } },
    })
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onSuccess }))

    await act(async () => {
      await result.current.create(payload)
    })

    expect(onSuccess).toHaveBeenCalledWith({ pedido: { id: 'p1' }, clienteId: 'cliente-1' })
  })

  it('llama onOffline con el localId y el payload original cuando fetchResilient encola offline (bug Aponte, pero para pedidos)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'offline',
      localId: 'offline-uuid-123',
      reason: 'network',
    })
    const onOffline = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onSuccess, onOffline }))

    let returned: unknown
    await act(async () => {
      returned = await result.current.create(payload)
    })

    expect(returned).toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onOffline).toHaveBeenCalledWith({ localId: 'offline-uuid-123', payload })
  })

  it('no llama onOffline cuando el status es error (falla de validación del server)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'error',
      statusCode: 400,
      error: 'Agrega al menos un producto',
    })
    const onOffline = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useCrearPedido({ onOffline, onError }))

    await act(async () => {
      await result.current.create(payload)
    })

    expect(onOffline).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Agrega al menos un producto')
  })

  it('funciona sin onOffline configurado (opcional, backward compatible)', async () => {
    fetchResilientMock.mockResolvedValueOnce({
      status: 'offline',
      localId: 'offline-uuid-456',
      reason: 'timeout',
    })
    const { result } = renderHook(() => useCrearPedido())

    await expect(
      act(async () => {
        await result.current.create(payload)
      }),
    ).resolves.not.toThrow()
  })
})
