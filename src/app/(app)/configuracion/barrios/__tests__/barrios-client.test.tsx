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

  it('"Mostrar archivados" filtra a SOLO archivados, no mezcla con los activos', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)

    // La API (incluirInactivos=1) devuelve activos Y archivados juntos —
    // el componente debe quedarse solo con los archivados para mostrar,
    // no mostrar la mezcla cruda que llega del backend.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          success: true,
          data: [
            { id: 'b1', nombre: 'El Carmen', activo: true, _count: { clientes: 3, negocios: 1 } },
            { id: 'b2', nombre: 'La Gaitana', activo: false, _count: { clientes: 0, negocios: 0 } },
          ],
        }),
      ),
    )

    fireEvent.click(screen.getByLabelText('Mostrar archivados'))
    await act(async () => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      expect(screen.getByText('La Gaitana')).toBeInTheDocument()
    })
    expect(screen.queryByText('El Carmen')).not.toBeInTheDocument()
  })

  it('la búsqueda inicial pide incluirRelaciones=1 (para mostrar alias/referencias completos, no solo coincidencias)', async () => {
    render(<BarriosClient initialBarrios={INITIAL_BARRIOS} />)
    fetchMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('Buscar barrio...'), { target: { value: 'carmen' } })
    await act(async () => { vi.advanceTimersByTime(300) })

    await waitFor(() => {
      const calledUrl = fetchMock.mock.calls.find(([url]) => typeof url === 'string' && url.startsWith('/api/barrios?'))?.[0]
      expect(calledUrl).toContain('incluirRelaciones=1')
    })
  })
})

describe('BarriosClient — F4 alias y referencias territoriales', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const LA_ANTILLANA = {
    id: 'b1',
    nombre: 'La Antillana',
    activo: true,
    _count: { clientes: 2, negocios: 0 },
    aliases: [{ id: 'a1', texto: 'Antillana' }],
    referencias: [
      { id: 'r1', texto: 'Antillana 1' },
      { id: 'r2', texto: 'Antillana 2' },
    ],
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock = vi.fn()
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] })))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra "También se conoce como" y "Referencias comunes" como secciones separadas, nunca agrupadas', () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    expect(screen.getByText('También se conoce como')).toBeInTheDocument()
    expect(screen.getByText('Referencias comunes')).toBeInTheDocument()
    expect(screen.getByText('Antillana')).toBeInTheDocument()
    expect(screen.getByText('Antillana 1')).toBeInTheDocument()
    expect(screen.getByText('Antillana 2')).toBeInTheDocument()
  })

  it('"+ Agregar" abre el formulario con las dos opciones, sin mostrar "alias"/"referencia" como términos técnicos', () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    fireEvent.click(screen.getByText('+ Agregar'))

    expect(screen.getByText('¿Qué quieres registrar?')).toBeInTheDocument()
    expect(screen.getByText('Otro nombre para este barrio')).toBeInTheDocument()
    expect(screen.getByText('Una referencia para ubicarlo mejor')).toBeInTheDocument()
    expect(screen.queryByText(/\bALIAS\b/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bREFERENCIA\b/)).not.toBeInTheDocument()
  })

  it('registrar "Otro nombre" llama a POST /api/barrios/[id]/alias', async () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1/alias' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, alias: { id: 'a2', texto: 'La Antilla' } }, 201))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    fireEvent.click(screen.getByText('+ Agregar'))
    // "Otro nombre" ya es el radio seleccionado por defecto.
    fireEvent.change(screen.getByPlaceholderText('Texto'), { target: { value: 'La Antilla' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios/b1/alias',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ texto: 'La Antilla' }) }),
      )
    })
  })

  it('registrar "Una referencia" llama a POST /api/barrios/[id]/referencias', async () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1/referencias' && method === 'POST') {
        return Promise.resolve(jsonResponse({ success: true, referencia: { id: 'r3', texto: 'Antillana 3' } }, 201))
      }
      if (url.startsWith('/api/barrios?') && method === 'GET') {
        return Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] }))
      }
      return Promise.resolve(jsonResponse({ success: false }, 500))
    })

    fireEvent.click(screen.getByText('+ Agregar'))
    fireEvent.click(screen.getByText('Una referencia para ubicarlo mejor'))
    fireEvent.change(screen.getByPlaceholderText('Texto'), { target: { value: 'Antillana 3' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/barrios/b1/referencias',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ texto: 'Antillana 3' }) }),
      )
    })
  })

  it('un conflicto (409, bloqueo duro) se muestra como toast de error, sin romper el formulario', async () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)
    const { toast } = await import('sonner')

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1/alias' && method === 'POST') {
        return Promise.resolve(
          jsonResponse({ success: false, error: { message: '"El Cafetal" ya es el nombre del barrio "El Cafetal".' } }, 409),
        )
      }
      return Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] }))
    })

    fireEvent.click(screen.getByText('+ Agregar'))
    fireEvent.change(screen.getByPlaceholderText('Texto'), { target: { value: 'El Cafetal' } })
    fireEvent.click(screen.getByText('Guardar'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('"El Cafetal" ya es el nombre del barrio "El Cafetal".')
    })
  })

  it('quitar un chip de alias llama a DELETE /api/barrios/[id]/alias/[aliasId]', async () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1/alias/a1' && method === 'DELETE') {
        return Promise.resolve(jsonResponse({ success: true, ok: true }))
      }
      return Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] }))
    })

    fireEvent.click(screen.getByLabelText('Quitar "Antillana"'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/barrios/b1/alias/a1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  it('quitar un chip de referencia llama a DELETE /api/barrios/[id]/referencias/[referenciaId]', async () => {
    render(<BarriosClient initialBarrios={[LA_ANTILLANA]} />)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (url === '/api/barrios/b1/referencias/r1' && method === 'DELETE') {
        return Promise.resolve(jsonResponse({ success: true, ok: true }))
      }
      return Promise.resolve(jsonResponse({ success: true, data: [LA_ANTILLANA] }))
    })

    fireEvent.click(screen.getByLabelText('Quitar "Antillana 1"'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/barrios/b1/referencias/r1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  it('un usuario sin permiso de escritura de referencias (ASISTENTE) no ve "+ Agregar" ni los botones de quitar', async () => {
    vi.resetModules()
    vi.doMock('next-auth/react', () => ({
      useSession: () => ({ data: { user: { role: 'ASISTENTE' } } }),
    }))
    const { default: BarriosClientAsistente } = await import('../barrios-client')
    render(<BarriosClientAsistente initialBarrios={[LA_ANTILLANA]} />)

    expect(screen.queryByText('+ Agregar')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quitar "Antillana"')).not.toBeInTheDocument()
    // Pero sí ve las secciones en modo lectura.
    expect(screen.getByText('También se conoce como')).toBeInTheDocument()
  })
})
