import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoRiskSignals } from '../pedido-risk-signals'

describe('PedidoRiskSignals', () => {
  it('no renderiza nada sin warnings ni señales', () => {
    const { container } = render(<PedidoRiskSignals warnings={[]} riskSignals={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marca los warnings bloqueantes distinto de los informativos', () => {
    render(
      <PedidoRiskSignals
        warnings={[
          { code: 'FIADO_SOBRE_LIMITE', message: 'Cliente al límite de fiados' },
          { code: 'PRECIO_MANUAL_APLICADO', message: 'Precio manual aplicado' },
        ]}
        riskSignals={[]}
      />,
    )
    expect(screen.getByTestId('risk-warning-FIADO_SOBRE_LIMITE').className).toContain('red')
    expect(screen.getByTestId('risk-warning-PRECIO_MANUAL_APLICADO').className).toContain('amber')
  })

  it('ordena las señales de riesgo por severidad (ALTA primero) y expande la guía', () => {
    render(
      <PedidoRiskSignals
        warnings={[]}
        riskSignals={[
          { tipo: '1ER_PEDIDO', severidad: 'BAJA', detalle: 'Primer pedido del cliente' },
          { tipo: 'MONTO_ANOMALO', severidad: 'ALTA', detalle: 'Monto 5x el promedio' },
        ]}
      />,
    )
    const items = screen.getAllByTestId(/^risk-signal-/)
    expect(items[0].getAttribute('data-testid')).toBe('risk-signal-MONTO_ANOMALO')
    expect(items[1].getAttribute('data-testid')).toBe('risk-signal-1ER_PEDIDO')
    // el detalle específico de la señal está visible
    expect(screen.getByText(/Monto 5x el promedio/)).toBeInTheDocument()
    // la nota de "señal, no acusación" existe
    expect(screen.getAllByText(/no un bloqueo ni una acusación/).length).toBeGreaterThan(0)
  })

  it('tolera un tipo de señal sin guía (usa el tipo crudo como nombre)', () => {
    render(
      <PedidoRiskSignals
        warnings={[]}
        riskSignals={[{ tipo: 'TIPO_INEXISTENTE_XYZ', severidad: 'MEDIA', detalle: 'algo' }]}
      />,
    )
    const el = screen.getByTestId('risk-signal-TIPO_INEXISTENTE_XYZ')
    expect(el).toBeInTheDocument()
    fireEvent.click(el.querySelector('summary')!)
    expect(screen.getByText(/algo/)).toBeInTheDocument()
  })
})
