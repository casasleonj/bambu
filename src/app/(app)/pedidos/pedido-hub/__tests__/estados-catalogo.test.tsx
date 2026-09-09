// @tests Fase 9 (docs/pedidos/fase9-hardening-estados-plan.md) — catálogo de
// estados del Hub (blueprint §4.7). F9-i: `refetching` → indicador sutil
// "Actualizando…"; NUNCA sustituye al skeleton de carga inicial; NUNCA aparece
// offline; la lista se conserva durante el refetch.

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

const onlineRef = { current: true }
vi.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => onlineRef.current }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { PedidoHub } from '../index'
import type { Pedido } from '../types'

const pedido = (over: Partial<Pedido> = {}): Pedido =>
  ({
    id: 'p1', numero: 1, clienteId: 'c1', nombreCli: 'Tienda X', telefonoCli: '', zonaCli: '', barrioCli: '',
    tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE', origen: 'PEDIDO',
    estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
    items: [{ producto: 'PACA_AGUA', cantPedido: 5, cantEntrega: 0, precio: 2300, subtotal: 11500 }],
    total: 11500, saldo: 11500, totalPagado: 0, fecha: '2026-09-08T08:00:00.000Z', ...over,
  }) as Pedido

const counts = {
  porPlanificarCount: 0, atrasadosCount: 0, enRutaCount: 0, esperandoPagoTotal: 0, pendientesN2Count: 0,
}
const base = { counts, userRole: 'ADMIN', onAccion: vi.fn() }

describe('Hub — catálogo de estados §4.7 (Fase 9)', () => {
  it('loading inicial (sin datos) → skeleton, sin indicador "Actualizando…"', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[]} loading error={null} refetching={false} />)
    expect(screen.getByTestId('pedido-hub-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-hub-actualizando')).not.toBeInTheDocument()
  })

  it('F9-i: refetching con datos → lista visible + indicador "Actualizando…" (no skeleton)', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error={null} refetching />)
    expect(screen.queryByTestId('pedido-hub-skeleton')).not.toBeInTheDocument()
    expect(screen.getByTestId('pedido-hub-actualizando')).toBeInTheDocument()
    // la operación sigue en pantalla
    expect(screen.getByText(/Tienda X/)).toBeInTheDocument()
  })

  it('F9-i: estado normal (no refetching) → sin indicador', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error={null} refetching={false} />)
    expect(screen.queryByTestId('pedido-hub-actualizando')).not.toBeInTheDocument()
  })

  it('F9-i (criterio 9): offline no se representa como "Actualizando…" — gana el badge offline', () => {
    onlineRef.current = false
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error={null} refetching />)
    expect(screen.queryByTestId('pedido-hub-actualizando')).not.toBeInTheDocument()
    expect(screen.getByTestId('pedido-hub-offline')).toBeInTheDocument()
  })

  it('offline con datos → badge, filas intactas, sin pantalla de error', () => {
    onlineRef.current = false
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error={null} refetching={false} />)
    expect(screen.getByTestId('pedido-hub-offline')).toBeInTheDocument()
    expect(screen.getByText(/Tienda X/)).toBeInTheDocument()
  })

  it('error sin datos → EmptyState (no skeleton, no lista)', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[]} loading={false} error="fallo" refetching={false} />)
    expect(screen.getByText('No se pudieron cargar las operaciones')).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-hub-skeleton')).not.toBeInTheDocument()
  })

  it('F9-ii: error CON datos → chip "No se pudo actualizar · Reintentar", lista intacta (no EmptyState)', () => {
    onlineRef.current = true
    const onRetry = vi.fn()
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error="timeout" refetching={false} onRetry={onRetry} />)

    // la lista NO se reemplaza
    expect(screen.getByText(/Tienda X/)).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron cargar las operaciones')).not.toBeInTheDocument()

    const chip = screen.getByTestId('pedido-hub-error-datos')
    expect(chip).toHaveTextContent(/No se pudo actualizar/i)
    fireEvent.click(within(chip).getByRole('button', { name: /Reintentar/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('F9-ii: error CON datos + refetch en curso → gana "Actualizando…", el chip de error se oculta', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error="timeout" refetching onRetry={vi.fn()} />)
    expect(screen.getByTestId('pedido-hub-actualizando')).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-hub-error-datos')).not.toBeInTheDocument()
  })

  it('empty (query válida, cero resultados) → mensaje + acción, nunca pantalla en blanco', () => {
    onlineRef.current = true
    render(<PedidoHub {...base} pedidos={[]} loading={false} error={null} refetching={false} onNuevaOperacion={vi.fn()} />)
    // OperacionList → EmptyState "No hay operaciones …"
    expect(screen.getByText(/No hay operaciones/i)).toBeInTheDocument()
    expect(screen.queryByTestId('pedido-hub-skeleton')).not.toBeInTheDocument()
  })

  it('retry: el botón "Reintentar" del error-con-datos dispara onRetry (fila `retry` §4.7)', () => {
    onlineRef.current = true
    const onRetry = vi.fn()
    render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error="timeout" refetching={false} onRetry={onRetry} />)
    fireEvent.click(within(screen.getByTestId('pedido-hub-error-datos')).getByRole('button', { name: /Reintentar/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('CONTRATO §4.7: sin estados inventados — el contenido principal es exactamente uno de {skeleton, empty, lista}', () => {
    onlineRef.current = true
    // con datos y sin error → lista, y NADA de skeleton/empty
    const { rerender } = render(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error={null} refetching={false} />)
    expect(screen.queryByTestId('pedido-hub-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByText(/No hay operaciones/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Tienda X/)).toBeInTheDocument()
    // error + datos → NUNCA se reemplaza la lista por una "pantalla de error"
    rerender(<PedidoHub {...base} pedidos={[pedido()]} loading={false} error="boom" refetching={false} onRetry={vi.fn()} />)
    expect(screen.getByText(/Tienda X/)).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron cargar las operaciones')).not.toBeInTheDocument()
  })
})
