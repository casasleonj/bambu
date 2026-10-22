import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaComplementario: [], faltaBloqueante: [],
}

const previewBody = (total: number) => ({
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 3, precioUnitario: total / 3, subtotal: total, precioOrigen: 'base' }], subtotal: total, recargoDomicilio: 0, total, totalPagado: 0, saldoProyectado: total, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'], warnings: [], riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false,
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

  async function llegarACommit() {
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
  }

  it('idempotencia (§5.B): si el guardado falla, el borrador queda reintentable y reenvía la MISMA clave', async () => {
    const onSubmit = vi.fn<(d: { offlineId?: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await llegarACommit()

    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    expect(screen.getByText(/no se duplica/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    const [primera, segunda] = onSubmit.mock.calls.map((c) => c[0].offlineId)
    expect(primera).toBeTruthy()
    expect(segunda).toBe(primera)
  })

  it('idempotencia (§5.B): cada borrador nuevo tiene su propia clave', async () => {
    const onSubmit = vi.fn<(d: { offlineId?: string }) => Promise<boolean>>().mockResolvedValue(true)
    const { unmount } = render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await llegarACommit()
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    unmount()

    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await llegarACommit()
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    const [a, b] = onSubmit.mock.calls.map((c) => c[0].offlineId)
    expect(a).not.toBe(b)
  })

  it('F-ENTREGA-i: zona Entrega adaptativa por preview.entrega — SUFICIENTE compacta, sin inputs', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-entrega')).toHaveAttribute('data-estado', 'SUFICIENTE'), { timeout: 3000 })
    expect(screen.queryByTestId('workspace-entrega-direccion')).not.toBeInTheDocument()
  })

  it('F-ENTREGA-i: preview.entrega INSUFICIENTE → zona con inputs + commit deshabilitado', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/pedidos/preview')) {
        const b = previewBody(9000)
        return { ok: true, json: async () => ({ ...b, permissions: { ...b.permissions, canCreate: false }, allowedActions: [], warnings: [{ code: 'ENTREGA_INSUFICIENTE', message: 'Falta info de entrega' }], entrega: { ...ENTREGA_OK, estado: 'INSUFICIENTE', via: null, direccion: null, faltaBloqueante: ['direccion', 'ubicacion'] } }) }
      }
      if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
      if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
      if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
      if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
      if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [] } }) }
      return { ok: true, json: async () => ({ success: true }) }
    }))
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-entrega-insuficiente')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-entrega-direccion')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })

  it('F-ENTREGA-i: PedidoContextPanel ya no muestra sus inputs "Dirección */Barrio *" en el workspace', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirCliente()
    // el panel de contexto no renderiza los inputs legacy de dirección de entrega
    expect(screen.queryByPlaceholderText('Dirección *')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Barrio *')).not.toBeInTheDocument()
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

  it('P1-2: la venta rápida nace en PUNTO (sin zona de entrega); DOMICILIO es una elección explícita', () => {
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={vi.fn()} />)
    expect(screen.queryByTestId('workspace-entrega')).not.toBeInTheDocument()
  })

  it('P1-2: venta rápida a DOMICILIO muestra la zona Entrega con la dirección obligatoria; con PUNTO desaparece', async () => {
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('workspace-canal-DOMICILIO'))
    expect(screen.getByTestId('workspace-entrega')).toHaveTextContent('dirección obligatoria')
    expect(screen.getByTestId('workspace-entrega-direccion')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-entrega-barrio')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('workspace-canal-PUNTO'))
    expect(screen.queryByTestId('workspace-entrega')).not.toBeInTheDocument()
  })

  it('P1-2: la dirección escrita en la venta rápida viaja en el payload (DOMICILIO) y no con PUNTO', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('workspace-canal-DOMICILIO'))
    fireEvent.change(screen.getByTestId('workspace-entrega-direccion'), { target: { value: 'Calle 5 # 3-2' } })
    fireEvent.change(screen.getByTestId('workspace-entrega-barrio'), { target: { value: 'Centro' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      origen: 'VENTA_RAPIDA', canal: 'DOMICILIO', direccionEntrega: 'Calle 5 # 3-2', barrioEntrega: 'Centro',
    }))
  })

  describe('P1-3 (#394): un solo bloque «Comprador»', () => {
    const conTiendas = [
      {
        id: 'c1', nombre: 'Marcos', apellido: 'Ruiz', telefono: '3001234567', barrio: 'Centro', direccion: 'Calle 1',
        negocios: [
          { id: 'n1', nombre: 'Tienda La Esperanza', tipoNegocio: 'Tienda', barrio: 'Centro', direccion: 'Cra 7 # 10-20' },
          { id: 'n2', nombre: 'Sucursal Norte', tipoNegocio: 'Tienda', barrio: 'Norte', direccion: 'Cll 80' },
        ],
      },
      { id: 'c2', nombre: 'Ana', apellido: 'Torres', telefono: '3109998888' },
    ]
    const buscar = (valor: string) => fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: valor } })

    it('la venta rápida nace «Sin identificar» y «Identificar» abre el buscador', () => {
      render(<PedidosWorkspace clientes={conTiendas} intent="venta-rapida" onSubmit={vi.fn()} />)
      expect(screen.getByTestId('workspace-venta-rapida')).toHaveTextContent('Sin identificar')
      expect(screen.queryByTestId('cliente-search-input')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('workspace-identificar'))
      expect(screen.getByTestId('cliente-search-input')).toBeInTheDocument()
    })

    it('buscar una tienda: solo sale la tienda (con el dueño como dato secundario) y un toque la elige', async () => {
      const onSubmit = vi.fn()
      render(<PedidosWorkspace clientes={conTiendas} intent="venta-rapida" onSubmit={onSubmit} />)
      fireEvent.click(screen.getByTestId('workspace-identificar'))
      buscar('esperanza')
      const filas = await screen.findAllByTestId('cliente-search-result')
      expect(filas).toHaveLength(1)
      expect(filas[0]).toHaveAttribute('data-tipo', 'negocio')
      expect(filas[0]).toHaveTextContent('de Marcos Ruiz')
      fireEvent.click(filas[0])

      // un solo bloque: tienda elegida, sin «Persona», sin «domicilio principal», sin segundo selector
      expect(screen.getByTestId('comprador-nombre')).toHaveTextContent('Tienda La Esperanza')
      expect(screen.getByTestId('comprador-detalle')).toHaveTextContent('de Marcos Ruiz')
      expect(screen.queryByText(/domicilio principal/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Negocio \/ Sucursal/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('negocio-selector-resumen')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
      await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
      fireEvent.click(screen.getByTestId('workspace-commit'))
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        clienteId: 'c1', negocioId: 'n1', origen: 'PEDIDO',
      }))
    })

    it('buscar a la persona: salen la persona y TODAS sus tiendas, y ninguna queda elegida', async () => {
      render(<PedidosWorkspace clientes={conTiendas} onSubmit={vi.fn()} />)
      buscar('marcos')
      const filas = await screen.findAllByTestId('cliente-search-result')
      expect(filas.map((f) => f.getAttribute('data-tipo'))).toEqual(['persona', 'negocio', 'negocio'])
      expect(screen.queryByTestId('comprador-elegido')).not.toBeInTheDocument()
      fireEvent.click(filas[0])
      expect(screen.getByTestId('comprador-nombre')).toHaveTextContent('Marcos Ruiz')
      expect(screen.getByTestId('comprador-nombre')).not.toHaveTextContent('🏪')
    })

    it('«Cambiar» vuelve al buscador y «Dejar sin identificar» devuelve la venta a Consumidor Final', async () => {
      const onSubmit = vi.fn()
      render(<PedidosWorkspace clientes={conTiendas} intent="venta-rapida" onSubmit={onSubmit} />)
      fireEvent.click(screen.getByTestId('workspace-identificar'))
      buscar('ana')
      fireEvent.click(await screen.findByTestId('cliente-search-result'))
      expect(screen.getByTestId('comprador-nombre')).toHaveTextContent('Ana Torres')
      fireEvent.click(screen.getByTestId('comprador-cambiar'))
      expect(screen.getByTestId('cliente-search-input')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('workspace-identificar-cancelar'))
      expect(screen.getByTestId('workspace-venta-rapida')).toHaveTextContent('Sin identificar')

      fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
      await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
      fireEvent.click(screen.getByTestId('workspace-commit'))
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'CONSUMIDOR_FINAL', origen: 'VENTA_RAPIDA' }))
    })

    it('el aviso de deuda aparece una sola vez por cliente', async () => {
      render(<PedidosWorkspace clientes={[{ ...conTiendas[0], saldoPendiente: 18000 }]} onSubmit={vi.fn()} />)
      buscar('marcos')
      await screen.findAllByTestId('cliente-search-result')
      expect(screen.getAllByTestId('cliente-search-deuda')).toHaveLength(1)
    })
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
