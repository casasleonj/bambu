// @tests unit/cliente-table
// Regresión 2026-07-29: clearFilters debe limpiar también `search` y `page`,
// de lo contrario el botón "Limpiar filtros" y el empty state no logran
// deshacer la búsqueda ni el paginado.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ClienteTable } from '@/app/(app)/clientes/clientes-client/cliente-table'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/clientes'),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/empty-state', () => ({
  EmptyState: ({
    title,
    actionLabel,
    onAction,
  }: {
    title: string
    actionLabel?: string
    onAction?: () => void
  }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {actionLabel && onAction && <button onClick={onAction}>{actionLabel}</button>}
    </div>
  ),
  EmptySearch: ({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) => (
    <div data-testid="empty-search">
      <span>{searchTerm}</span>
      <button onClick={onClear}>Limpiar búsqueda</button>
    </div>
  ),
}))

vi.mock('@/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/app/(app)/clientes/clientes-client/negocios-ubicaciones-filter', () => ({
  NegociosUbicacionesFilter: () => <div data-testid="negocios-filter" />,
}))

vi.mock('@/components/negocio-search-match', () => ({
  NegocioSearchMatch: () => null,
}))

vi.mock('@/lib/cliente-filters', () => ({
  getClienteNegocioStatus: vi.fn(() => ({
    tieneNegocio: false,
    clienteConLink: false,
    totalNegociosActivos: 0,
    negociosConLink: 0,
    negociosSinLink: 0,
  })),
}))

vi.mock('@/lib/telefono', () => ({
  normalizarTelefono: vi.fn((s: string) => s.replace(/\D/g, '')),
  formatearTelefonoParaInput: vi.fn((s: string) => s),
  formatearTelefonoParaCopiar: vi.fn((s: string) => s),
  formatearTelefonoParaLlamar: vi.fn((s: string) => `tel:${s}`),
}))

vi.mock('@/lib/utils', () => ({
  formatCurrency: vi.fn((n: number) => `$${n}`),
}))

import { useRouter } from 'next/navigation'

describe('ClienteTable — clearFilters', () => {
  const pushMock = vi.fn()
  const useRouterMock = vi.mocked(useRouter)
  const onSearchChangeMock = vi.fn()

  beforeEach(() => {
    pushMock.mockClear()
    onSearchChangeMock.mockClear()
    useRouterMock.mockReturnValue({
      push: pushMock,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>)
  })

  afterEach(() => {
    cleanup()
  })

  const renderWithSearch = (search: string, windowSearch: string) => {
    vi.stubGlobal('location', { ...window.location, search: windowSearch })
    return render(
      <ClienteTable
        clientes={[]}
        total={0}
        page={1}
        pageSize={25}
        totalPages={1}
        search={search}
        onSearchChange={onSearchChangeMock}
        onPageChange={vi.fn()}
        fetchError={null}
        onRetry={vi.fn()}
        onCreateClick={vi.fn()}
        onViewCliente={vi.fn()}
        onViewNegocio={vi.fn()}
        sortBy="createdAt"
        sortDir="desc"
        onSortChange={vi.fn()}
        selectedClienteId={null}
        filtroActivo={null}
        filtrosActivos={{ mostrarNegocio: 'todos', ubicacionMaps: 'todos' }}
      />,
    )
  }

  it('Limpiar filtros borra search, page y filtros de URL', async () => {
    renderWithSearch(
      'Juan',
      '?search=Juan&page=2&bloqueado=true&mostrarNegocio=con&ubicacionMaps=cliente',
    )

    const clearBtn = screen.getByText('Limpiar filtros')
    await act(async () => {
      fireEvent.click(clearBtn)
    })

    expect(onSearchChangeMock).toHaveBeenCalledWith('')
    expect(pushMock).toHaveBeenCalledTimes(1)
    const [url, options] = pushMock.mock.calls[0]
    expect(url).toBe('/clientes?')
    expect(options).toEqual({ scroll: false })
  })
})
