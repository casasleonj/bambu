import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PedidoReview } from '../pedido-review'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'

const preview: PreviewPedidoResult = {
  calculation: {
    items: [], subtotal: 40000, recargoDomicilio: 0, total: 40000, totalPagado: 0,
    saldoProyectado: 40000, saldoFavorProyectado: 0,
    estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE',
  },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'],
  warnings: [],
  riskSignals: [
    { tipo: 'MONTO_ANOMALO', severidad: 'ALTA', detalle: 'Monto 6x el promedio del cliente' },
    { tipo: '2DO_PEDIDO', severidad: 'BAJA', detalle: 'segundo pedido hoy' },
  ],
  requiresAuthorization: true,
  authorizationPolicy: 'Pedidos sobre $30.000 requieren revisión',
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total: 40000, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
}

describe('PedidoReview', () => {
  it('muestra impacto, política y solo las señales de severidad ALTA', () => {
    render(<PedidoReview preview={preview} motivo="" onMotivoChange={vi.fn()} onConfirm={vi.fn()} onVolver={vi.fn()} />)
    expect(screen.getByText('Pedidos sobre $30.000 requieren revisión')).toBeInTheDocument()
    const alto = screen.getByTestId('review-senales-alto')
    expect(alto).toHaveTextContent('Monto 6x el promedio')
    expect(alto).not.toHaveTextContent('segundo pedido hoy')
  })

  it('el botón continuar está deshabilitado sin motivo y habilitado con motivo', () => {
    const { rerender } = render(
      <PedidoReview preview={preview} motivo="" onMotivoChange={vi.fn()} onConfirm={vi.fn()} onVolver={vi.fn()} />,
    )
    expect(screen.getByTestId('review-confirmar')).toBeDisabled()
    rerender(<PedidoReview preview={preview} motivo="es un cliente mayorista" onMotivoChange={vi.fn()} onConfirm={vi.fn()} onVolver={vi.fn()} />)
    expect(screen.getByTestId('review-confirmar')).toBeEnabled()
  })

  it('dispara onConfirm y onVolver', () => {
    const onConfirm = vi.fn()
    const onVolver = vi.fn()
    render(<PedidoReview preview={preview} motivo="ok" onMotivoChange={vi.fn()} onConfirm={onConfirm} onVolver={onVolver} />)
    fireEvent.click(screen.getByTestId('review-confirmar'))
    fireEvent.click(screen.getByTestId('review-volver'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onVolver).toHaveBeenCalledOnce()
  })
})
