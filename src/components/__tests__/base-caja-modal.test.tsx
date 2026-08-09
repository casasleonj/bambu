import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import BaseCajaModal from '@/components/base-caja-modal'

const fetchMock = vi.fn()

vi.mock('next-auth/react', () => {
  // Devuelve un objeto NUEVO en cada llamada, como hace next-auth's
  // SessionProvider en cada poll (refetchInterval: 60), aunque el
  // contenido no cambie — esto es justo lo que rompía checkBaseDia
  // cuando dependía del objeto `session` completo en vez de un primitivo.
  return {
    useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated' }),
  }
})

vi.mock('next/navigation', () => {
  const router = { push: vi.fn() }
  return { useRouter: () => router }
})

vi.mock('@/hooks/use-base-caja', () => {
  const setBaseDia = vi.fn()
  const clearBaseDia = vi.fn()
  return {
    useBaseCaja: () => ({ baseDia: null, setBaseDia, clearBaseDia }),
  }
})

describe('BaseCajaModal', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('no vuelve a verificar la base cuando el usuario escribe en el input', async () => {
    render(<BaseCajaModal />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('50000')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('50000')
    fireEvent.change(input, { target: { value: '5' } })

    await waitFor(() => {
      expect(input).toHaveValue('5')
    })

    // Solo el check inicial (3 fetch: cierre + config del día + config global).
    // Si checkBaseDia se re-ejecuta por cada tecla, habría 6, 9, ... llamadas.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('usa input numérico y pattern de dígitos', async () => {
    render(<BaseCajaModal />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('50000')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('50000')
    expect(input).toHaveAttribute('inputMode', 'numeric')
    expect(input).toHaveAttribute('pattern', '[0-9]*')
  })

  it('no resetea el input ni re-verifica cuando el componente re-renderiza con un nuevo objeto session (simula el polling de SessionProvider)', async () => {
    const { rerender } = render(<BaseCajaModal />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('50000')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('50000')
    fireEvent.change(input, { target: { value: '5' } })

    await waitFor(() => {
      expect(input).toHaveValue('5')
    })

    // Re-render: el mock de useSession devuelve un objeto nuevo cada vez
    // (misma data), igual que un poll de SessionProvider sin cambios reales.
    rerender(<BaseCajaModal />)

    expect(screen.getByPlaceholderText('50000')).toHaveValue('5')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('el botón "Ahora no" cierra el modal sin guardar', async () => {
    render(<BaseCajaModal />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('50000')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('base-caja-modal-skip'))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('50000')).not.toBeInTheDocument()
    })

    // No debió llamar a POST /api/config (solo los 3 GET del check inicial).
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
