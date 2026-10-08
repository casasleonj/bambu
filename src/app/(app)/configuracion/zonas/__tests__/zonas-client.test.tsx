// @tests ZonasClient — picker "Buscar o agregar barrio..." (F3 Zona territorial)
//
// Zona consume el catálogo canónico de Barrio, NUNCA crea barrios nuevos
// (eso vive exclusivamente en /configuracion/barrios — ver barrios-client.tsx).
// Un "+ Crear" directo desde Zona se intentó en un primer momento pero el
// equipo lo revirtió explícitamente: generaba duplicados/variantes
// innecesarias del catálogo (evidencia real: "Libano" / "El Libano",
// "Laureles" / "Los Laureles", "Primero de Mayo" / "El 1 de Mayo"). En su
// lugar, cuando la búsqueda no encuentra nada, el picker explica dónde
// administrar el catálogo y ofrece un link directo — nunca un mensaje
// genérico sin salida.
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

describe('ZonasClient — picker de barrio', () => {
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

  it('un barrio que no está en el catálogo canónico: explica dónde administrarlo y ofrece un link directo, NUNCA "+ Crear"', async () => {
    await abrirZonaNorte()

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    expect(await screen.findByText('No encontramos este barrio en el catálogo.')).toBeInTheDocument()
    expect(screen.getByText(/Configuración → Territorio → Barrios/)).toBeInTheDocument()
    const link = screen.getByText('Ir al catálogo de barrios →')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/configuracion/barrios')

    // Nunca se ofrece crear un barrio nuevo desde acá — Zona solo consume
    // el catálogo canónico, nunca lo escribe.
    expect(screen.queryByText(/\+ Crear/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/barrios', expect.objectContaining({ method: 'POST' }))
  })

  it('seleccionar un barrio existente del catálogo lo agrega directo a la zona (sin solapamiento)', async () => {
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
              barrios: [{ barrioId: 'b1', barrio: { id: 'b1', nombre: 'San José' }, source: 'USER', otrasZonas: [] }],
            },
          }),
        )
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [{ id: 'b1', nombre: 'San José' }] }))
      }
      if (url === '/api/zonas/z1/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, zonaBarrio: {}, overlapDetected: false, existingZones: [] }, 201))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'San José' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    fireEvent.click(await screen.findByText('San José'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/zonas/z1/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barrioId: 'b1', confirmOverlap: false }) }),
      )
    })
    expect(await screen.findAllByText('San José')).not.toHaveLength(0)
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
              barrios: [{ barrioId: 'b1', barrio: { id: 'b1', nombre: 'San José' }, source: 'USER', otrasZonas: [] }],
            },
          }),
        )
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [{ id: 'b1', nombre: 'San José' }] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'San José' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.click(await screen.findByText('San José'))

    // Sin recargar la página: el contador del panel izquierdo pasa de "0
    // barrios" a "1 barrio" solo porque el estado se refrescó.
    await waitFor(() => {
      expect(screen.getByText('1 barrio · Activa')).toBeInTheDocument()
    })
    expect(screen.queryByText('0 barrios · Activa')).not.toBeInTheDocument()
  })

  it('F4: buscar un texto que matchea por alias/referencia muestra el barrio canónico con "Coincide con: X", y agrega barrioId del canónico (nunca el texto buscado)', async () => {
    await abrirZonaNorte()

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url.startsWith('/api/zonas?')) return Promise.resolve(jsonResponse({ success: true, data: INITIAL_ZONAS }))
      if (url === '/api/zonas/z1' && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, zona: { id: 'z1', nombre: 'Norte', activo: true, barrios: [] } }))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [{ id: 'b1', nombre: 'La Antillana', referenciasCoincidentes: ['Antillana 2'] }],
          }),
        )
      }
      if (url === '/api/zonas/z1/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, zonaBarrio: {}, overlapDetected: false, existingZones: [] }, 201))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Buscar o agregar barrio...')
    fireEvent.change(input, { target: { value: 'Antillana 2' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    expect(await screen.findByText('La Antillana')).toBeInTheDocument()
    expect(screen.getByText('Coincide con: Antillana 2')).toBeInTheDocument()

    fireEvent.click(screen.getByText('La Antillana'))

    await waitFor(() => {
      // El barrioId que viaja es el del Barrio canónico (b1) — nunca el
      // texto buscado ("Antillana 2"), ni se toca ningún otro campo.
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/zonas/z1/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ barrioId: 'b1', confirmOverlap: false }) }),
      )
    })
  })
})
