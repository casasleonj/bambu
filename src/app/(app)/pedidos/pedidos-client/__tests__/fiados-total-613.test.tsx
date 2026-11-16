import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FiadosTable } from '../fiados-table'
import type { Pedido } from '../types'

const url = { value: new URLSearchParams() }
vi.mock('@/hooks/use-shallow-search-params', () => ({
  useShallowSearchParams: () => ({ get: (k: string) => url.value.get(k), toString: () => url.value.toString(), set: vi.fn() }),
}))
vi.mock('../use-consulta-contexto', async () => {
  const React = await import('react')
  return { useParametroConsulta: <T,>(_k: string, def: T) => React.useState<T>(def) }
})
vi.mock('@/lib/fetch-resilient', () => ({ fetchResilient: vi.fn() }))

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString()
const ped = (id: string, clienteId: string, nombre: string, exigible: number, dias: number): Pedido => ({
  id, numero: Number(id.replace('p', '')), clienteId, nombreCli: nombre, telefonoCli: '300', estadoEntrega: 'ENTREGADO',
  exigible, saldo: exigible, total: exigible, totalPagado: 0, fecha: hace(dias),
}) as unknown as Pedido
const pedidos = [ped('p1', 'c1', 'Ana', 10000, 20), ped('p2', 'c1', 'Ana', 5000, 1), ped('p3', 'c2', 'Beto', 20000, 2)]
const montar = (extra: Partial<React.ComponentProps<typeof FiadosTable>> = {}) =>
  render(<FiadosTable clientes={[]} pedidos={pedidos} loading={false} error={null} activeTab="fiados" userRole="ADMIN" {...extra} />)

describe('FiadosTable · total de la deuda (#613)', () => {
  beforeEach(() => { url.value = new URLSearchParams() })
  it('muestra el total en pesos de todas las filas, con clientes y pedidos', () => {
    montar()
    const kpi = screen.getByTestId('fiados-total')
    expect(kpi).toHaveTextContent('35.000')
    expect(kpi).toHaveTextContent('2 clientes · 3 pedidos')
    expect(kpi).toHaveTextContent('de todas las fechas')
  })
  it('cambia con la búsqueda y con la antigüedad', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'beto' } })
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('20.000')
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('1 cliente · 1 pedido')
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('(según los filtros)')
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Antigüedad'), { target: { value: '8-30' } })
    // Ana es la única con deuda de 8–30 días (su pedido más antiguo tiene 20): 10.000 + 5.000
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('15.000')
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('1 cliente · 2 pedidos')
  })
  it('sin resultados el total es cero y se explica', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'nadie' } })
    expect(screen.getByTestId('fiados-total')).toHaveTextContent('$ 0')
    expect(screen.getByText('Sin resultados con estos filtros')).toBeInTheDocument()
  })
  it('sin datos por error no inventa un total', () => {
    montar({ pedidos: [], error: 'falló' })
    expect(screen.queryByTestId('fiados-total')).toBeNull()
  })
  it('mientras actualiza queda atenuado y marcado como ocupado', () => {
    montar({ refetching: true })
    expect(screen.getByTestId('fiados-total')).toHaveAttribute('aria-busy', 'true')
  })
  it('rol sin acceso a dinero ve el valor enmascarado', () => {
    montar({ userRole: 'REPARTIDOR' })
    expect(within(screen.getByTestId('fiados-total')).queryByText(/35\.000/)).toBeNull()
  })
})
