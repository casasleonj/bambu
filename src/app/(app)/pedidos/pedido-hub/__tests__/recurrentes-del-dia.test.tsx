import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
import { RecurrentesDelDia } from '../recurrentes-del-dia'
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  window.history.replaceState(
    {},
    '',
    '/pedidos?desde=2026-10-29&hasta=2026-10-29&canal=PUNTO',
  )
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status })
describe('Entrada única a la revisión manual de habituales (#515)', () => {
  it('sin previstos no agrega un CTA vacío; el acceso persistente vive en el nav', async () => {
    fetchMock.mockResolvedValue(
      json({ success: true, hoy: '2026-10-30', preview: [] }),
    )
    const { container } = render(<RecurrentesDelDia />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(container).toBeEmptyDOMElement()
  })
  it('lleva al flujo canónico y conserva filtros sin generar ni incluir futuros', async () => {
    fetchMock.mockResolvedValue(
      json({
        success: true,
        hoy: '2026-10-30',
        preview: [
          { proximaFecha: '2026-10-30T05:00:00.000Z' },
          { proximaFecha: '2026-10-31T05:00:00.000Z' },
        ],
      }),
    )
    render(<RecurrentesDelDia />)
    const link = await screen.findByRole('link', {
      name: /1 pedido habitual para revisar hoy/,
    })
    const url = new URL(link.getAttribute('href')!, 'https://bambu.invalid')
    expect(url.pathname).toBe('/recurrentes')
    expect(url.searchParams.get('volver')).toContain('canal=PUNTO')
    expect(url.hash).toBe('#revision-habituales')
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
  })
  it('un error de consulta no se convierte en ningún habitual previsto', async () => {
    fetchMock.mockResolvedValue(json({ success: false }, 503))
    render(<RecurrentesDelDia />)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No se pudo consultar',
    )
    expect(
      screen.getByRole('link', { name: /Consultar habituales/ }),
    ).toBeVisible()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
  })
})
