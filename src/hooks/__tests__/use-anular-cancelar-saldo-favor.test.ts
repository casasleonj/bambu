// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({ fetchResilient: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: m.fetchResilient }))
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error, info: m.info } }))

import { useAnularPedido } from '../use-anular-pedido'
import { useCancelarPedido } from '../use-cancelar-pedido'

const ok = (data: Record<string, unknown>) => m.fetchResilient.mockResolvedValue({ status: 'ok', data: { success: true, ...data } })

describe('anular/cancelar: el aviso dice qué pasó con el saldo a favor (#577)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('anular sin saldo a favor: mensaje de siempre', async () => {
    ok({})
    const { result } = renderHook(() => useAnularPedido())
    await act(async () => { await result.current.anular({ pedidoId: 'p1', motivo: 'x' }) })
    expect(m.success).toHaveBeenCalledWith('Pedido anulado correctamente', undefined)
  })

  it('anular con todo restado: el mismo aviso trae el monto y el saldo final', async () => {
    ok({ saldoFavorRevertido: 20000, saldoFavorCliente: 15000 })
    const { result } = renderHook(() => useAnularPedido())
    await act(async () => { await result.current.anular({ pedidoId: 'p1', motivo: 'x' }) })
    const [texto, opciones] = m.success.mock.calls[0]
    expect(texto).toMatch(/Pedido anulado correctamente\. Se restaron .*20\.000 del saldo a favor del cliente\. .*15\.000/)
    expect(opciones).toEqual({ duration: 10000 })
  })

  it('anular con parte ya usada: avisa aparte (no se cierra solo) y el toast queda corto', async () => {
    ok({ saldoFavorRevertido: 8000, saldoFavorYaUsado: 12000, saldoFavorCliente: 0 })
    const onSaldoFavorYaUsado = vi.fn()
    const { result } = renderHook(() => useAnularPedido({ onSaldoFavorYaUsado }))
    await act(async () => { await result.current.anular({ pedidoId: 'p1', motivo: 'x' }) })
    expect(m.success).toHaveBeenCalledWith('Pedido anulado correctamente')
    expect(onSaldoFavorYaUsado).toHaveBeenCalledTimes(1)
    expect(onSaldoFavorYaUsado.mock.calls[0][0]).toMatch(/Los otros .*12\.000 ya se habían usado en otros pedidos/)
  })

  it('anular con parte ya usada y sin pantalla que lo muestre: el mensaje completo va en el toast', async () => {
    ok({ saldoFavorYaUsado: 5000 })
    const { result } = renderHook(() => useAnularPedido())
    await act(async () => { await result.current.anular({ pedidoId: 'p1', motivo: 'x' }) })
    expect(m.success.mock.calls[0][0]).toMatch(/ya se habían usado en otros pedidos/)
  })

  it('cancelar sigue la misma regla', async () => {
    ok({ saldoFavorRevertido: 5000 })
    const { result } = renderHook(() => useCancelarPedido())
    await act(async () => { await result.current.cancelar({ pedidoId: 'p1', motivo: 'x' }) })
    expect(m.success.mock.calls[0][0]).toMatch(/Pedido cancelado correctamente\. Se restaron .*5\.000/)
    vi.clearAllMocks()
    ok({ saldoFavorRevertido: 1000, saldoFavorYaUsado: 4000 })
    const onSaldoFavorYaUsado = vi.fn()
    const r2 = renderHook(() => useCancelarPedido({ onSaldoFavorYaUsado }))
    await act(async () => { await r2.result.current.cancelar({ pedidoId: 'p1', motivo: 'x' }) })
    expect(onSaldoFavorYaUsado).toHaveBeenCalledTimes(1)
  })

  it('sin conexión: se encola y no promete ningún monto', async () => {
    m.fetchResilient.mockResolvedValue({ status: 'offline', localId: 'l1' })
    const { result } = renderHook(() => useAnularPedido())
    await act(async () => { await result.current.anular({ pedidoId: 'p1', motivo: 'x' }) })
    expect(m.info).toHaveBeenCalledWith(expect.stringMatching(/Sin conexión/))
    expect(m.success).not.toHaveBeenCalled()
  })
})
