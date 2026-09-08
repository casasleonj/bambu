import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useClienteContext } from '../use-cliente-context'

const fiadoLimite = { success: true, status: { nivel: 'limite', count: 3, limite: 3 } }
const clienteDetail = { success: true, cliente: { id: 'c1', frecuenciaSugerida: { dias: 7, label: 'Semanal' }, productosSugeridos: [{ codigo: 'PACA_AGUA', nombre: 'Paca', frecuencia: 80, cantidadPromedio: 4 }] } }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/fiado-status')) return { ok: true, json: async () => fiadoLimite }
    if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => clienteDetail }
    return { ok: true, json: async () => ({ success: true }) }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('useClienteContext', () => {
  it('carga fiado-status al recibir un cliente real', async () => {
    const { result } = renderHook(() => useClienteContext('c1'))
    await waitFor(() => expect(result.current.fiadoStatus?.nivel).toBe('limite'))
  })

  it('CONSUMIDOR_FINAL no dispara fetch de contexto', async () => {
    renderHook(() => useClienteContext('CONSUMIDOR_FINAL'))
    await new Promise((r) => setTimeout(r, 20))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('loadPatron trae el patrón solo bajo demanda', async () => {
    const { result } = renderHook(() => useClienteContext('c1'))
    await waitFor(() => expect(result.current.fiadoStatus).not.toBeNull())
    expect(result.current.patron).toBeNull()
    act(() => result.current.loadPatron())
    await waitFor(() => expect(result.current.patron?.productosSugeridos).toHaveLength(1))
    expect(result.current.patron?.frecuenciaSugerida?.label).toBe('Semanal')
  })

  it('cambiar de cliente limpia el contexto anterior', async () => {
    const { result, rerender } = renderHook(({ id }) => useClienteContext(id), { initialProps: { id: 'c1' } })
    await waitFor(() => expect(result.current.fiadoStatus).not.toBeNull())
    rerender({ id: 'c2' })
    // reset inmediato en render; el nuevo fetch rellenará después
    expect(result.current.patron).toBeNull()
  })
})
