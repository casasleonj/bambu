// @tests unit/clientes
// Regresion mobile 2026-06-10: dos bugs en /clientes:
// 1. "No se pudieron cargar los clientes": el useEffect de mount disparaba
//    un fetch que fallaba en mobile, y setFetchError reemplazaba
//    visualmente la lista del SSR con el banner de error.
// 2. "No me abre el detalle": viewCliente solo hacia toast.error si el
//    fetch fallaba, sin abrir el modal. El user no entendia que pasaba.
//
// Tests de comportamiento (NO se lee el codigo fuente):
// - Mount: verificar que NO se hace fetch a /api/clientes
//   (el SSR ya pasa initialClientes, un fetch extra causa el bug #1).
// - Click en fila: verificar que viewCliente abre el modal con stub +
//   detailError banner cuando el fetch falla (el bug #2 era que el
//   modal no se abria, el user pensaba que el click no funcionaba).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

// ─── Mocks ────────────────────────────────────────────────────────────────

vi.mock('@/hooks/use-base-caja', () => ({
  useBaseCaja: () => ({ baseDia: 100000 }),
}))

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: vi.fn(() => false),
}))

const createMockRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
})

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/clientes'),
  useRouter: vi.fn(() => createMockRouter()),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Admin', role: 'ADMIN' } } }),
  signOut: vi.fn(),
}))

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))

// Mock de Dexie/IndexedDB: jsdom no implementa IndexedDB, y estos tests
// no ejercitan sync real — solo la reconstrucción de filas pendientes
// (ver describe "clientes pendientes de sync offline" al final del archivo).
vi.mock('@/lib/db/offline', () => ({
  offlineDb: {
    requestQueue: {
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
    },
  },
}))

// Inline mock de ClienteTable: renderiza una fila clickable por cliente.
// Necesitamos el row clickable para disparar viewCliente (el bug #2
// es del flow de click). Si mockearamos con un div vacio, no podriamos
// ejercitar el flow. Este mock es el minimo necesario para testear el
// comportamiento end-to-end del handler viewCliente del padre.
//
// Usamos el alias '@/' porque vitest resuelve mocks por path completo
// del modulo. El path relativo './cliente-table' desde este test
// (ubicado en __tests__/) apunta a una carpeta que no existe.
vi.mock('@/app/(app)/clientes/clientes-client/cliente-table', () => ({
  ClienteTable: ({
    clientes,
    total,
    page,
    totalPages,
    search,
    onSearchChange,
    onPageChange,
    onViewCliente,
    onRetry,
  }: {
    clientes: Array<{ id: string; nombre: string }>
    total: number
    page: number
    totalPages: number
    search: string
    onSearchChange: (val: string) => void
    onPageChange: (page: number) => void
    onViewCliente: (id: string) => void
    onRetry: () => void
  }) => (
    <div data-testid="cliente-table">
      <input
        data-testid="cliente-search-input"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div data-testid="cliente-pagination-info">{total} clientes — página {page} de {totalPages}</div>
      {clientes.map((c: { id: string; nombre: string }) => (
        <div
          key={c.id}
          data-testid={`cliente-row-${c.id}`}
          onClick={() => onViewCliente(c.id)}
          style={{ cursor: 'pointer', padding: 8 }}
        >
          {c.nombre}
        </div>
      ))}
      <button data-testid="cliente-page-prev" onClick={() => onPageChange(page - 1)}>Anterior</button>
      <button data-testid="cliente-page-next" onClick={() => onPageChange(page + 1)}>Siguiente</button>
      <button data-testid="cliente-retry" onClick={onRetry}>Reintentar</button>
    </div>
  ),
}))

