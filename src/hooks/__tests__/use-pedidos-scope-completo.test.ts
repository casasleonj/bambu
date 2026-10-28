import { it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePedidos } from '../use-pedidos'
afterEach(() => vi.unstubAllGlobals())
const response = (pedidos: { id: string }[], total: number) => ({ ok: true, json: async () => ({ success: true, pedidos, total }) })
it('consulta páginas hasta completar Todos, conservando scope y sin introducir fechas', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([{ id: 'a' }, { id: 'b' }], 3)).mockResolvedValueOnce(response([{ id: 'c' }], 3))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => usePedidos({ scope: 'fiados' }, { all: true }))
  await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true))
  expect(result.current.pedidos).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  const next = new URL(fetch.mock.calls[1][0])
  expect(next.searchParams.get('scope')).toBe('fiados')
  expect(next.searchParams.get('page')).toBe('2')
  expect(next.searchParams.has('desde')).toBe(false)
})
it('si cambian las páginas, conserva la consulta anterior y explica el fallo en vez de mostrar Todos incompleto', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([{ id: 'anterior' }], 1))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => usePedidos({ scope: 'fiados' }, { all: true }))
  await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true))
  fetch.mockResolvedValueOnce(response([{ id: 'a' }, { id: 'b' }], 3)).mockResolvedValueOnce(response([{ id: 'b' }], 3))
  await act(() => result.current.refetch())
  expect(result.current.pedidos).toEqual([{ id: 'anterior' }])
  expect(result.current.error).toBe('La consulta cambió. Reintenta para actualizarla.')
  expect(result.current.loading).toBe(false)
})
