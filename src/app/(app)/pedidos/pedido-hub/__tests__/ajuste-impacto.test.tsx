import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AjusteImpacto } from '../ajuste-impacto'
import type { ProyectarAjusteCantidadResult } from '@/modules/pedidos/application/use-cases/ProyectarAjusteCantidadUseCase'

const base = (over: Partial<ProyectarAjusteCantidadResult> = {}): ProyectarAjusteCantidadResult => ({
  producto: 'PACA_AGUA',
  cantidadOriginal: 10,
  cantidadEntregada: 0,
  cantidadNueva: 12,
  delta: 2,
  precioHistorico: 2000,
  subtotalAntes: 20000,
  subtotalDespues: 24000,
  totalAntes: 20000,
  totalDespues: 24000,
  totalPagado: 5000,
  saldoAntes: 15000,
  saldoDespues: 19000,
  estadoEntrega: 'PENDIENTE',
  estadoPagoAntes: 'PARCIAL',
  estadoPagoDespues: 'PARCIAL',
  sobrepagoProyectado: 0,
  bloqueadoPor: null,
  warnings: [],
  allowedActions: ['confirmar-correccion'],
  puedeCorregir: true,
  ...over,
})

describe('AjusteImpacto', () => {
  it('muestra cantidad, precio, subtotal, total y saldo antes→después', () => {
    render(<AjusteImpacto proyeccion={base()} />)
    const dl = screen.getByTestId('ajuste-impacto')
    expect(dl).toHaveTextContent('10 → 12')
    expect(dl).toHaveTextContent('$2.000')
    expect(dl).toHaveTextContent('$20.000 → $24.000')
    expect(dl).toHaveTextContent('$15.000 → $19.000')
  })

  it('muestra cambio de estado de pago sólo si cambia', () => {
    const { rerender } = render(<AjusteImpacto proyeccion={base()} />)
    expect(screen.queryByText(/Estado de pago/)).not.toBeInTheDocument()
    rerender(<AjusteImpacto proyeccion={base({ estadoPagoDespues: 'PENDIENTE' })} />)
    expect(screen.getByText(/Estado de pago/)).toBeInTheDocument()
  })

  it('sobrepago proyectado → aviso explícito', () => {
    render(<AjusteImpacto proyeccion={base({ cantidadNueva: 2, delta: -8, subtotalDespues: 4000, totalDespues: 4000, saldoDespues: -1000, sobrepagoProyectado: 1000, bloqueadoPor: 'CORRECCION_GENERARIA_SOBREPAGO', puedeCorregir: false })} />)
    expect(screen.getByTestId('ajuste-impacto-sobrepago')).toHaveTextContent('$1.000 a favor')
  })

  it('guard bloqueante → título del guard, tono ámbar', () => {
    render(<AjusteImpacto proyeccion={base({ cantidadEntregada: 4, bloqueadoPor: 'CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA', puedeCorregir: false })} />)
    expect(screen.getByTestId('ajuste-guard-CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')).toBeInTheDocument()
    expect(screen.getByTestId('ajuste-impacto').className).toContain('amber')
  })

  it('warnings se listan', () => {
    render(<AjusteImpacto proyeccion={base({ delta: 0, cantidadNueva: 10, warnings: [{ code: 'SIN_CAMBIO', message: 'La cantidad nueva es igual a la actual.' }] })} />)
    expect(screen.getByTestId('ajuste-impacto-warnings')).toHaveTextContent('igual a la actual')
  })
})
