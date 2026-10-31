import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

// #535 — «Venta en ruta» en el workspace de Pedidos. El servidor vuelve a exigir cada regla;
// aquí se prueba lo que la pantalla promete: repartidor obligatorio, promesa solo si un cliente
// real queda debiendo, origen siempre VENTA_RAPIDA y qué viaja al servidor.

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaComplementario: [], faltaBloqueante: [],
}

const previewBody = (total: number, pagado: number) => ({
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 3, precioUnitario: total / 3, subtotal: total, precioOrigen: 'base' }], subtotal: total, recargoDomicilio: 0, total, totalPagado: pagado, saldoProyectado: Math.max(0, total - pagado), saldoFavorProyectado: 0, estadoEntregaProyectado: 'ENTREGADO', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'], warnings: [], riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total, clienteId: 'c1', canal: 'DOMICILIO', origen: 'VENTA_RAPIDA', tienePrecioManual: false } },
})

const cuerposPreview: Array<Record<string, unknown>> = []

function routedFetch() {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.includes('/api/pedidos/preview')) {
      const body = init?.body ? JSON.parse(init.body) : {}
      cuerposPreview.push(body)
      const pagado = ((body.pagos ?? []) as Array<{ monto: number }>).reduce((s, p) => s + (p.monto || 0), 0)
      return { ok: true, json: async () => previewBody(9000, pagado) }
    }
    if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
    if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
    if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
    if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
    if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [] } }) }
    return { ok: true, json: async () => ({ success: true }) }
  })
}

const clientes = [{ id: 'c1', nombre: 'Tienda X', telefono: '3001112222', direccion: 'Cra 1', barrio: 'Centro' }]
const repartidores = [{ id: 'r1', nombre: 'Germain León' }, { id: 'r2', nombre: 'Marlon Herazo' }]

beforeEach(() => {
  cuerposPreview.length = 0
  vi.stubGlobal('fetch', routedFetch())
})
afterEach(() => vi.unstubAllGlobals())

function montar(onSubmit = vi.fn().mockResolvedValue(true)) {
  render(
    <PedidosWorkspace
      clientes={clientes}
      intent="venta-rapida"
      ventaEnRuta={{ repartidores }}
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

async function agregarProductoYDireccion() {
  fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
  fireEvent.change(await screen.findByTestId('workspace-entrega-direccion'), { target: { value: 'Calle 1 # 2-3' } })
}

describe('PedidosWorkspace — venta en ruta (#535)', () => {
  it('nace a domicilio, sin elegir canal, y pide quién la vendió', () => {
    montar()
    expect(screen.getByTestId('workspace-venta-en-ruta')).toBeInTheDocument()
    expect(screen.getByTestId('venta-ruta-repartidor')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-canal-PUNTO')).toBeNull()
    expect(screen.queryByTestId('workspace-canal-DOMICILIO')).toBeNull()
    expect(screen.getByTestId('workspace-entrega')).toBeInTheDocument()
  })

  it('sin repartidor no se envía nada y se marca el campo', async () => {
    const onSubmit = montar()
    await agregarProductoYDireccion()
    fireEvent.click(await screen.findByTestId('dinero-pagar-completo-EFECTIVO'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(await screen.findByText('Elige quién la vendió.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('con repartidor envía origen VENTA_RAPIDA, domicilio y vendidoPorId (anónimo, sin promesa)', async () => {
    const onSubmit = montar()
    await agregarProductoYDireccion()
    fireEvent.click(await screen.findByTestId('dinero-pagar-completo-EFECTIVO'))
    fireEvent.change(screen.getByTestId('venta-ruta-repartidor'), { target: { value: 'r1' } })
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const enviado = onSubmit.mock.calls[0][0]
    expect(enviado).toMatchObject({ origen: 'VENTA_RAPIDA', canal: 'DOMICILIO', clienteId: 'CONSUMIDOR_FINAL', vendidoPorId: 'r1' })
    expect(enviado.promesaPagoFecha).toBeUndefined()
    expect(screen.queryByTestId('venta-ruta-promesa')).toBeNull()
  })

  it('con un cliente real el origen sigue siendo VENTA_RAPIDA (también en el preview) y debiendo pide la promesa', async () => {
    const onSubmit = montar()
    fireEvent.click(screen.getByTestId('workspace-identificar'))
    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
    await waitFor(() => expect(screen.getByTestId('cliente-search-result')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('cliente-search-result'))
    await agregarProductoYDireccion()
    fireEvent.change(screen.getByTestId('venta-ruta-repartidor'), { target: { value: 'r2' } })

    // queda debiendo todo: aparece la fecha de la promesa
    const fecha = await screen.findByTestId('venta-ruta-promesa')
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    // el preview del servidor proyecta lo mismo que el commit: venta rápida entregada
    await waitFor(() => expect(cuerposPreview.some((c) => c.clienteId === 'c1' && c.origen === 'VENTA_RAPIDA')).toBe(true))
    expect(cuerposPreview.every((c) => c.origen === 'VENTA_RAPIDA')).toBe(true)

    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(await screen.findByText('Falta la fecha de la promesa de pago.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(fecha, { target: { value: '2099-01-01' } })
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      origen: 'VENTA_RAPIDA', clienteId: 'c1', vendidoPorId: 'r2', promesaPagoFecha: '2099-01-01',
    })
  })

  it('sin repartidores activos explica qué hacer', () => {
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" ventaEnRuta={{ repartidores: [] }} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('venta-ruta-sin-repartidores')).toBeInTheDocument()
  })

  it('una venta rápida normal NO muestra la zona ni manda vendidoPorId', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<PedidosWorkspace clientes={clientes} intent="venta-rapida" onSubmit={onSubmit} />)
    expect(screen.queryByTestId('workspace-venta-en-ruta')).toBeNull()
    expect(screen.getByTestId('workspace-canal-PUNTO')).toBeInTheDocument()
  })
})
