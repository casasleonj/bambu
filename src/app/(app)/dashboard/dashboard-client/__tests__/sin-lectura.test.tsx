import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardClient } from '../index'
afterEach(() => vi.unstubAllGlobals())
describe('dashboard sin primera consulta', () => {
  it('no presenta una fuente fallida como ausencia de ventas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    render(<DashboardClient data={null} userRole="ADMIN" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'No hay una lectura disponible',
    )
    expect(
      screen.queryByText('No hay ventas entregadas de pedidos de hoy.'),
    ).toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(4)
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar dashboard' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'no significa que las ventas o los cobros sean cero',
      ),
    )
    expect(screen.getAllByText('—')).toHaveLength(4)
  })
})

import type { DashboardData } from '../types'
const lectura = (baseDia: number, minuto: string): DashboardData => ({
  consultadoAt: `2026-10-29T15:${minuto}:00.000Z`,
  cobros: {
    movimientos: [],
    medios: [],
    subtotalRegistrado: 0,
    creditoAplicado: 0,
    porConciliar: [],
  },
  pedidosHoy: 0,
  ventas: 0,
  fiadosHoy: 0,
  fiadosTotal: 0,
  clientesConFiado: 0,
  pedidosPendientes: 0,
  pedidosEntregados: 0,
  baseDia,
  totalGastos: 0,
  ventasAyer: 0,
  ventasTrend: 0,
  pedidosTrend: 0,
  franjas: [{ label: 'Mañana', range: [6, 11], count: 0 }],
  maxFranja: 0,
  ventasPorPrecio: [],
  aguaVendida: 0,
  hieloVendido: 0,
  botellonVendido: 0,
  prodAguaHoy: 0,
  prodHieloHoy: 0,
  prodPiezasHoy: 0,
  prodPerdidasHoy: 0,
  prodEficienciaHoy: 0,
  prodPiezasAyer: 0,
  prodEficienciaAyer: 0,
  prodPiezasTrend: 0,
  prodEficienciaTrend: 0,
  stockAgua: 0,
  stockHielo: 0,
  embarquesAbiertos: 0,
  stockAlertas: [],
  fechaHoy: 'jueves, 29 de octubre de 2026',
  alertasRiesgo: {
    disputasAbiertas: 0,
    clientesBloqueados: 0,
    clientesConflictivos: 0,
    promesasProximasVencer: 0,
    clientesNoVerificados: 0,
    pedidosAtrasadosSinAsignar: 0,
    pedidosHoyEnRiesgo: 0,
  },
  casosActivos: { total: 0, criticos: 0, sinResolver48h: 0 },
})
it('una nueva lectura SSR actualiza la base aunque haya existido una actualización local anterior', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ success: true, dashboard: lectura(30000, '10') }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetcher)
  const { rerender } = render(
    <DashboardClient data={lectura(10000, '00')} userRole="ADMIN" />,
  )
  const base = () =>
    screen.getByText('Base del día', { exact: true }).parentElement!
  expect(base()).toHaveTextContent('10.000')
  rerender(<DashboardClient data={lectura(20000, '05')} userRole="ADMIN" />)
  expect(base()).toHaveTextContent('20.000')
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar dashboard' }))
  await waitFor(() => expect(base()).toHaveTextContent('30.000'))
  rerender(<DashboardClient data={lectura(40000, '15')} userRole="ADMIN" />)
  expect(base()).toHaveTextContent('40.000')
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        success: true,
        dashboard: { consultadoAt: 'fecha-inválida', cobros: {} },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar dashboard' }))
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Conservamos'),
  )
  expect(base()).toHaveTextContent('40.000')
})
