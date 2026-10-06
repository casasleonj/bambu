// @tests BarriosClient — catálogo canónico de Barrio (/configuracion/barrios)
//
// Pantalla nueva: cierra el gap identificado al revisar Zona F3 — el
// servicio/API de Barrio existe desde F1 (barrio-service.ts), pero no
// había una pantalla de administración del catálogo. Es el destino real
// del link "Ir al catálogo de barrios" que ofrece el picker de Zona.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import BarriosClient from '../barrios-client'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'ADMIN' } } }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const INITIAL_BARRIOS = [
  { id: 'b1', nombre: 'El Carmen', activo: true, _count: { clientes: 3, negocios: 1 } },
]

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('BarriosClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock = vi.fn()
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ success: true, data: INITIAL_BARRIOS })))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra el catálogo inicial con conteo de clientes/negocios', () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)
    expect(screen.getByText('El Carmen')).toBeInTheDocument()
    expect(screen.getByText('3 clientes · 1 negocio')).toBeInTheDocument()
  })

  it('crear un barrio nuevo llama a POST /api/barrios y refresca la lista', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, barrio: { id: 'b2', nombre: 'Chapinero' } }, 201))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: [...INITIAL_BARRIOS, { id: 'b2', nombre: 'Chapinero', activo: true, _count: { clientes: 0, negocios: 0 } }],
          }),
        )
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    const input = screen.getByPlaceholderText('Nombre del barrio nuevo')
    fireEvent.change(input, { target: { value: 'Chapinero' } })
    fireEvent.click(screen.getByText('+ Nuevo barrio'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre: 'Chapinero' }) }),
      )
    })
    expect(await screen.findByText('Chapinero')).toBeInTheDocument()
  })

  it('renombrar un barrio llama a PATCH /api/barrios/[id]', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1' && method === 'PATCH') {
        return Promise.resolve(jsonResponse({ success: true, barrio: { id: 'b1', nombre: 'El Carmen Alto', activo: true } }))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({ success: true, data: [{ id: 'b1', nombre: 'El Carmen Alto', activo: true, _count: { clientes: 3, negocios: 1 } }] }),
        )
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    fireEvent.click(screen.getByText('Renombrar'))
    const input = screen.getByDisplayValue('El Carmen')
    fireEvent.change(input, { target: { value: 'El Carmen Alto' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios/b1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nombre: 'El Carmen Alto' }) }),
      )
    })
    expect(await screen.findByText('El Carmen Alto')).toBeInTheDocument()
  })

  it('archivar un barrio llama a PATCH con activo:false', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1' && method === 'PATCH') {
        return Promise.resolve(jsonResponse({ success: true, barrio: { id: 'b1', nombre: 'El Carmen', activo: false } }))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    fireEvent.click(screen.getByText('Archivar'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios/b1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ activo: false }) }),
      )
    })
  })

  it('la búsqueda está debounced y envía incluirInactivos=1 cuando se marca "Mostrar archivados"', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)
    fetchMock.mockClear()

    fireEvent.click(screen.getByLabelText('Mostrar archivados'))
    await act(async () => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      const calledUrl = fetchMock.mock.calls.find(([url]) => typeof url === 'string' && url.startsWith('/api/barrios?'))?.[0]
      expect(calledUrl).toContain('incluirInactivos=1')
    })
  })
})
