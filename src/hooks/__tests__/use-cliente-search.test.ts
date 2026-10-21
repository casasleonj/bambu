// @tests #376 — el buscador de cliente de los modales de pedido consulta el
// servidor (paginado, con debounce y cancelación) y cae a la lista local.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClienteSearch, DEBOUNCE_MS, LIMITE_RESULTADOS } from '@/hooks/use-cliente-search'
import type { Cliente } from '@/components/pedido-form-unified/types'

const cli = (id: string, nombre: string): Cliente => ({ id, nombre, telefono: '3001112233' } as Cliente)

const LOCALES = [cli('1', 'Carmen Rosa'), cli('2', 'Pedro Díaz')]

function respuesta(clientes: Cliente[], init: Partial<Response> = {}) {
  return { ok: true, status: 200, json: async () => ({ clientes }), ...init } as Response
}

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useClienteSearch (#376)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('con menos de 2 caracteres no consulta ni lista nada', async () => {
    const { result } = renderHook(() => useClienteSearch('c', LOCALES))
    await avanzar(DEBOUNCE_MS * 2)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.resultados).toEqual([])
    expect(result.current.buscando).toBe(false)
  })

  it('con 2+ caracteres muestra al instante lo local y, tras el debounce, consulta paginado (sin all=true)', async () => {
    fetchMock.mockResolvedValue(respuesta([cli('9', 'Carmen del Servidor')]))
    const { result } = renderHook(() => useClienteSearch('car', LOCALES))

    // antes del debounce: coincidencias locales y "buscando"
    expect(result.current.resultados.map((c) => c.id)).toEqual(['1'])
    expect(result.current.buscando).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    await avanzar(DEBOUNCE_MS + 10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://x')
    expect(url.pathname).toBe('/api/clientes')
    expect(url.searchParams.get('search')).toBe('car')
    expect(url.searchParams.get('pageSize')).toBe(String(LIMITE_RESULTADOS))
    expect(url.searchParams.has('all')).toBe(false)

    // unión: lo local se conserva y el servidor aporta lo que faltaba
    expect(result.current.resultados.map((c) => c.id).sort()).toEqual(['1', '9'])
    expect(result.current.buscando).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('encontrar un cliente que NO está en la lista precargada (lista vacía)', async () => {
    fetchMock.mockResolvedValue(respuesta([cli('7', 'Luis Alfonso')]))
    const { result } = renderHook(() => useClienteSearch('luis', []))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.resultados.map((c) => c.id)).toEqual(['7'])
  })

  it('al seguir escribiendo cancela la petición anterior y solo consulta el último término', async () => {
    const señales: AbortSignal[] = []
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      señales.push(init.signal as AbortSignal)
      return new Promise<Response>(() => {})
    })
    const { rerender } = renderHook(({ t }) => useClienteSearch(t, LOCALES), { initialProps: { t: 'ca' } })
    await avanzar(DEBOUNCE_MS + 10)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender({ t: 'car' })
    expect(señales[0].aborted).toBe(true)
    await avanzar(DEBOUNCE_MS + 10)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL(fetchMock.mock.calls[1][0] as string, 'http://x').searchParams.get('search')).toBe('car')
  })

  it('si el servidor falla y hay coincidencias locales, las conserva y avisa del error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useClienteSearch('car', LOCALES))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.resultados.map((c) => c.id)).toEqual(['1'])
    expect(result.current.error).toBe(true)
    expect(result.current.buscando).toBe(false)
  })

  it('sin lista local y con el servidor caído: error y listado vacío; reintentar vuelve a consultar', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useClienteSearch('luis', []))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.error).toBe(true)
    expect(result.current.resultados).toEqual([])

    fetchMock.mockResolvedValueOnce(respuesta([cli('7', 'Luis Alfonso')]))
    act(() => result.current.reintentar())
    expect(result.current.error).toBe(false)
    expect(result.current.buscando).toBe(true)
    await avanzar(DEBOUNCE_MS + 10)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.resultados.map((c) => c.id)).toEqual(['7'])
    expect(result.current.error).toBe(false)
  })

  it('5xx cuenta como error; 401/403 no (no hay nada que reintentar)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta([], { ok: false, status: 503 }))
    const a = renderHook(() => useClienteSearch('luis', []))
    await avanzar(DEBOUNCE_MS + 10)
    expect(a.result.current.error).toBe(true)

    fetchMock.mockResolvedValueOnce(respuesta([], { ok: false, status: 403 }))
    const b = renderHook(() => useClienteSearch('luis', []))
    await avanzar(DEBOUNCE_MS + 10)
    expect(b.result.current.error).toBe(false)
    expect(b.result.current.buscando).toBe(false)
  })

  it('el servidor nunca reemplaza lo que la lista local ya encuentra (búsqueda por relación del contacto)', async () => {
    const conContacto = { ...cli('5', 'Juan Pérez'), contactos: [{ nombre: 'María', telefono: '3119876543', relacion: 'esposa' }] } as Cliente
    // el servidor hoy no busca la relación: devuelve otro cliente irrelevante
    fetchMock.mockResolvedValue(respuesta([cli('8', 'Alguien Más')]))
    const { result } = renderHook(() => useClienteSearch('esposa', [conContacto]))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.resultados.map((c) => c.id)).toContain('5')
  })

  it('ordena por relevancia (nombre antes que coincidencia en notas)', async () => {
    const enNotas = { ...cli('20', 'Otro'), notas: 'amigo de zulma' } as Cliente
    const enNombre = cli('21', 'Zulma Carmen')
    fetchMock.mockResolvedValue(respuesta([enNotas, enNombre]))
    const { result } = renderHook(() => useClienteSearch('zulma', []))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.resultados.map((c) => c.id)).toEqual(['21', '20'])
  })

  it('si el servidor responde vacío pero la lista local sí coincide, no vacía el listado', async () => {
    fetchMock.mockResolvedValue(respuesta([]))
    const { result } = renderHook(() => useClienteSearch('car', LOCALES))
    await avanzar(DEBOUNCE_MS + 10)
    expect(result.current.resultados.map((c) => c.id)).toEqual(['1'])
  })

  it('un timeout de la petición cuenta como error', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
      }))
    const { result } = renderHook(() => useClienteSearch('luis', []))
    await avanzar(DEBOUNCE_MS + 8_000 + 50)
    expect(result.current.error).toBe(true)
  })
})
