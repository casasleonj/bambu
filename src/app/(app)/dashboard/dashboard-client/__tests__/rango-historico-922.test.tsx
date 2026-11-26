// @tests Fase #922 — el selector no debe vaciar el layout al elegir un rango
// histórico. El API del dashboard falla cerrado (409) para rangos != hoy, pero
// la tarjeta de entregas se consulta aparte y sigue siendo utilizable: si
// desaparece del DOM, el usuario pierde la única cifra del período elegido.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardClient } from '../index'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(
      JSON.stringify({ success: false, error: 'requiere conciliación' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    ),
  ))
})
afterEach(() => vi.unstubAllGlobals())

describe('#922 — rango histórico', () => {
  it('conserva la tarjeta de entregas al elegir Ayer', async () => {
    const { container } = render(<DashboardClient data={null} userRole="ADMIN" />)

    // El selector existe y permite elegir un período histórico.
    const selector = container.querySelector('#dashboard-periodo') as HTMLSelectElement
    expect(selector).not.toBeNull()

    fireEvent.change(selector, { target: { value: 'ayer' } })
    await waitFor(() => expect(selector.value).toBe('ayer'))

    // Con el rango histórico el resto falla cerrado, pero las entregas siguen.
    await waitFor(() =>
      expect(screen.getByTestId('entregas-hoy-card')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('entregas-hoy-card')).toHaveTextContent(
      'Entregas del período',
    )
  })

  it('no presenta el rango histórico como cifras en cero', async () => {
    const { container } = render(<DashboardClient data={null} userRole="ADMIN" />)
    const selector = container.querySelector('#dashboard-periodo') as HTMLSelectElement
    fireEvent.change(selector, { target: { value: 'siete' } })

    await waitFor(() =>
      expect(screen.getAllByText('Por consultar').length).toBeGreaterThan(0),
    )
    // Un rango histórico no puede mostrarse como 0: eso afirmaría que no hubo ventas.
    expect(screen.queryByText('No hay ventas entregadas de pedidos de hoy.')).toBeNull()
  })
})
