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

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/clientes'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Admin', role: 'ADMIN' } } }),
  signOut: vi.fn(),
}))

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
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
  ClienteTable: ({ clientes, onViewCliente }: { clientes: Array<{ id: string; nombre: string }>; onViewCliente: (id: string) => void }) => (
    <div data-testid="cliente-table">
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
import type { Cliente } from '@/app/(app)/clientes/clientes-client/types'

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
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
    // NO usar vi.restoreAllMocks() — eso restaura las implementaciones
    // de los vi.fn() (e.g. `mockReturnValue([])`) a la implementacion
    // original (undefined), causando que `calcularAlertasCliente` retorne
    // undefined en el siguiente test y rompa el `alertas.filter()`.
  })

  it('NO dispara fetch a /api/clientes en mount si hay initialClientes (regresion "no se pudieron cargar")', async () => {
    const { mock, calls } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
        openClienteId={undefined}
        filtroActivo={null}
      />,
    )

    // Esperar 100ms para que cualquier useEffect de mount se hubiera disparado.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Con el fix #1 aplicado, NO debe haber fetch a /api/clientes al mount
    // porque el SSR ya proveyo initialClientes.
    //
    // (Antes: useEffect de mount disparaba fetchClientes() que fallaba en
    // mobile y setFetchError reemplazaba visualmente la lista del SSR.)
    //
    // Nota: SI hay otros fetches al mount (/api/trabajadores, /api/auth/profile)
    // que son normales. Lo que verificamos es que NO se hace fetch
    // especifico a /api/clientes.
    const clientesCalls = calls.filter((c) => c.url.includes('/api/clientes'))
    expect(clientesCalls).toHaveLength(0)

    // Verificacion adicional: la lista del SSR se ve (no fue reemplazada
    // por un banner de error). El nombre del cliente mockeado debe estar
    // en el DOM.
    expect(screen.getByTestId('cliente-row-cliente-1')).toBeTruthy()
    expect(screen.getByText('Juan')).toBeTruthy()
  })

  it('viewCliente abre el modal con stub + detailError banner cuando el fetch falla (regresion "no me abre el detalle")', async () => {
    const { mock, responses } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    // El GET del detalle va a fallar con 500. Antes del fix, viewCliente
    // solo hacia toast.error y retornaba sin abrir el modal — el user
    // pensaba que el click no funcionaba. Con el fix, el modal se abre
    // con un cliente stub y un banner de error visible.
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

    // El row del SSR debe estar visible antes del click.
    const row = screen.getByTestId('cliente-row-cliente-1')
    expect(row).toBeTruthy()

    // Click en la fila dispara viewCliente('cliente-1'). El handler
    // es async (hace fetch + setState), asi que usamos act() y
    // waitFor para esperar a que el modal se monte.
    await act(async () => {
      fireEvent.click(row)
    })

    // Tras el click, el modal debe estar abierto. El stub del cliente
    // tiene nombre "No se pudo cargar el cliente" (del branch !res.ok).
    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el cliente')).toBeTruthy()
    })

    // El detailError banner debe estar visible con el mensaje del HTTP 500.
    const errorBanner = screen.getByRole('alert')
    expect(errorBanner).toBeTruthy()
    expect(errorBanner.textContent).toContain('Error al cargar el cliente (HTTP 500)')
    expect(errorBanner.textContent).toContain('Intenta de nuevo')
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

  it('viewCliente muestra mensaje de "Cliente no encontrado" cuando el fetch responde 404', async () => {
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

    // El stub + el mensaje 404 ("Cliente no encontrado.") deben estar.
    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el cliente')).toBeTruthy()
    })
    const errorBanner = screen.getByRole('alert')
    expect(errorBanner.textContent).toContain('Cliente no encontrado')
  })

  it('viewCliente muestra mensaje de "Error de red" cuando fetch lanza excepcion', async () => {
    // Mock que rechaza la promesa (simula error de red real, no HTTP).
    // El componente debe abrir el modal con stub y mensaje "Error de red"
    // en el detailError.
    const mock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/clientes/cliente-1')) {
        throw new TypeError('Failed to fetch')
      }
      // Otros fetches retornan OK vacio.
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

    // En el catch, el stub tiene nombre "Error de red" (distinto del
    // branch !res.ok que dice "No se pudo cargar el cliente").
    await waitFor(() => {
      expect(screen.getByText('Error de red')).toBeTruthy()
    })

    const errorBanner = screen.getByRole('alert')
    expect(errorBanner.textContent).toContain('No se pudo conectar al servidor')
  })
})
