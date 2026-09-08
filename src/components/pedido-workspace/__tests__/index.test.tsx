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

const previewEdit = (total: number) => ({
  ...previewBody(total),
  allowedActions: ['actualizar'],
  calculation: { ...previewBody(total).calculation, totalPagado: 3000, saldoProyectado: total - 3000, estadoPagoProyectado: 'PARCIAL' },
  auditPreview: { ...previewBody(total).auditPreview, accion: 'ACTUALIZAR_PEDIDO', recurso: 'Pedido (edición)' },
})

/** stub de fetch enrutado por URL — el workspace hace varios GET además del preview. */
function routedFetch() {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.includes('/api/pedidos/preview')) {
      const body = init?.body ? JSON.parse(init.body) : {}
      return { ok: true, json: async () => (body.pedidoId ? previewEdit(9000) : previewBody(9000)) }
    }
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

  it('modo nueva-demanda (G11.B): cliente y canal fijos, sin panel de cliente ni toggle de canal', async () => {
    render(
      <PedidosWorkspace
        clientes={clientes}
        modo="nueva-demanda"
        pedidoOrigenNumero={42}
        initialDraft={{ clienteId: 'c1', canal: 'DOMICILIO', pedidoOrigenId: 'orig-1' }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByTestId('workspace-nueva-demanda')).toHaveTextContent('Nueva demanda de Tienda X')
    expect(screen.getByTestId('workspace-nueva-demanda')).toHaveTextContent('Pedido origen #42')
    expect(screen.queryByTestId('cliente-search-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workspace-canal-DOMICILIO')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workspace-canal-PUNTO')).not.toBeInTheDocument()
  })

  it('modo nueva-demanda: el commit emite pedidoOrigenId + origen PEDIDO + items nuevos', async () => {
    const onSubmit = vi.fn()
    render(
      <PedidosWorkspace
        clientes={clientes}
        modo="nueva-demanda"
        pedidoOrigenNumero={42}
        initialDraft={{ clienteId: 'c1', canal: 'DOMICILIO', pedidoOrigenId: 'orig-1' }}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', pedidoOrigenId: 'orig-1',
      items: [{ producto: 'PACA_AGUA', cantidad: 3, precioManual: undefined }],
    }))
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

  it('modo edición: items precargados, sin buscador de cliente, canal fijo, "Guardar cambios"', async () => {
    const onSubmit = vi.fn()
    render(
      <PedidosWorkspace
        clientes={clientes}
        onSubmit={onSubmit}
        pedidoInicial={{
          id: 'ped-9', numero: 42, clienteId: 'c1', clienteNombre: 'Tienda X', clienteTelefono: '3001112222',
          clienteDireccion: 'Cra 1', clienteBarrio: 'Centro', negocioId: null, canal: 'DOMICILIO', origen: 'PEDIDO',
          items: [{ producto: 'PACA_AGUA', cantidad: 4 }], obs: 'urgente',
        }}
      />,
    )
    // sin buscador de cliente
    expect(screen.queryByTestId('cliente-search-input')).not.toBeInTheDocument()
    // canal fijo (no toggle)
    expect(screen.getByTestId('workspace-canal-fijo')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-canal-PUNTO')).not.toBeInTheDocument()
    // items precargados
    expect((screen.getByTestId('workspace-cant-PACA_AGUA') as HTMLInputElement).value).toBe('4')

    // el preview de edición llega → "Guardar cambios" habilitado
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Guardar cambios')

    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      isEdit: true, pedidoId: 'ped-9', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4, precioManual: undefined }],
      obs: 'urgente',
    }))
  })

  it('modo edición: el origen se toma de pedidoInicial, NO se re-deriva del cliente', async () => {
    const onSubmit = vi.fn()
    // pedido VENTA_RAPIDA con un cliente real (caso donde el viejo initializer
    // `clienteId === CONSUMIDOR_FINAL ? VENTA_RAPIDA : PEDIDO` daría MAL 'PEDIDO')
    render(
      <PedidosWorkspace
        clientes={clientes}
        onSubmit={onSubmit}
        pedidoInicial={{
          id: 'ped-vr', clienteId: 'c1', clienteNombre: 'Tienda X', negocioId: null,
          canal: 'PUNTO', origen: 'VENTA_RAPIDA',
          items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
        }}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ origen: 'VENTA_RAPIDA', isEdit: true }))
  })

  it('modo edición: cambiar cantidad dispara un nuevo preview de edición', async () => {
    render(
      <PedidosWorkspace
        clientes={clientes}
        onSubmit={vi.fn()}
        pedidoInicial={{
          id: 'ped-9', clienteId: 'c1', clienteNombre: 'Tienda X', negocioId: null, canal: 'DOMICILIO', origen: 'PEDIDO',
          items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
        }}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    expect(screen.getByTestId('workspace-commit')).toBeDisabled() // preview stale
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent('Guardar cambios')
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
