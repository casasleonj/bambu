import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CajaBaseHeader } from '@/components/caja-base-header'
import { fetchResilient } from '@/lib/fetch-resilient'

const fetchMock = vi.fn()

vi.mock('next-auth/react', () => {
  const session = { data: { user: { role: 'ADMIN' } }, status: 'authenticated' }
  return { useSession: () => session }
})

vi.mock('next/navigation', () => {
  const router = { push: vi.fn() }
  return { useRouter: () => router }
})

vi.mock('@/hooks/use-base-caja', () => {
  const setBaseDia = vi.fn()
  const clearBaseDia = vi.fn()
  return { useBaseCaja: () => ({ baseDia: null, setBaseDia, clearBaseDia }) }
})

vi.mock('@/lib/fetch-resilient', () => ({
  fetchResilient: vi.fn(),
}))

const toastErrorSpy = vi.fn()
const toastSuccessSpy = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorSpy(...args),
    success: (...args: unknown[]) => toastSuccessSpy(...args),
    info: vi.fn(),
  },
}))

vi.mock('@/components/base-caja-loader', () => ({
  openBaseCajaModal: vi.fn(),
}))

import { openBaseCajaModal } from '@/components/base-caja-loader'

const fetchResilientMock = vi.mocked(fetchResilient)
const openModalMock = vi.mocked(openBaseCajaModal)

describe('CajaBaseHeader', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchResilientMock.mockReset()
    openModalMock.mockReset()
    toastErrorSpy.mockReset()
    toastSuccessSpy.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra placeholder mientras carga', () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // nunca resuelve
    render(<CajaBaseHeader />)
    expect(screen.getByTestId('caja-base-header-loading')).toBeInTheDocument()
  })

  it('muestra "Sin base" con CTA cuando no hay base y rol es ADMIN', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    render(<CajaBaseHeader />)

    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-sin-base')).toBeInTheDocument()
    })
  })

  it('click en "Sin base" abre el modal automatico', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-sin-base')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-sin-base'))
    expect(openModalMock).toHaveBeenCalledTimes(1)
  })

  it('muestra view mode con monto cuando hay base', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '75000' } }),
      } as Response)

    render(<CajaBaseHeader />)

    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })
    expect(screen.getByText('$ 75.000')).toBeInTheDocument()
  })

  it('click en view mode entra en edit mode', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '75000' } }),
      } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-view'))

    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Editar monto de base de caja')).toHaveValue('75000')
  })

  it('F2 también entra en edit mode', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    const view = screen.getByTestId('caja-base-header-view')
    fireEvent.keyDown(view, { key: 'F2' })

    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })
  })

  it('Enter en el input guarda el nuevo valor', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    fetchResilientMock.mockResolvedValueOnce({
      status: 'ok',
      data: { config: { valor: '90000' } },
      statusCode: 200,
    })

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-view'))
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('Editar monto de base de caja')
    fireEvent.change(input, { target: { value: '90000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(fetchResilientMock).toHaveBeenCalled()
    })
    expect(fetchResilientMock).toHaveBeenCalledWith(
      '/api/config',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ valor: '90000' }),
      }),
    )
  })

  it('Escape en el input cancela la edicion', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-view'))
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('Editar monto de base de caja')
    fireEvent.change(input, { target: { value: '90000' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })
    expect(fetchResilientMock).not.toHaveBeenCalled()
  })

  it('sin cambios, Enter no llama a la API', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-view'))
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('Editar monto de base de caja')
    fireEvent.keyDown(input, { key: 'Enter' })

    // Sin cambios, sale del edit sin llamar a la API
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })
    expect(fetchResilientMock).not.toHaveBeenCalled()
  })

  it('error del server: muestra toast y mantiene edit', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '50000' } }),
      } as Response)

    fetchResilientMock.mockResolvedValueOnce({
      status: 'error',
      error: 'Debe ser un número entero positivo',
      statusCode: 400,
    })

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('caja-base-header-view'))
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
    })

    const input = screen.getByLabelText('Editar monto de base de caja')
    fireEvent.change(input, { target: { value: '90000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(fetchResilientMock).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalled()
    })
    // Permanece en edit tras error
    expect(screen.getByTestId('caja-base-header-editing')).toBeInTheDocument()
  })

  it('modo readonly cuando el dia esta cerrado', async () => {
    const today = new Date().toISOString().split('T')[0]
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cierre: { fecha: `${today}T12:00:00.000Z` } }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    render(<CajaBaseHeader />)
    await waitFor(() => {
      expect(screen.getByTestId('caja-base-header-readonly')).toBeInTheDocument()
    })
    expect(screen.getByTestId('caja-base-header-readonly')).toHaveAttribute(
      'title',
      'Día cerrado, no se puede editar',
    )
  })
})
