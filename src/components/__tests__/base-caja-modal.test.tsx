import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import BaseCajaModal from '@/components/base-caja-modal'

const fetchMock = vi.fn()

vi.mock('next-auth/react', () => {
  const session = { data: { user: { role: 'ADMIN' } }, status: 'authenticated' }
  return {
    useSession: () => session,
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

    // Solo el check inicial (2 fetch: cierre + config). Si checkBaseDia se
    // re-ejecuta por cada tecla, habría 4, 6, ... llamadas.
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
})
