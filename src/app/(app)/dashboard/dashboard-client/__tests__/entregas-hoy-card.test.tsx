import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { EntregasHoyCard } from '../entregas-hoy-card'

const ok = (entregas: object) =>
  new Response(JSON.stringify({ success: true, entregas }), { status: 200 })

describe('EntregasHoyCard', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('muestra cargando y luego el total con su desglose', async () => {
    fetchMock.mockResolvedValue(
      ok({ total: 32, deHoy: 29, deDiasAnteriores: 3 }),
    )
    render(<EntregasHoyCard />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect((await screen.findByTestId('entregas-hoy-total')).textContent).toBe(
      '32',
    )
    expect(screen.getByText('29 de pedidos de hoy')).toBeTruthy()
    expect(screen.getByText('3 de pedidos de días anteriores')).toBeTruthy()
  })

  it('un error muestra aviso y reintento, nunca un cero', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    render(<EntregasHoyCard />)
    expect(
      (await screen.findByText(/No se pudo cargar/)).textContent,
    ).toContain('No se pudo cargar')
    expect(screen.queryByTestId('entregas-hoy-total')).toBeNull()

    fetchMock.mockResolvedValueOnce(
      ok({ total: 1, deHoy: 1, deDiasAnteriores: 0 }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() =>
      expect(screen.getByTestId('entregas-hoy-total').textContent).toBe('1'),
    )
  })

  it('una lectura incompleta cuenta como error', async () => {
    fetchMock.mockResolvedValue(ok({ total: 4 }))
    render(<EntregasHoyCard />)
    expect(await screen.findByText(/No se pudo cargar/)).toBeTruthy()
    expect(screen.queryByTestId('entregas-hoy-total')).toBeNull()
  })
})
