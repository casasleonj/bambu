// @tests negocio-detail-modal — Bloque 6 (botón "Actualizar coordenadas")
// Cubre: fila de coords (configuradas / no configuradas), botón solo con
// canEdit, loading "Actualizando...", fetch al endpoint de geocode, callback
// onGeocoded al padre, y manejo de errores.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { NegocioDetailModal, type NegocioDetail } from '@/components/negocio-detail-modal'

// Mocks de dependencias
vi.mock('@/components/modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div data-testid="modal">{children}</div>,
}))

vi.mock('@/components/confirm-modal', () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(false),
    modal: null,
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'

const fetchMock = vi.fn()

const baseNegocio: NegocioDetail = {
  id: 'n1',
  nombre: 'Tienda La Esquina',
  tipoNegocio: 'Tienda',
  direccion: 'Calle 1',
  barrio: null,
  referencia: null,
  linkUbicacion: 'https://maps.google.com/?q=4.65,-74.05',
  horaApertura: null,
  ruta: null,
  _count: { pedidos: 3 },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('NegocioDetailModal coords', () => {
  it('muestra "no configuradas" cuando no hay lat/lng', () => {
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={{ ...baseNegocio, lat: null, lng: null }}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
      />,
    )
    const row = screen.getByTestId('coords-internas-negocio')
    expect(row.textContent).toContain('no configuradas')
  })

  it('muestra las coords cuando existen', () => {
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={{ ...baseNegocio, lat: 4.65, lng: -74.05 }}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
      />,
    )
    const row = screen.getByTestId('coords-internas-negocio')
    expect(row.textContent).toContain('4.65')
    expect(row.textContent).toContain('-74.05')
  })

  it('oculta el botón si canEdit es false', () => {
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={baseNegocio}
        canEdit={false}
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
      />,
    )
    expect(screen.queryByTestId('btn-geocode-negocio')).toBeNull()
  })

  it('POST geocode exitoso → toast.success + onGeocoded con coords', async () => {
    const onGeocoded = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        coords: { lat: 4.7, lng: -74.1, origen: 'PARSED_URL' },
      }),
    })
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={baseNegocio}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
        onGeocoded={onGeocoded}
      />,
    )
    fireEvent.click(screen.getByTestId('btn-geocode-negocio'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/negocios/n1/geocode', { method: 'POST' })
    })
    expect(toast.success).toHaveBeenCalledWith('Coordenadas actualizadas (PARSED_URL)')
    expect(onGeocoded).toHaveBeenCalledWith('n1', { lat: 4.7, lng: -74.1 })
  })

  it('muestra loading "Actualizando..." mientras el fetch está pendiente', async () => {
    let resolveFetch!: (value: Response) => void
    fetchMock.mockReturnValue(
      new Promise<Response>(resolve => {
        resolveFetch = resolve
      }),
    )
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={baseNegocio}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
      />,
    )
    const btn = screen.getByTestId('btn-geocode-negocio')
    fireEvent.click(btn)
    expect(screen.getByText('Actualizando...')).toBeTruthy()
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    // Resolver para no dejar la promesa colgada (wrapped en act)
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, coords: null }) } as Response)
    })
  })

  it('geocode sin coords → toast.warning y NO llama onGeocoded', async () => {
    const onGeocoded = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, coords: null }),
    })
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={baseNegocio}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
        onGeocoded={onGeocoded}
      />,
    )
    fireEvent.click(screen.getByTestId('btn-geocode-negocio'))
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('No se pudieron obtener coords automáticamente')
    })
    expect(onGeocoded).not.toHaveBeenCalled()
  })

  it('error del endpoint → muestra error en el alert', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Error al geocodificar negocio' } }),
    })
    render(
      <NegocioDetailModal
        open
        onClose={() => {}}
        negocio={baseNegocio}
        canEdit
        canDelete={false}
        onEdit={() => {}}
        onDeleted={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('btn-geocode-negocio'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Error al geocodificar negocio')
    })
  })
})
