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

/** stub de fetch enrutado por URL — el workspace hace varios GET además del preview. */
function routedFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/pedidos/preview')) return { ok: true, json: async () => previewBody(9000) }
    if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
    if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
    if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
    if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
    if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [{ estadoEntrega: 'ENTREGADO', canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantPedido: 3 }] }] } }) }
    return { ok: true, json: async () => ({ success: true }) }
  })
}

const clientes = [{ id: 'c1', nombre: 'Tienda X', telefono: '3001112222', direccion: 'Cra 1', barrio: 'Centro' }]

async function elegirCliente() {
  fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
  await waitFor(() => expect(screen.getByTestId('cliente-search-result')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('cliente-search-result'))
}

beforeEach(() => {
  vi.stubGlobal('fetch', routedFetch())
})
afterEach(() => vi.unstubAllGlobals())

describe('PedidosWorkspace (Composición)', () => {
  it('renderiza las zonas por contexto (no es un <form> con ifs) — G1', () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('workspace-contexto')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-operacion')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-calculo')).toBeInTheDocument()
    expect(screen.getByTestId('pedidos-workspace').querySelector('form')).toBeNull()
  })

  it('el total viene del preview del backend, no de un cálculo client-side', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toHaveTextContent(/Crear pedido \$9[.,]000/), { timeout: 3000 })
  })

  it('commit deshabilitado sin preview; habilitado en PREVIEW_READY; onSubmit con el payload', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()

    await elegirCliente()
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

  it('intent venta-rapida ⇒ origen VENTA_RAPIDA en el payload, sin panel de cliente', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={onSubmit} />)
    expect(screen.getByTestId('workspace-venta-rapida')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ origen: 'VENTA_RAPIDA', clienteId: 'CONSUMIDOR_FINAL' }))
  })

  it('un cambio de cantidad tras el preview vuelve a deshabilitar el commit (preview stale)', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })

  it('"Repetir el pedido anterior" aplica los items del último pedido al draft', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('proposal-pedir'))
    await waitFor(() => expect(screen.getByTestId('proposal-usar-ultima')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('proposal-usar-ultima'))
    expect((screen.getByTestId('workspace-cant-PACA_AGUA') as HTMLInputElement).value).toBe('3')
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
  })

  it('preview con requiresAuthorization → PedidoReview; motivo obligatorio; luego commit y obs con [Revisión]', async () => {
    const authPreview = { ...previewBody(9000), requiresAuthorization: true, authorizationPolicy: 'Requiere revisión' }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/pedidos/preview')) return { ok: true, json: async () => authPreview }
      if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
      if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
      if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
      if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
      if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', productosSugeridos: [], pedidos: [] } }) }
      return { ok: true, json: async () => ({ success: true }) }
    }))
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))

    await waitFor(() => expect(screen.getByTestId('workspace-review')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()

    // sin motivo, confirmar no avanza
    fireEvent.click(screen.getByTestId('review-confirmar'))
    expect(screen.getByTestId('workspace-review')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('review-motivo'), { target: { value: 'cliente mayorista' } })
    fireEvent.click(screen.getByTestId('review-confirmar'))

    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ obs: '[Revisión: cliente mayorista]' }))
  })

  it('el banner de fiados aparece cuando el cliente está al límite', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'limite', count: 3, limite: 3 } }) }
      if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
      if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
      if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
      return { ok: true, json: async () => ({ success: true }) }
    }))
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    await waitFor(() => expect(screen.getByTestId('fiado-status-banner')).toBeInTheDocument())
  })
})
