import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { CoordsPreview } from '@/components/coords-preview'

const parseGoogleMapsLink = vi.fn()
const isShortMapsUrl = vi.fn()

vi.mock('@/lib/geo/parse-google-maps-link', () => ({
  parseGoogleMapsLink: (...args: unknown[]) => parseGoogleMapsLink(...args),
  isShortMapsUrl: (...args: unknown[]) => isShortMapsUrl(...args),
}))

const fetch = vi.fn()
Object.defineProperty(globalThis, 'fetch', { value: fetch, writable: true })

describe('CoordsPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    parseGoogleMapsLink.mockReturnValue(null)
    isShortMapsUrl.mockReturnValue(false)
    fetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no renderiza nada cuando url está vacía', () => {
    const { container } = render(<CoordsPreview url="" />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra coords detectadas para link largo reconocido', () => {
    parseGoogleMapsLink.mockReturnValue({ lat: 4.65, lng: -74.05, source: 'query' })
    const { getByTestId } = render(<CoordsPreview url="https://maps.google.com/?q=4.65,-74.05" />)
    expect(getByTestId('coords-preview-ok')).toHaveTextContent('4.650000')
    expect(getByTestId('coords-preview-ok')).toHaveTextContent('-74.050000')
  })

  it('muestra mensaje de error anidado cuando el server responde 400', async () => {
    isShortMapsUrl.mockReturnValue(true)
    fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: { message: 'URL inválida', formErrors: ['La URL no es válida'] } }),
    })

    const { getByTestId } = render(<CoordsPreview url="https://maps.app.goo.gl/short" />)
    await act(async () => { vi.advanceTimersByTime(500) })

    await waitFor(() => expect(getByTestId('coords-preview-short')).toHaveTextContent('La URL no es válida'))
  })

  it('debounce: no dispara fetch inmediatamente, solo después de 500ms', async () => {
    isShortMapsUrl.mockReturnValue(true)
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, coords: { lat: 1, lng: 2 } }),
    })

    const { getByTestId } = render(<CoordsPreview url="https://maps.app.goo.gl/short" />)

    expect(fetch).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(500) })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getByTestId('coords-preview-short-ok')).toHaveTextContent('1.000000'))
  })

  it('resetea cuando el link cambia a no-corto', () => {
    isShortMapsUrl.mockReturnValueOnce(true).mockReturnValue(false)
    parseGoogleMapsLink.mockReturnValueOnce(null).mockReturnValue({ lat: 4.65, lng: -74.05, source: 'query' })
    const { rerender, queryByTestId } = render(<CoordsPreview url="https://maps.app.goo.gl/short" />)
    rerender(<CoordsPreview url="https://maps.google.com/?q=4.65,-74.05" />)
    expect(queryByTestId('coords-preview-short')).not.toBeInTheDocument()
    expect(queryByTestId('coords-preview-ok')).toBeInTheDocument()
  })
})
