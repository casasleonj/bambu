import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEnvioHabituales } from '../use-envio-habituales'
import type { EnvioHabituales } from '@/lib/habituales-contrato'
vi.mock('@/lib/uuid', () => ({ generateUUID: () => 'lote-nuevo' }))
const decisiones: EnvioHabituales['decisiones'] = [
  {
    recurrenteId: 'r1',
    decision: 'NORMAL',
    proximaFecha: '2026-09-01T12:00:00.000Z',
    version: '2026-09-01T00:00:00.000Z',
  },
]
const key = (actor = 'u') => `bambu:habituales:intento:v1:${actor}`
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const estado = (body: EnvioHabituales) => ({
  success: true,
  ...body,
  estado: 'COMPLETO',
  pendientes: 0,
  items: [
    {
      recurrenteId: 'r1',
      decision: 'NORMAL',
      estado: 'GENERADO',
      pedidoId: 'pedido1',
      numero: 12,
    },
  ],
})
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Envío manual recuperable de habituales', () => {
  it('recupera una referencia al recargar sin ejecutar POST ni otra mutación', () => {
    localStorage.setItem(
      key(),
      JSON.stringify({ offlineId: 'guardado', decisiones }),
    )
    const h = renderHook(() => useEnvioHabituales('u'))
    expect(h.result.current.envio?.offlineId).toBe('guardado')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('una respuesta perdida conserva cuerpo y clave en el reintento explícito', async () => {
    let intentos = 0
    let enviado: EnvioHabituales
    fetchMock.mockImplementation(
      async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          enviado = JSON.parse(options.body as string)
          if (++intentos === 1) throw new TypeError('Sin conexión')
          return json({ success: true }, 200)
        }
        return intentos === 1
          ? json({
              success: true,
              ...enviado,
              estado: 'PENDIENTE',
              pendientes: 1,
              items: [
                { recurrenteId: 'r1', decision: 'NORMAL', estado: 'PENDIENTE' },
              ],
            })
          : json(estado(enviado))
      },
    )
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await h.result.current.enviar(decisiones)
    })
    const primero = localStorage.getItem(key())
    expect(primero).toBeTruthy()
    expect(h.result.current.resultado).toBeNull()
    expect(h.result.current.error).toMatch(/conexión.*conservamos este envío/i)
    await act(async () => {
      await h.result.current.consultar()
    })
    await act(async () => {
      await h.result.current.enviar()
    })
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[0][1].body).toBe(posts[1][1].body)
    expect(localStorage.getItem(key())).toBe(primero)
    expect(h.result.current.resultado?.estado).toBe('COMPLETO')
    act(() => {
      expect(h.result.current.cerrarResultado()).toBe(true)
    })
    expect(localStorage.getItem(key())).toBeNull()
  })
  it('el resultado de otra pestaña nunca se atribuye a una referencia nueva', async () => {
    const previo = { offlineId: 'previo', decisiones }
    localStorage.setItem(key(), JSON.stringify(previo))
    fetchMock.mockResolvedValue(json(estado(previo)))
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await h.result.current.consultar()
    })
    expect(h.result.current.resultado?.estado).toBe('COMPLETO')
    act(() => {
      localStorage.setItem(
        key(),
        JSON.stringify({ offlineId: 'otro-tab', decisiones }),
      )
      window.dispatchEvent(new Event('bambu:habituales-intento'))
    })
    expect(h.result.current.envio?.offlineId).toBe('otro-tab')
    expect(h.result.current.resultado).toBeNull()
    expect(h.result.current.consultado).toBe(false)
    act(() => {
      expect(h.result.current.cerrarResultado()).toBe(false)
    })
    expect(localStorage.getItem(key())).toContain('otro-tab')
  })
  it('doble clic en el mismo turno de eventos no envía dos POST', async () => {
    let enviado: EnvioHabituales
    fetchMock.mockImplementation(
      async (_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          enviado = JSON.parse(options.body as string)
          return json({ success: true }, 201)
        }
        return json(estado(enviado))
      },
    )
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await Promise.all([
        h.result.current.enviar(decisiones),
        h.result.current.enviar(decisiones),
      ])
    })
    expect(
      fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST'),
    ).toHaveLength(1)
    expect(h.result.current.resultado?.estado).toBe('COMPLETO')
    expect(h.result.current.error).toBeNull()
  })
  it('un error 500 no permite desechar la referencia ni asegura que haya cero pedidos', async () => {
    fetchMock.mockResolvedValue(
      json({ success: false, error: { message: 'Error de servidor' } }, 500),
    )
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await h.result.current.enviar(decisiones)
    })
    expect(h.result.current.envio).not.toBeNull()
    expect(h.result.current.resultado).toBeNull()
    act(() => {
      expect(h.result.current.revisarRechazo()).toBe(false)
    })
    expect(localStorage.getItem(key())).not.toBeNull()
  })
  it('no envía si no puede conservar la referencia, y explica el problema sin detalles técnicos', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await h.result.current.enviar(decisiones)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.result.current.error).toMatch(/no se pudo conservar/i)
  })
  it('rechaza un resultado con otra clave o una selección distinta', async () => {
    localStorage.setItem(
      key(),
      JSON.stringify({ offlineId: 'esperado', decisiones }),
    )
    fetchMock.mockResolvedValue(json(estado({ offlineId: 'otro', decisiones })))
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      await h.result.current.consultar()
    })
    expect(h.result.current.resultado).toBeNull()
    expect(h.result.current.envio?.offlineId).toBe('esperado')
  })
  it('un 409 concurrente recupera el resultado ya confirmado en vez de exigir otro envío', async () => {
    const previo = { offlineId: 'simultaneo', decisiones }
    localStorage.setItem(key(), JSON.stringify(previo))
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) =>
      options?.method === 'POST'
        ? json(
            { success: false, error: { message: 'Cambió el calendario' } },
            409,
          )
        : json(estado(previo)),
    )
    const h = renderHook(() => useEnvioHabituales('u'))
    await act(async () => {
      expect(await h.result.current.enviar()).toBe(true)
    })
    expect(h.result.current.resultado?.estado).toBe('COMPLETO')
    expect(h.result.current.error).toBeNull()
    expect(
      fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST'),
    ).toHaveLength(1)
  })
})
