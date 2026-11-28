// @tests #1041 — la lectura del Dashboard sigue lanzándose al cambiar el período
// y la tarjeta de entregas sigue mostrando «cargando» tras un evento de pedido,
// aunque ya no se dispare desde un efecto con setState síncrono (react-hooks/set-state-in-effect).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardClient } from '../index'
import { EntregasHoyCard } from '../entregas-hoy-card'

type Handler = () => void
const escuchas = vi.hoisted(() => ({ pedido: null as null | (() => void) }))
vi.mock('@/hooks/use-realtime-listener', () => ({
  useRealtimeListener: (eventos: string[], handler: () => void) => {
    if (eventos.includes('pedido.updated')) escuchas.pedido = handler as Handler
  },
}))

const urlDe = (entrada: unknown) => String(entrada)
const llamadasDashboard = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map(c => urlDe(c[0])).filter(u => u.startsWith('/api/dashboard?'))

describe('#1041 carga del Dashboard al cambiar el período', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ success: false }), { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('elegir «Últimos 7 días» pide el dashboard del rango exactamente una vez', async () => {
    const { container } = render(<DashboardClient data={null} userRole="ADMIN" />)
    expect(llamadasDashboard(fetchMock)).toHaveLength(0)
    fireEvent.change(container.querySelector('#dashboard-periodo') as HTMLSelectElement,
      { target: { value: 'siete' } })
    await waitFor(() => expect(llamadasDashboard(fetchMock)).toHaveLength(1))
    expect(llamadasDashboard(fetchMock)[0]).toMatch(/^\/api\/dashboard\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/)
  })

  it('volver a «Hoy» no pide un rango', async () => {
    const { container } = render(<DashboardClient data={null} userRole="ADMIN" />)
    const selector = container.querySelector('#dashboard-periodo') as HTMLSelectElement
    fireEvent.change(selector, { target: { value: 'ayer' } })
    await waitFor(() => expect(llamadasDashboard(fetchMock)).toHaveLength(1))
    fireEvent.change(selector, { target: { value: 'hoy' } })
    await act(async () => { await Promise.resolve() })
    expect(llamadasDashboard(fetchMock)).toHaveLength(1)
  })

  it('«Aplicar» un rango personalizado pide exactamente ese rango una vez', async () => {
    const { container } = render(<DashboardClient data={null} userRole="ADMIN" />)
    fireEvent.change(container.querySelector('#dashboard-periodo') as HTMLSelectElement,
      { target: { value: 'personalizado' } })
    expect(llamadasDashboard(fetchMock)).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(llamadasDashboard(fetchMock)).toHaveLength(1))
    expect(llamadasDashboard(fetchMock)[0]).toBe('/api/dashboard?from=2026-11-01&to=2026-11-05')
  })
})

describe('#1041 tarjeta de entregas: evento de pedido', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    escuchas.pedido = null
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('un evento de pedido vuelve a mostrar «cargando» y luego el total nuevo', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ success: true, entregas: { total: 5, deHoy: 5, deDiasAnteriores: 0 } }), { status: 200 }))
    render(<EntregasHoyCard />)
    expect((await screen.findByTestId('entregas-hoy-total')).textContent).toBe('5')

    let resolver: (r: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>(r => { resolver = r }))
    act(() => { escuchas.pedido?.() })
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(screen.queryByTestId('entregas-hoy-total')).toBeNull()

    await act(async () => {
      resolver(new Response(
        JSON.stringify({ success: true, entregas: { total: 6, deHoy: 6, deDiasAnteriores: 0 } }), { status: 200 }))
    })
    await waitFor(() => expect(screen.getByTestId('entregas-hoy-total').textContent).toBe('6'))
  })
})
