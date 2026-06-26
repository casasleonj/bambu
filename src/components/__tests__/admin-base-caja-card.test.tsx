import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminBaseCajaCard } from '@/components/admin-base-caja-card'

const fetchMock = vi.fn()

describe('AdminBaseCajaCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra skeleton mientras carga', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<AdminBaseCajaCard />)

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('muestra estado sin base y abre modal al registrar', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) } as Response)

    render(<AdminBaseCajaCard />)

    await waitFor(() => {
      expect(screen.getByText('Aún no registrada')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Registrar base/i }))

    await waitFor(() => {
      expect(screen.getByText('Base de Caja')).toBeInTheDocument()
    })
  })

  it('muestra estado con base y abre modal en modo edición', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { clave: 'BASE_DIA_2026-06-26', valor: '125000' } }),
      } as Response)

    render(<AdminBaseCajaCard />)

    await waitFor(() => {
      expect(screen.getByText(/125,000/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Editar base/i }))

    await waitFor(() => {
      expect(screen.getByText('Base de Caja')).toBeInTheDocument()
    })
  })

  it('muestra estado cerrado sin botón de editar', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cierre: { fecha: new Date().toISOString() } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ config: { valor: '80000' } }),
      } as Response)

    render(<AdminBaseCajaCard />)

    await waitFor(() => {
      expect(screen.getByText(/80\.000/)).toBeInTheDocument()
      expect(screen.getByText('El cierre del día ya fue realizado. No se puede editar la base.')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Editar base/i })).not.toBeInTheDocument()
  })
})
