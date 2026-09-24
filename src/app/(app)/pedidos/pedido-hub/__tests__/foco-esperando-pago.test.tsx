// @tests O-4 (F10a, docs/pedidos/fase10a-preflight-informe.md): el foco
// "Esperando pago" mostraba el número de la vista cargada (p. ej. Turno) junto
// al monto global de /api/pedidos/counts → "0 · $101.800" en producción.
// Número y monto salen ahora del mismo aggregate global, igual que
// "Por planificar" y "En ruta".

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

vi.mock('@/hooks/use-online-status', () => ({ useOnlineStatus: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import { PedidoHub } from '../index'
import type { Pedido } from '../types'

// Vista "Turno": solo ventas de hoy ya pagadas — ninguna en esperandoPago.
const pagado = {
  id: 'p1', numero: 263, clienteId: 'CONSUMIDOR_FINAL', nombreCli: 'Venta anónima', telefonoCli: '', zonaCli: '', barrioCli: '',
  tipo: 'PUNTO', canal: 'PUNTO', estado: 'ENTREGADO', origen: 'VENTA_RAPIDA',
  estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
  items: [{ producto: 'PACA_AGUA', cantPedido: 2, cantEntrega: 2, precio: 3000, subtotal: 6000 }],
  total: 6000, saldo: 0, totalPagado: 6000, fecha: '2026-09-23T15:00:00.000Z',
} as unknown as Pedido

describe('Hub — foco "Esperando pago" (O-4)', () => {
  it('muestra el número global de /counts aunque la vista no tenga pedidos en ese foco', () => {
    render(
      <PedidoHub
        pedidos={[pagado]}
        loading={false}
        error={null}
        refetching={false}
        counts={{
          porPlanificarCount: 15, atrasadosCount: 14, enRutaCount: 0,
          esperandoPagoCount: 12, esperandoPagoTotal: 101_800, pendientesN2Count: 0,
        }}
        userRole="ADMIN"
        onAccion={vi.fn()}
      />,
    )
    const chip = screen.getByTestId('foco-esperandoPago')
    expect(screen.getByTestId('foco-esperandoPago-value')).toHaveTextContent('12')
    // el monto sigue saliendo del mismo aggregate
    expect(chip).toHaveTextContent(/101[.,]800/)
  })
})
