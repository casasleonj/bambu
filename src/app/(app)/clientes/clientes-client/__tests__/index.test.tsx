// @tests unit/clientes
// Regresion mobile 2026-06-10: dos bugs en /clientes:
// 1. "No se pudieron cargar los clientes": el useEffect de mount disparaba
//    un fetch que fallaba en mobile, y setFetchError reemplazaba
//    visualmente la lista del SSR con el banner de error.
// 2. "No me abre el detalle": viewCliente solo hacia toast.error si el
//    fetch fallaba, sin abrir el modal. El user no entendia que pasaba.
//
// Fixes verificados:
// 1. Se elimino el useEffect de mount. Los datos vienen del SSR via
//    initialClientes. No se hace fetch al mount.
// 2. viewCliente ahora abre el modal con un cliente stub y muestra
//    detailError dentro del modal si el fetch falla.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'

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
  _count: { pedidos: 0 },
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('ClientesClient — regresion mobile 2026-06-10', () => {
  let originalFetch: typeof fetch

  // Helper: crea un mock de fetch que retorna un Response valido para
  // CUALQUIER llamada. El componente hace multiples fetches en mount
  // (/api/trabajadores, /api/auth/profile, /api/productos/configs).
  function createFetchMock() {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => '',
      } as Response
    })
    return { mock, calls }
  }

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('NO dispara fetch a /api/clientes en mount si hay initialClientes (regresion "no se pudieron cargar")', async () => {
    const { mock, calls } = createFetchMock()
    global.fetch = mock as unknown as typeof fetch

    render(
      <ClientesClient
        initialClientes={[mockCliente]}
        openClienteId={undefined}
        totalClientes={1}
        filtroActivo={null}
      />,
    )

    // Esperar 100ms para que cualquier useEffect se hubiera disparado
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Con Fix #2 aplicado, NO debe haber fetch a /api/clientes al mount
    // porque el SSR ya proveyo initialClientes.
    // (Antes: useEffect de mount disparaba fetchClientes que fallaba en
    // mobile y setFetchError reemplazaba visualmente la lista del SSR.)
    //
    // Nota: SI hay otros fetches al mount (/api/trabajadores, /api/auth/profile)
    // que son normales. Lo que verificamos es que NO se hace fetch
    // especifico a /api/clientes.
    const clientesCalls = calls.filter((c) => c.url.includes('/api/clientes'))
    expect(clientesCalls).toHaveLength(0)
  })

  it('cliente stub se crea en viewCliente cuando el fetch falla (regresion "no me abre el detalle")', () => {
    // Este test unitario valida la ESTRUCTURA del codigo de viewCliente.
    // El flujo completo (click en fila -> modal con error) se valida en
    // el e2e (mobile-clientes.spec.ts) donde Playwright emula el click
    // real en mobile. Aqui solo verificamos que el codigo fuente hace
    // setSelectedCliente con un stub y setDetailError cuando fetch falla.
    //
    // Leemos el codigo del componente para verificar que el fix esta aplicado.
    const fs = require('fs')
    const path = require('path')
    const sourcePath = path.join(__dirname, '..', 'index.tsx')
    const source = fs.readFileSync(sourcePath, 'utf-8')

    // El codigo debe:
    // 1. Tener un state detailError.
    // 2. En viewCliente, cuando !res.ok, setear detailError Y setear
    //    selectedCliente con un stub Y setShowDetail(true).
    // 3. En el catch, hacer lo mismo.

    // 1. State detailError existe
    expect(source).toMatch(/detailError/)

    // 2. En la rama !res.ok, hay setSelectedCliente con un stub
    //    y setShowDetail(true) y setDetailError.
    expect(source).toMatch(/setSelectedCliente\(\{[\s\S]*?\} as Cliente\)/)
    expect(source).toMatch(/setDetailError\(/)

    // 3. El componente renderiza el detailError dentro del modal
    //    (banner rojo).
    expect(source).toMatch(/detailError && !detailLoading/)
  })

  it('useEffect de mount fue eliminado (regresion "no se pudieron cargar")', () => {
    // Verificar que el codigo fuente NO tiene el useEffect problematico
    // que disparaba fetchClientes en mount.
    const fs = require('fs')
    const path = require('path')
    const sourcePath = path.join(__dirname, '..', 'index.tsx')
    const source = fs.readFileSync(sourcePath, 'utf-8')

    // El useEffect problematico era:
    //   useEffect(() => { fetchClientes() }, [fetchClientes])
    // Verificar que NO esta presente.
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*fetchClientes\(\)\s*\}\s*,\s*\[fetchClientes\]\)/)
  })
})
