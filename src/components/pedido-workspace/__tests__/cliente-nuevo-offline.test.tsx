import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'
import { PedidoCreateSchema } from '@/lib/validators'

/**
 * Paridad Hub ↔ legacy (docs/pedidos/HUB_REVISION_INTEGRAL_v1.0.md §12):
 *  - B-19 (#346): crear un cliente nuevo desde el workspace.
 *  - B-20 (#347): crear un pedido sin conexión.
 */

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaBloqueante: [], faltaComplementario: [],
}

const previewBody = (total: number) => ({
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 1, precioUnitario: total, subtotal: total, precioOrigen: 'base' }], subtotal: total, recargoDomicilio: 0, total, totalPagado: 0, saldoProyectado: total, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'], warnings: [], riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total, clienteId: '', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
})

function baseRoutes(url: string) {
  if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
  if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
  if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
  if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
  if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [] } }) }
  return { ok: true, json: async () => ({ success: true }) }
}

const clientes = [{ id: 'c1', nombre: 'Tienda X', telefono: '3001112222', direccion: 'Cra 1', barrio: 'Centro' }]

afterEach(() => vi.unstubAllGlobals())

describe('B-19 — cliente nuevo en el workspace (#346)', () => {
  let previewBodies: Array<Record<string, unknown>>
  beforeEach(() => {
    previewBodies = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.includes('/api/pedidos/preview')) {
        previewBodies.push(init?.body ? JSON.parse(init.body) : {})
        return { ok: true, json: async () => previewBody(6000) }
      }
      return baseRoutes(url)
    }))
  })

  async function abrirClienteNuevo() {
    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Zulma' } })
    fireEvent.click(await screen.findByText(/Crear cliente nuevo/i))
    fireEvent.change(screen.getByPlaceholderText('Nombre *'), { target: { value: 'Zulma' } })
    fireEvent.change(screen.getByPlaceholderText('Teléfono *'), { target: { value: '3015550000' } })
    fireEvent.change(screen.getByPlaceholderText('Dirección *'), { target: { value: 'Cra 9 # 4-5' } })
    fireEvent.change(screen.getByPlaceholderText('Barrio *'), { target: { value: 'Centro' } })
  }

  it('con nombre, teléfono y un producto se pide el preview y el botón se habilita', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await abrirClienteNuevo()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    expect(previewBodies.at(-1)).toMatchObject({
      clienteNuevo: expect.objectContaining({ nombre: 'Zulma', telefono: '3015550000' }),
    })
    expect(previewBodies.at(-1)?.clienteId).toBeUndefined()
  })

  it('el commit envía clienteNuevo, origen PEDIDO y la clave del borrador', async () => {
    const onSubmit = vi.fn()
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await abrirClienteNuevo()
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      origen: 'PEDIDO',
      clienteNuevo: expect.objectContaining({ nombre: 'Zulma', telefono: '3015550000', direccion: 'Cra 9 # 4-5' }),
      offlineId: expect.any(String),
    }))
    // el payload real tiene que pasar el esquema del servidor (antes: 400 por clienteId vacío)
    const parsed = PedidoCreateSchema.safeParse(onSubmit.mock.calls[0][0])
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  })

  it('sin teléfono no se pide preview ni se habilita el botón (misma validación que el formulario antiguo)', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await abrirClienteNuevo()
    fireEvent.change(screen.getByPlaceholderText('Teléfono *'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await new Promise((r) => setTimeout(r, 700))
    expect(previewBodies).toHaveLength(0)
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })
})

describe('B-20 — crear pedido sin conexión (#347)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/pedidos/preview')) throw new TypeError('Failed to fetch')
      return baseRoutes(url)
    }))
  })

  async function elegirClienteYProducto() {
    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
    fireEvent.click(await screen.findByTestId('cliente-search-result'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
  }

  it('si el preview no responde, se puede guardar sin conexión y se dice con claridad', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
    await elegirClienteYProducto()
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-commit')).toHaveTextContent(/sin conexión/i)
    expect(screen.getByTestId('workspace-offline-aviso')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: undefined }],
      offlineId: expect.any(String),
    }))
    expect(PedidoCreateSchema.safeParse(onSubmit.mock.calls[0][0]).success).toBe(true)
  })

  it('un error del servidor (no de red) NO habilita el guardado sin conexión', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/pedidos/preview')) return { ok: false, json: async () => ({ success: false, error: { message: 'Cliente no encontrado' } }) }
      return baseRoutes(url)
    }))
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    await elegirClienteYProducto()
    await waitFor(() => expect(screen.getByTestId('workspace-error')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
  })

  it('venta rápida sin conexión: "Pagado en efectivo" cobra el total ESTIMADO con la tabla ya cargada y lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/pedidos/preview')) throw new TypeError('Failed to fetch')
      if (url.includes('/api/precios/tabla')) {
        return { ok: true, json: async () => ({ success: true, tabla: { PACA_AGUA: [{ cantMin: 1, cantMax: null, precio: 2500 }] } }) }
      }
      return baseRoutes(url)
    }))
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={onSubmit} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/precios/tabla'))
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-offline-aviso')).toBeInTheDocument(), { timeout: 3000 })
    await waitFor(() => expect(screen.getByTestId('dinero-total')).toHaveTextContent(/estimado/i))
    fireEvent.click(screen.getByTestId('dinero-pagar-completo-EFECTIVO'))
    await waitFor(() => expect(screen.getByTestId('dinero-aplicado')).toHaveTextContent(/5[.,]000/))
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      origen: 'VENTA_RAPIDA',
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      offlineId: expect.any(String),
    }))
  })
})