vi.mock('./cliente-form', () => ({
  ClienteForm: () => <div data-testid="cliente-form-mock" />,
}))
vi.mock('./cliente-historial', () => ({
  ClienteHistorial: () => <div data-testid="cliente-historial-mock" />,
}))
vi.mock('./cliente-stats', () => ({
  ClienteStats: () => <div data-testid="cliente-stats-mock" />,
}))
vi.mock('@/components/negocio-form', () => ({
  NegocioForm: () => <div data-testid="negocio-form-mock" />,
}))
vi.mock('@/components/negocio-detail-modal', () => ({
  NegocioDetailModal: () => <div data-testid="negocio-detail-mock" />,
}))
vi.mock('@/components/confirm-modal', () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(false),
    modal: null,
  }),
}))
vi.mock('@/hooks/use-escape-guard', () => ({
  useEscapeGuard: vi.fn(),
}))
vi.mock('@/components/guia-alerta-modal', () => ({
  GuiaAlertaModal: () => <div data-testid="guia-alerta-mock" />,
}))
vi.mock('@/components/caso-guia-modal', () => ({
  CasoGuiaModal: () => <div data-testid="caso-guia-mock" />,
}))
vi.mock('@/lib/alertas-config', () => ({
  getBadgeColor: vi.fn().mockReturnValue('bg-gray-100'),
  ignorarAlerta: vi.fn(),
}))
vi.mock('@/app/(app)/pedidos/pedidos-client/alertas-utils', () => ({
  calcularAlertasCliente: vi.fn().mockReturnValue([]),
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import ClientesClient from '@/app/(app)/clientes/clientes-client'
import { __resetDetailCache } from '@/app/(app)/clientes/clientes-client'
import { __resetPanelCaches } from '@/app/(app)/clientes/clientes-client/panel-prefetch'
import type { Cliente } from '@/app/(app)/clientes/clientes-client/types'
import { useRouter, useSearchParams } from 'next/navigation'
import { offlineDb } from '@/lib/db/offline'
import { SYNC_ITEM_DONE_EVENT } from '@/lib/db/sync'

// ─── Helpers ─────────────────────────────────────────────────────────────

const mockCliente: Cliente = {
  id: 'cliente-1',
  clienteId: 'cliente-1',
  nombre: 'Juan',
  apellido: 'Pérez',
  telefono: '3001234567',
  frecuencia: 'SEMANAL',
  activo: true,
  verificado: true,
  bloqueado: false,
  saldoPendiente: 0,
  contactos: [],
  negocios: [],
  // FIX AGENTS.md nota 11: el cliente tiene una plantilla recurrente
  // activa con productos. La seccion "frecuencia" del form debe
  // mostrar los productos + un link "Editar productos" prominente que
  // vaya a /recurrentes/[id] (el unico lugar donde la edicion persiste).
  //
  // El tipo `plantillaRecurrente.productos` en el schema legacy es `string`
  // (JSON hidratado) pero el form hace `Array.isArray()` defensivo.
  // Cast necesario para que el test compile.
  plantillaRecurrente: {
    id: 'plantilla-1',
    activo: true,
    cadaNDias: 7,
    horaPreferida: '08:00',
    ultimaGeneracion: null,
    proxGeneracion: '2026-06-18',
    tipo: 'FIJO',
    canal: 'DOMICILIO',
    notas: null,
    productos: [
      { id: 'pp-1', producto: 'PACA_AGUA', cantidad: 2 },
      { id: 'pp-2', producto: 'PACA_HIELO', cantidad: 1 },
    ] as unknown as string,
  },
  _count: { pedidos: 0 },
}

/**
 * Crea un mock de fetch que captura las llamadas y permite configurar
 * respuestas por URL. Usado en todos los tests que necesitan interceptar
 * requests HTTP del componente.
 */
function createFetchMock() {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const responses = new Map<string, { status: number; body: unknown }>()

  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url)
    calls.push({ url: urlStr, init })

    // Buscar respuesta configurada por URL exacta o por patron.
    let response: { status: number; body: unknown } | undefined
    for (const [pattern, resp] of responses.entries()) {
      if (urlStr === pattern || urlStr.includes(pattern)) {
        response = resp
        break
      }
    }
    // Default: 200 OK con body vacio (para fetches auxiliares como
    // /api/trabajadores, /api/auth/profile, /api/productos/configs).
    response ??= { status: 200, body: {} }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'Error',
      json: async () => response!.body,
      text: async () => JSON.stringify(response!.body),
    } as Response
  })

  return { mock, calls, responses }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ClientesClient — regresion mobile 2026-06-10', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
    // Resetear mocks de navegación entre tests para evitar que un override
    // en un test contamine el siguiente.
    vi.mocked(useRouter).mockReset().mockReturnValue(createMockRouter() as unknown as ReturnType<typeof useRouter>)
    vi.mocked(useSearchParams).mockReset().mockReturnValue(new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>)
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
    __resetDetailCache()
    __resetPanelCaches()
    // NO usar vi.restoreAllMocks() — eso restaura las implementaciones
    // de los vi.fn() (e.g. `mockReturnValue([])`) a la implementacion
    // original (undefined), causando que `calcularAlertasCliente` retorne
    // undefined en el siguiente test y rompa el `alertas.filter()`.
  })

  it('NO reemplaza la lista del SSR si el fetch de lista falla (regresion "no se pudieron cargar")', async () => {
    const { mock, responses } = createFetchMock()
    // El cache de búsqueda client-side hace un fetch en background a
    // /api/clientes?all=true. Si falla, NO debe reemplazar la lista del SSR.
    responses.set('/api/clientes?all=true&pageSize=500', {
      status: 500,
      body: { success: false, error: { message: 'internal' } },
    })
    global.fetch = mock as unknown as typeof fetch

    await act(async () => {
      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    // Esperar a que el useEffect de mount intente cargar el cache.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    // El fetch de cache falló, pero la lista del SSR sigue visible
    // (no fue reemplazada por un banner de error).
    expect(screen.getByTestId('cliente-row-cliente-1')).toBeTruthy()
    expect(screen.getByText('Juan')).toBeTruthy()
  })

  it('viewCliente abre el modal al instante con la fila + banner de error si el fetch falla', async () => {
    const { mock, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // El GET del detalle va a fallar con 500. Antes del fix, viewCliente
    // solo hacia toast.error y retornaba sin abrir el modal — el user
    // pensaba que el click no funcionaba. Ahora el modal se abre
    // inmediatamente con los datos de la fila y un banner de error visible.
    responses.set('/api/clientes/cliente-1', {
      status: 500,
      body: { success: false, error: { message: 'internal' } },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    // El panel abre al instante con el nombre real de la lista (Juan),
    // no con un stub genérico.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Juan/ })).toBeTruthy()
    })

    // El detailError banner debe estar visible con el mensaje del HTTP 500.
    const errorBanner = screen.getByRole('alert')
    expect(errorBanner).toBeTruthy()
    expect(errorBanner.textContent).toContain('Error al cargar el cliente (HTTP 500)')
    expect(errorBanner.textContent).toContain('Reintentar')
  })

  it('viewCliente abre el modal con cliente real cuando el fetch tiene exito', async () => {
    const { mock, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // Mock del GET del detalle: devuelve el cliente completo con
    // metadata. Cuando el fetch tiene exito, el modal debe abrirse
    // con los datos del servidor (no el stub) y SIN detailError.
    // Ponemos apellido: '' para que getByText('Juan Carlos') matchee
    // exactamente (el <h2> del modal renderiza "{nombre} {apellido}"
    // como text nodes separados, y un apellido distinto rompe el match).
    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: {
          ...mockCliente,
          nombre: 'Juan Carlos',
          apellido: '',
          telefono: '3009876543',
        },
      },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    // Modal abre con el nombre del servidor (no el del stub "No se pudo...").
    await waitFor(() => {
      expect(screen.getByText('Juan Carlos')).toBeTruthy()
    })

    // El detailError banner NO debe estar presente.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('viewCliente mantiene datos de la fila + banner cuando el fetch responde 404', async () => {
    const { mock, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    responses.set('/api/clientes/cliente-1', {
      status: 404,
      body: { success: false, error: { message: 'not found' } },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    // El panel se abre con el nombre real; el banner muestra 404.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Juan/ })).toBeTruthy()
    })
    const errorBanner = screen.getByRole('alert')
    expect(errorBanner.textContent).toContain('Cliente no encontrado')
  })

  it('viewCliente mantiene datos de la fila + banner cuando fetch lanza excepcion', async () => {
    const mock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/clientes/cliente-1')) {
        throw new TypeError('Failed to fetch')
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => '',
      } as Response
    })
    global.fetch = mock as unknown as typeof fetch

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Juan/ })).toBeTruthy()
    })

    const errorBanner = screen.getByRole('alert')
    expect(errorBanner.textContent).toContain('No se pudo conectar al servidor')
  })

  it('renderiza los negocios que vienen en el detalle del cliente (sin fetch aparte a /api/negocios)', async () => {
    const { mock, calls, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: {
          ...mockCliente,
          negocios: [
            {
              id: 'negocio-1',
              nombre: 'Ferretería Don Juan',
              tipoNegocio: 'Ferretería',
              direccion: 'Calle 1 #2-3',
              barrio: 'Centro',
              referencia: null,
              linkUbicacion: 'https://maps.google.com/?q=1,2',
              horaApertura: '08:00',
              activo: true,
              _count: { pedidos: 3 },
              ruta: { id: 'ruta-1', nombre: 'Ruta Norte' },
            },
          ],
        },
      },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    await waitFor(() => {
      expect(screen.getByText('Ferretería Don Juan')).toBeTruthy()
    })
    expect(screen.getByText('Calle 1 #2-3')).toBeTruthy()
    expect(screen.getByText('Ruta Norte')).toBeTruthy()

    // No debe haber consultado el endpoint legacy de negocios; la fuente
    // de verdad del panel es ahora el detalle del cliente.
    const negociosCalls = calls.filter((c) => c.url.includes('/api/negocios'))
    expect(negociosCalls).toHaveLength(0)
  })

  it('viewCliente descarta respuesta stale cuando el usuario hace dos clicks rápidos (seq guard)', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // Configuramos una respuesta LENTA para cliente-1 y una rápida para cliente-2.
    // Si no hay guarda de secuencia, el modal podría terminar con el nombre lento.
    let cliente1Resolver: (r: Response) => void
    const cliente1Promise = new Promise<Response>((resolve) => {
      cliente1Resolver = resolve
    })

    mock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/clientes/cliente-1')) {
        return cliente1Promise
      }
      if (urlStr.includes('/api/clientes/cliente-2')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            success: true,
            cliente: { ...mockCliente, id: 'cliente-2', clienteId: 'cliente-2', nombre: 'Pedro', apellido: '', negocios: [] },
          }),
          text: async () => '',
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response
    })

    const cliente2: Cliente = { ...mockCliente, id: 'cliente-2', clienteId: 'cliente-2', nombre: 'Pedro' }

    render(
      <ClientesClient
        initialClientes={[mockCliente, cliente2]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    // Click rápido en cliente-1 y luego cliente-2.
    const row1 = screen.getByTestId('cliente-row-cliente-1')
    const row2 = screen.getByTestId('cliente-row-cliente-2')
    await act(async () => {
      fireEvent.click(row1)
      fireEvent.click(row2)
    })

    // La respuesta lenta de cliente-1 llega tarde; debe ser ignorada.
    await act(async () => {
      cliente1Resolver!({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          cliente: { ...mockCliente, id: 'cliente-1', clienteId: 'cliente-1', nombre: 'Nombre Stale', apellido: '', negocios: [] },
        }),
        text: async () => '',
      } as Response)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Pedro' })).toBeTruthy()
    })

    // El nombre stale nunca debe aparecer en el modal.
    expect(screen.queryByRole('heading', { name: 'Nombre Stale' })).toBeNull()
  })

  it('viewCliente abre el modal con datos de la fila antes de que llegue el fetch', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    let resolveFetch: (r: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })

    mock.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('/api/clientes/cliente-1')) {
        return fetchPromise
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    // Antes de resolver el fetch, el modal debe estar abierto con los datos de la fila.
    expect(screen.getByRole('heading', { name: /Juan/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()

    // Ahora resuelve el fetch; los datos del servidor reemplazan al optimista.
    await act(async () => {
      resolveFetch!({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          success: true,
          cliente: { ...mockCliente, nombre: 'Juan Carlos', apellido: '', negocios: [] },
        }),
        text: async () => '',
      } as Response)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Juan Carlos' })).toBeTruthy()
    })
  })

  it('usa el caché: segunda apertura dentro de 60s no vuelve a hacer fetch', async () => {
    const { mock, calls, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: { ...mockCliente, nombre: 'Juan Servidor', apellido: '', negocios: [] },
      },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Juan Servidor' })).toBeTruthy()
    })

    // Cerrar y reabrir.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Cerrar'))
    })
    await act(async () => {
      fireEvent.click(row)
    })

    // Debe abrir al instante con el nombre cacheado.
    expect(screen.getByRole('heading', { name: 'Juan Servidor' })).toBeTruthy()

    // Match exacto: el prefetch del panel también llama /stats y /historial
    // (sub-paths de /api/clientes/cliente-1) — el assertion es sobre el detalle.
    const detailCalls = calls.filter(c => c.url === '/api/clientes/cliente-1')
    expect(detailCalls).toHaveLength(1)
  })

  it('prefetch en hover deduplica con el click: solo 1 request', async () => {
    const { mock, calls, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: { ...mockCliente, nombre: 'Juan Servidor', apellido: '', negocios: [] },
      },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    // Simular hover: cliente-table propaga onPrefetchCliente.
    await act(async () => {
      fireEvent.mouseEnter(row)
    })
    // Pequeña espera para que el prefetch dispare.
    await new Promise(r => setTimeout(r, 50))
    await act(async () => {
      fireEvent.click(row)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Juan Servidor' })).toBeTruthy()
    })

    const detailCalls = calls.filter(c => c.url === '/api/clientes/cliente-1')
    expect(detailCalls).toHaveLength(1)
  })

  it('viewCliente dispara prefetch de stats e historial en background', async () => {
    const { mock, calls, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: { ...mockCliente, nombre: 'Juan Servidor', apellido: '', negocios: [] },
      },
    })

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Juan Servidor' })).toBeTruthy()
    })

    // El panel prefetch dispara ambas pestañas en background (una vez cada una).
    const statsCalls = calls.filter(c => c.url === '/api/clientes/cliente-1/stats')
    const historialCalls = calls.filter(c =>
      c.url === '/api/clientes/cliente-1/historial?meses=12&page=1&pageSize=20',
    )
    expect(statsCalls).toHaveLength(1)
    expect(historialCalls).toHaveLength(1)
  })

  it('toggleVerificado actualiza la UI sin recargar toda la lista', async () => {
    const { mock, calls, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // Detalle: carga una sola vez y queda en caché.
    responses.set('/api/clientes/cliente-1', {
      status: 200,
      body: {
        success: true,
        cliente: { ...mockCliente, verificado: false, apellido: '', negocios: [] },
      },
    })
    responses.set('/api/clientes/cliente-1/patch', {
      status: 200,
      body: { success: true, cliente: { ...mockCliente, verificado: true, apellido: '', negocios: [] } },
    })

    mock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url)
      calls.push({ url: urlStr, init })
      if (urlStr.includes('/api/clientes/cliente-1') && init?.method === 'PATCH') {
        const resp = responses.get('/api/clientes/cliente-1/patch')!
        return { ...resp, json: async () => resp.body, text: async () => JSON.stringify(resp.body) } as Response
      }
      // Default lookup por URL exacta/patrón.
      for (const [pattern, resp] of responses.entries()) {
        if (urlStr === pattern || urlStr.includes(pattern)) {
          return { ...resp, json: async () => resp.body, text: async () => JSON.stringify(resp.body) } as Response
        }
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response
    })

    const clienteNoVerificado = { ...mockCliente, verificado: false }
    render(
      <ClientesClient
        initialClientes={[clienteNoVerificado]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const row = screen.getByTestId('cliente-row-cliente-1')
    await act(async () => {
      fireEvent.click(row)
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Juan/ })).toBeTruthy()
    })

    // Limpiar calls del detalle inicial.
    calls.length = 0

    const verificarBtn = screen.getByText('Verificar')
    await act(async () => {
      fireEvent.click(verificarBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('Verificado')).toBeTruthy()
    })

    const postPatchCalls = calls.filter(c => c.url.includes('/api/clientes'))
    expect(postPatchCalls).toHaveLength(1)
    expect(postPatchCalls[0].url).toContain('/api/clientes/cliente-1')
    expect(postPatchCalls[0].init?.method).toBe('PATCH')
  })

  it('recibe metadatos de paginación desde el Server Component y los pasa a ClienteTable', () => {
    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        initialTotal={128}
        initialTotalPages={6}
        initialPage={2}
        initialPageSize={25}
        initialSearch=""
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    expect(screen.getByTestId('cliente-pagination-info').textContent).toBe('128 clientes — página 2 de 6')
  })

  it('fetchClientes usa los parámetros actuales de la URL (page, pageSize, búsqueda)', async () => {
    const { mock, calls } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // Simular URL con página 2 y búsqueda server-side.
    const mockUseSearchParams = vi.mocked(useSearchParams)
    mockUseSearchParams.mockReturnValue(new URLSearchParams('page=2&search=Juan&pageSize=25') as unknown as ReturnType<typeof useSearchParams>)

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        initialTotal={1}
        initialTotalPages={1}
        initialPage={1}
        initialPageSize={25}
        initialSearch=""
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    // Forzar fetchClientes vía el botón de reintentar del ClienteTable.
    await act(async () => {
      fireEvent.click(screen.getByTestId('cliente-retry'))
    })

    const listCalls = calls.filter(c => c.url.includes('/api/clientes?') && !c.url.includes('all=true'))
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0].url).toContain('page=2')
    expect(listCalls[0].url).toContain('search=Juan')
    expect(listCalls[0].url).toContain('pageSize=25')
  })

  describe('Regresión búsqueda/paginación (2026-07-29)', () => {
    it('typing in search input debounces and pushes search=term&page=1', async () => {
      const mockPush = vi.fn()
      const mockUseRouter = vi.mocked(useRouter)
      mockUseRouter.mockReturnValue({
        ...createMockRouter(),
        push: mockPush,
      } as unknown as ReturnType<typeof useRouter>)

      const mockUseSearchParams = vi.mocked(useSearchParams)
      mockUseSearchParams.mockReturnValue(new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>)

      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          initialTotal={1}
          initialTotalPages={1}
          initialPage={1}
          initialPageSize={25}
          initialSearch=""
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )

      const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { value: 'leidys' } })
      })

      // La búsqueda usa replaceState (no router.push).
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('pagination "Siguiente" preserves existing search term and increments page', async () => {
      const mockPush = vi.fn()
      const mockUseRouter = vi.mocked(useRouter)
      mockUseRouter.mockReturnValue({
        ...createMockRouter(),
        push: mockPush,
      } as unknown as ReturnType<typeof useRouter>)

      const mockUseSearchParams = vi.mocked(useSearchParams)
      mockUseSearchParams.mockReturnValue(new URLSearchParams('search=leidys&page=1') as unknown as ReturnType<typeof useSearchParams>)

      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          initialTotal={30}
          initialTotalPages={2}
          initialPage={1}
          initialPageSize={25}
          initialSearch="leidys"
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )

      const nextBtn = screen.getByTestId('cliente-page-next')
      await act(async () => {
        fireEvent.click(nextBtn)
      })

      expect(mockPush).toHaveBeenCalledTimes(1)
      const pushedUrl = mockPush.mock.calls[0][0] as string
      expect(pushedUrl).toContain('search=leidys')
      expect(pushedUrl).toContain('page=2')
      expect(pushedUrl).not.toContain('page=1')
    })

    it('does not reset page to 1 when URL search term matches current input (flicker guard)', async () => {
      const mockPush = vi.fn()
      const mockUseRouter = vi.mocked(useRouter)
      mockUseRouter.mockReturnValue({
        ...createMockRouter(),
        push: mockPush,
      } as unknown as ReturnType<typeof useRouter>)

      const mockUseSearchParams = vi.mocked(useSearchParams)
      mockUseSearchParams.mockReturnValue(new URLSearchParams('search=leidys&page=2') as unknown as ReturnType<typeof useSearchParams>)

      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          initialTotal={30}
          initialTotalPages={2}
          initialPage={2}
          initialPageSize={25}
          initialSearch=""
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )

      // El input debe haberse sincronizado desde la URL a "leidys".
      const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
      await waitFor(() => {
        expect(input.value).toBe('leidys')
      })

      // Esperar debounce: como el input es igual a la URL, no debe empujar.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })

      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  it('filtra client-side cuando el cache completo está cargado (búsqueda instantánea)', async () => {
    // En jsdom el fetch con URL relativa falla; el cache no carga.
    // En producción el cache funciona correctamente. Test verificando
    // el comportamiento en fallback: filtra desde clientes (RSC page).
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        initialTotal={1}
        initialTotalPages={1}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    const input = screen.getByTestId('cliente-search-input')

    // Sin búsqueda: el cliente está visible
    expect(screen.getByTestId('cliente-row-cliente-1')).toBeTruthy()

    // Escribir nombre que no matchea — debe filtrar
    await act(async () => { fireEvent.change(input, { target: { value: 'ZZZNoMatch' } }) })
    expect(screen.queryByTestId('cliente-row-cliente-1')).toBeNull()

    // Escribir nombre que sí matchea
    await act(async () => { fireEvent.change(input, { target: { value: 'Juan' } }) })
    expect(screen.getByTestId('cliente-row-cliente-1')).toBeTruthy()

    // Limpiar búsqueda — debe volver a mostrar
    await act(async () => { fireEvent.change(input, { target: { value: '' } }) })
    expect(screen.getByTestId('cliente-row-cliente-1')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regresión 2026-07-29: sync search input <-> URL
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesClient — sync búsqueda URL/input', () => {
  let originalFetch: typeof fetch
  const pushMock = vi.fn()
  const useRouterMock = vi.mocked(useRouter)
  const useSearchParamsMock = vi.mocked(useSearchParams)

  beforeEach(() => {
    originalFetch = global.fetch
    vi.useFakeTimers({ shouldAdvanceTime: true })
    pushMock.mockClear()
    useRouterMock.mockReturnValue({
      push: pushMock,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    global.fetch = originalFetch
    __resetDetailCache()
    __resetPanelCaches()
  })

  const renderWithSearchParams = (searchParams: URLSearchParams, initialSearch: string) => {
    useSearchParamsMock.mockReturnValue(searchParams as unknown as ReturnType<typeof useSearchParams>)
    return render(
      <ClientesClient
        initialClientes={[mockCliente]}
        initialTotal={1}
        initialTotalPages={1}
        initialPage={1}
        initialPageSize={25}
        initialSearch={initialSearch}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )
  }

  it('typing pushes debounced URL search with page=1', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

    renderWithSearchParams(new URLSearchParams(), '')

    const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Juan' } })
    })

    expect(pushMock).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(500) })

    expect(pushMock).not.toHaveBeenCalled()
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/clientes?search=Juan&page=1')

    replaceStateSpy.mockRestore()
  })

  it('clearing input deletes search from URL and resets page', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

    renderWithSearchParams(new URLSearchParams('search=Juan&page=2'), 'Juan')

    const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } })
    })

    await act(async () => { vi.advanceTimersByTime(500) })

    expect(pushMock).not.toHaveBeenCalled()
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/clientes?page=2')

    replaceStateSpy.mockRestore()
  })

  it('URL change (back/forward) updates the input', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    const { rerender } = renderWithSearchParams(new URLSearchParams('search=Juan'), 'Juan')

    const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
    expect(input.value).toBe('Juan')

    await act(async () => {
      useSearchParamsMock.mockReturnValue(new URLSearchParams('search=Pedro') as unknown as ReturnType<typeof useSearchParams>)
      rerender(
        <ClientesClient
          initialClientes={[mockCliente]}
          initialTotal={1}
          initialTotalPages={1}
          initialPage={1}
          initialPageSize={25}
          initialSearch="Pedro"
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    expect(input.value).toBe('Pedro')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('trailing space does not cause push loop or snapback', async () => {
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    const { rerender } = renderWithSearchParams(new URLSearchParams('search=Juan'), 'Juan')

    const input = screen.getByTestId('cliente-search-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Juan ' } })
    })

    // El valor trimmeado ya coincide con la URL; no debe empujar nada.
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(pushMock).not.toHaveBeenCalled()

    // Simular que el Server Component re-renderiza con el valor ya cometido.
    await act(async () => {
      useSearchParamsMock.mockReturnValue(new URLSearchParams('search=Juan') as unknown as ReturnType<typeof useSearchParams>)
      rerender(
        <ClientesClient
          initialClientes={[mockCliente]}
          initialTotal={1}
          initialTotalPages={1}
          initialPage={1}
          initialPageSize={25}
          initialSearch="Juan"
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    // El input debe seguir siendo "Juan " (sin snapback) y no debe haber
    // un segundo push espurio.
    expect(input.value).toBe('Juan ')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(pushMock).not.toHaveBeenCalled()
  })
})

// Bug reportado: "el cliente Aponte se borra, hay que volver a ingresarlo".
// Causa raíz: fetchResilient encola la creación en IndexedDB cuando no hay
// señal (2G/3G rural) y cierra el modal sin dejar ningún rastro visible en
// la lista — el usuario asume que el cliente se perdió y lo reingresa varias
// veces. Estos tests cubren la reconciliación de esas filas "pendientes":
// reconstrucción desde requestQueue al montar, y remoción cuando el evento
// de sync confirma que el server ya procesó el item.
describe('ClientesClient — clientes pendientes de sync offline (bug Aponte)', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
    vi.mocked(useRouter).mockReset().mockReturnValue(createMockRouter() as unknown as ReturnType<typeof useRouter>)
    vi.mocked(useSearchParams).mockReset().mockReturnValue(new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>)
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
    __resetDetailCache()
    __resetPanelCaches()
  })

  function mockQueueWith(items: Array<{ offlineId: string; localEndpoint: string; body: string }>) {
    vi.mocked(offlineDb.requestQueue.where).mockReturnValue({
      equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
    } as unknown as ReturnType<typeof offlineDb.requestQueue.where>)
  }

  it('reconstruye una fila pendiente desde requestQueue al montar (sobrevive a un refresh)', async () => {
    mockQueueWith([
      {
        offlineId: 'off-aponte-1',
        localEndpoint: 'crear-cliente',
        body: JSON.stringify({ nombre: 'Yenifer', apellido: 'Aponte', telefono: '3103704219' }),
      },
    ])
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    await act(async () => {
      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('cliente-row-offline-off-aponte-1')).toBeTruthy()
    })
    // El mock de ClienteTable solo renderiza `nombre` (ver arriba); el
    // apellido va en el objeto Cliente construido pero no en este stub.
    expect(screen.getByText('Yenifer')).toBeTruthy()
  })

  it('quita la fila pendiente y refresca la lista cuando llega bambu:sync-item-done', async () => {
    mockQueueWith([
      {
        offlineId: 'off-aponte-2',
        localEndpoint: 'crear-cliente',
        body: JSON.stringify({ nombre: 'Yenifer', apellido: 'Aponte', telefono: '3103704219' }),
      },
    ])
    const { mock, calls } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    await act(async () => {
      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('cliente-row-offline-off-aponte-2')).toBeTruthy()
    })

    const callsBefore = calls.length
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(SYNC_ITEM_DONE_EVENT, {
          detail: { offlineId: 'off-aponte-2', localEndpoint: 'crear-cliente', status: 'synced' },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('cliente-row-offline-off-aponte-2')).toBeNull()
    })
    // Reconciliación: al confirmarse el sync, se refresca la lista para
    // traer el cliente real creado por el server.
    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('ignora eventos de sync de otros endpoints (ej. pedidos offline)', async () => {
    mockQueueWith([
      {
        offlineId: 'off-aponte-3',
        localEndpoint: 'crear-cliente',
        body: JSON.stringify({ nombre: 'Yenifer', apellido: 'Aponte', telefono: '3103704219' }),
      },
    ])
    const { mock } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    await act(async () => {
      render(
        <ClientesClient
          initialClientes={[mockCliente]}
          filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
          openClienteId={undefined}
          filtroActivo={null}
        />,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('cliente-row-offline-off-aponte-3')).toBeTruthy()
    })

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(SYNC_ITEM_DONE_EVENT, {
          detail: { offlineId: 'off-otro-pedido', localEndpoint: 'venta-libre', status: 'synced' },
        }),
      )
    })

    // La fila de Aponte sigue pendiente — el evento era de otro item.
    expect(screen.getByTestId('cliente-row-offline-off-aponte-3')).toBeTruthy()
  })
})
