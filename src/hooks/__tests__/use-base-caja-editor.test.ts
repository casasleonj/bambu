import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBaseCajaEditor } from '@/hooks/use-base-caja-editor'
import { getTodayString } from '@/lib/dates'

const fetchMock = vi.fn()

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))

import { fetchResilient } from '@/lib/fetch-resilient'
const fetchResilientMock = vi.mocked(fetchResilient)

describe('useBaseCajaEditor', () => {
  function todayKey() {
    return `baseDia_${getTodayString()}`
  }

  beforeEach(() => {
    localStorage.clear()
    fetchMock.mockReset()
    fetchResilientMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('inicia en loading y pasa a con_base cuando hay valor', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    const { result } = renderHook(() => useBaseCajaEditor())

    expect(result.current.state.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.state.status).toBe('con_base')
    })

    if (result.current.state.status === 'con_base') {
      expect(result.current.state.valor).toBe('50000')
    }
  })

  it('pasa a sin_base cuando no hay cierre ni config', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    const { result } = renderHook(() => useBaseCajaEditor())

    await waitFor(() => {
      expect(result.current.state.status).toBe('sin_base')
    })
  })

  it('pasa a cerrado cuando hoy coincide con el ultimo cierre', async () => {
    // Construimos la fecha a las 12:00 UTC del dia actual para que
    // toLocaleDateString con timezone Bogota (UTC-5) retorne el mismo dia.
    const today = getTodayString()
    const fechaCierre = `${today}T12:00:00.000Z`
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cierre: { fecha: fechaCierre } }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    const { result } = renderHook(() => useBaseCajaEditor())

    await waitFor(() => {
      expect(result.current.state.status).toBe('cerrado')
    })
  })

  it('update OK: llama a fetchResilient, actualiza state y localStorage', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    fetchResilientMock.mockResolvedValueOnce({
      status: 'ok',
      data: { config: { valor: '75000' } },
      statusCode: 200,
    })

    const { result } = renderHook(() => useBaseCajaEditor())

    await waitFor(() => {
      expect(result.current.state.status).toBe('con_base')
    })

    let updateResult: { ok: boolean } | undefined
    await act(async () => {
      updateResult = await result.current.update('75000')
    })

    expect(updateResult).toEqual({ ok: true })
    if (result.current.state.status === 'con_base') {
      expect(result.current.state.valor).toBe('75000')
    }
    expect(localStorage.getItem(todayKey())).toBe('75000')
  })

  it('update offline: acepta el valor y lo refleja en state + localStorage', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    fetchResilientMock.mockResolvedValueOnce({
      status: 'offline',
      localId: 'uuid-1',
      reason: 'network',
    })

    const { result } = renderHook(() => useBaseCajaEditor())

    await waitFor(() => {
      expect(result.current.state.status).toBe('sin_base')
    })

    let updateResult: { ok: boolean; offline?: boolean } | undefined
    await act(async () => {
      updateResult = await result.current.update('30000')
    })

    expect(updateResult?.ok).toBe(true)
    expect(updateResult?.offline).toBe(true)
    if (result.current.state.status === 'con_base') {
      expect(result.current.state.valor).toBe('30000')
    }
    expect(localStorage.getItem(todayKey())).toBe('30000')
  })

  it('update con error del server: devuelve ok=false con mensaje', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    fetchResilientMock.mockResolvedValueOnce({
      status: 'error',
      error: 'Debe ser un número entero positivo',
      statusCode: 400,
    })

    const { result } = renderHook(() => useBaseCajaEditor())

    await waitFor(() => {
      expect(result.current.state.status).toBe('sin_base')
    })

    let updateResult: { ok: boolean; error?: string } | undefined
    await act(async () => {
      updateResult = await result.current.update('-1')
    })

    expect(updateResult?.ok).toBe(false)
    expect(updateResult?.error).toContain('entero')
    // state NO cambia si falla.
    expect(result.current.state.status).toBe('sin_base')
  })
})
