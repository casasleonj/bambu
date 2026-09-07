// @tests Fase 3 del rediseño de Pedidos (docs/pedidos/00-plan-frontend-rediseno-integral.md):
// primera extracción del monolito pedido-form-unified/index.tsx hacia un
// componente ALS (PedidoPricingSummary, §5) — puramente presentacional, sin
// estado propio. Verifica que la extracción preserva exactamente el
// comportamiento visual que antes vivía inline (filtrado de líneas en cero,
// formato de moneda, ocultar pagado/saldo cuando son cero).

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PedidoPricingSummary } from '../pedido-pricing-summary'

describe('PedidoPricingSummary', () => {
  it('muestra el placeholder cuando no hay productos con cantidad > 0', () => {
    render(<PedidoPricingSummary lineas={[]} total={0} totalPagado={0} saldoPendiente={0} />)
    expect(screen.getByText('Sin productos seleccionados')).toBeInTheDocument()
  })

  it('filtra líneas con cantidad 0 (no las muestra en el ticket)', () => {
    render(
      <PedidoPricingSummary
        lineas={[
          { prodId: 'pacaAgua', cantidad: 0, precio: 10000 },
          { prodId: 'pacaHielo', cantidad: 2, precio: 8000 },
        ]}
        total={16000}
        totalPagado={0}
        saldoPendiente={16000}
      />,
    )
    expect(screen.queryByText(/pacaAgua/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 x/)).toBeInTheDocument()
  })

  it('muestra el total siempre, formateado con separador de miles', () => {
    render(<PedidoPricingSummary lineas={[]} total={125000} totalPagado={0} saldoPendiente={0} />)
    expect(screen.getByText('$125,000')).toBeInTheDocument()
  })

  it('oculta la fila de "Pagado" cuando totalPagado es 0', () => {
    render(<PedidoPricingSummary lineas={[]} total={10000} totalPagado={0} saldoPendiente={10000} />)
    expect(screen.queryByText('Pagado:')).not.toBeInTheDocument()
  })

  it('muestra "Pagado" y "Saldo" cuando ambos son mayores a 0 (pago parcial)', () => {
    render(<PedidoPricingSummary lineas={[]} total={10000} totalPagado={4000} saldoPendiente={6000} />)
    expect(screen.getByText('Pagado:')).toBeInTheDocument()
    expect(screen.getByText('$4,000')).toBeInTheDocument()
    expect(screen.getByText('Saldo:')).toBeInTheDocument()
    expect(screen.getByText('$6,000')).toBeInTheDocument()
  })

  it('oculta la fila de "Saldo" cuando el pedido está pagado completo', () => {
    render(<PedidoPricingSummary lineas={[]} total={10000} totalPagado={10000} saldoPendiente={0} />)
    expect(screen.getByText('Pagado:')).toBeInTheDocument()
    expect(screen.queryByText('Saldo:')).not.toBeInTheDocument()
  })
})
