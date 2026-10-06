// @tests ZonasClient — picker "Buscar o agregar barrio..." (F3 Zona territorial)
//
// Motivado por feedback real del equipo probando la demo: un término que
// los clientes ya tienen como texto libre (ej. "Chapinero") no aparecía en
// el picker, sin salida. Causa: el picker busca sobre el catálogo canónico
// `Barrio` (vacío en un dev DB recién sincronizado, ver seed.ts), no sobre
// el texto libre histórico `Cliente.barrio` — son cosas distintas a
// propósito (ALS Barrio F1). El fix agrega "+ Crear" al picker, mismo
// patrón que el selector de Barrio de Cliente/Negocio (`BarrioSelect`).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ZonasClient from '../zonas-client'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'ADMIN' } } }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const INITIAL_ZONAS = [{ id: 'z1', nombre: 'Norte', activo: true, _count: { barrios: 0 } }]

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('ZonasClient — picker de barrio: "+ Crear" al vuelo', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  /** Renderiza, abre la zona "Norte" (sin barrios todavía). */
  async function abrirZonaNorte() {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) {
        return Promise.resolve(jsonResponse({ success: true, data: INITIAL_ZONAS }))
      }
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({ success: true, zona: { id: 'z1', nombre: 'Norte', activo: true, barrios: [] } }),
        )
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    render(<ZonasClient initialZonas={INITIAL_ZONAS} />)
    fireEvent.click(await screen.findByText('Norte'))
    await screen.findByText('Barrios de esta zona')
  }

  it('un término que los clientes ya tienen como texto libre (sin Barrio canónico) no aparece: "Sin resultados" + "+ Crear"', async () => {
    await abrirZonaNorte()

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    expect(await screen.findByText('Sin resultados.')).toBeInTheDocument()
    expect(screen.getByText('+ Crear "Chapinero"')).toBeInTheDocument()
  })

  it('"+ Crear" crea el Barrio canónico y lo agrega a la zona en el mismo paso', async () => {
    await abrirZonaNorte()

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) return Promise.resolve(jsonResponse({ success: true, data: INITIAL_ZONAS }))
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            zona: {
              id: 'z1',
              nombre: 'Norte',
              activo: true,
              barrios: [{ barrioId: 'b-new', barrio: { id: 'b-new', nombre: 'Chapinero' }, source: 'USER', otrasZonas: [] }],
            },
          }),
        )
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') return Promise.resolve(jsonResponse({ success: true, data: [] }))
      if (url === '/api/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, barrio: { id: 'b-new', nombre: 'Chapinero' } }, 201))
      }
      if (url === '/api/zonas/z1/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, zonaBarrio: {}, overlapDetected: false, existingZones: [] }, 201))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    fireEvent.click(await screen.findByText('+ Crear "Chapinero"'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre: 'Chapinero' }) }),
      )
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/zonas/z1/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barrioId: 'b-new', confirmOverlap: false }) }),
      )
    })

    // El barrio recién creado queda visible en la lista de la zona.
    expect(await screen.findAllByText('Chapinero')).not.toHaveLength(0)
  })

  it('"+ Crear" ante 409 (el Barrio ya existía) reutiliza el existente en vez de fallar', async () => {
    await abrirZonaNorte()

    let barriosGetCalls = 0
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) return Promise.resolve(jsonResponse({ success: true, data: INITIAL_ZONAS }))
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, zona: { id: 'z1', nombre: 'Norte', activo: true, barrios: [] } }))
      }
      if (url === '/api/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: false, error: { message: 'Ya existe un barrio con ese nombre' } }, 409))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        barriosGetCalls++
        // 1ra búsqueda (al escribir): sin resultados. 2da (reintento tras
        // el 409): aparece el barrio que ya existía.
        if (barriosGetCalls === 1) return Promise.resolve(jsonResponse({ success: true, data: [] }))
        return Promise.resolve(jsonResponse({ success: true, data: [{ id: 'b-existente', nombre: 'Chapinero' }] }))
      }
      if (url === '/api/zonas/z1/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, zonaBarrio: {}, overlapDetected: false, existingZones: [] }, 201))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    fireEvent.click(await screen.findByText('+ Crear "Chapinero"'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/zonas/z1/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barrioId: 'b-existente', confirmOverlap: false }) }),
      )
    })
  })

  it('si ya existe un match exacto en el catálogo, no se ofrece "+ Crear"', async () => {
    await abrirZonaNorte()

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) return Promise.resolve(jsonResponse({ success: true, data: INITIAL_ZONAS }))
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, zona: { id: 'z1', nombre: 'Norte', activo: true, barrios: [] } }))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [{ id: 'b1', nombre: 'Chapinero' }] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    expect(await screen.findAllByText('Chapinero')).not.toHaveLength(0)
    expect(screen.queryByText('+ Crear "Chapinero"')).not.toBeInTheDocument()
  })

  it('agregar un barrio refresca también el contador "X barrios" del panel izquierdo, sin recargar la página', async () => {
    await abrirZonaNorte()
    expect(screen.getByText('0 barrios · Activa')).toBeInTheDocument()

    // Flag atada al POST real de alta (no a un contador de llamadas): un
    // timer de refresco de la lista que ya estuviera en vuelo desde
    // `abrirZonaNorte` (debounce de 300ms del mount) podría disparar un
    // GET /api/zonas extra en cualquier momento — contar llamadas sería
    // frágil. Lo que importa es que el conteo refleje el alta real.
    let barrioAgregado = false
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [{ id: 'z1', nombre: 'Norte', activo: true, _count: { barrios: barrioAgregado ? 1 : 0 } }],
          }),
        )
      }
      if (url === '/api/zonas/z1/barrios' && method === 'POST') {
        barrioAgregado = true
        return Promise.resolve(jsonResponse({ success: true, zonaBarrio: {}, overlapDetected: false, existingZones: [] }, 201))
      }
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            zona: {
              id: 'z1',
              nombre: 'Norte',
              activo: true,
              barrios: [{ barrioId: 'b-new', barrio: { id: 'b-new', nombre: 'Chapinero' }, source: 'USER', otrasZonas: [] }],
            },
          }),
        )
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') return Promise.resolve(jsonResponse({ success: true, data: [] }))
      if (url === '/api/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, barrio: { id: 'b-new', nombre: 'Chapinero' } }, 201))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.click(await screen.findByText('+ Crear "Chapinero"'))

    // Sin recargar la página: el contador del panel izquierdo pasa de "0
    // barrios" a "1 barrio" solo porque el estado se refrescó.
    await waitFor(() => {
      expect(screen.getByText('1 barrio · Activa')).toBeInTheDocument()
    })
    expect(screen.queryByText('0 barrios · Activa')).not.toBeInTheDocument()
  })
})
