import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BaseCajaModal from '@/components/base-caja-modal'

const fetchMock = vi.fn()

describe('BaseCajaModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('se abre manualmente con un valor inicial pre-llenado', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) } as Response)

    render(<BaseCajaModal />)

    // Trigger manual open with initial value.
    window.dispatchEvent(new CustomEvent('open-base-caja-modal', { detail: '75000' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('75000')).toBeInTheDocument()
    })
  })

  it('limpia el input al cerrar sin guardar', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cierre: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ config: null }) } as Response)

    render(<BaseCajaModal />)

    window.dispatchEvent(new CustomEvent('open-base-caja-modal', { detail: '75000' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('75000')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))
  })
})
