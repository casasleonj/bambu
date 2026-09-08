import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

const previewBody = (total: number) => ({
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 3, precioUnitario: total / 3, subtotal: total, precioOrigen: 'base' }], subtotal: total, recargoDomicilio: 0, total, totalPagado: 0, saldoProyectado: total, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'], warnings: [], riskSignals: [], requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
})

const clientes = [{ id: 'c1', nombre: 'Tienda X' }]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => previewBody(9000) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('PedidosWorkspace (C1)', () => {
  it('renderiza las zonas por contexto (no es un <form> con ifs) — G1', () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('workspace-contexto')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-operacion')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-calculo')).toBeInTheDocument()
    expect(screen.getByTestId('pedidos-workspace').querySelector('form')).toBeNull()
  })

  it('el total viene del preview del backend, no de un cálculo client-side', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByTestId('workspace-cliente'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toHaveTextContent(/Crear pedido \$9[.,]000/), { timeout: 3000 })
  })

  it('commit deshabilitado sin preview; habilitado en PREVIEW_READY; onSubmit con el payload', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()

    fireEvent.change(screen.getByTestId('workspace-cliente'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })

    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3, precioManual: undefined }],
    }))
  })

  it('CONSUMIDOR_FINAL ⇒ origen VENTA_RAPIDA en el payload', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByTestId('workspace-cliente'), { target: { value: 'CONSUMIDOR_FINAL' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ origen: 'VENTA_RAPIDA' }))
  })

  it('un cambio de cantidad tras el preview vuelve a deshabilitar el commit (preview stale)', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByTestId('workspace-cliente'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })
})
