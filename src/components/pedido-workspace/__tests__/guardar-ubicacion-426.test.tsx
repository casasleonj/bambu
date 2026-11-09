// @tests #426 — «Guardar también la ubicación» en el Hub: apagada por defecto, dice dónde se guarda y no pisa en silencio.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'
import { WorkspaceGuardarUbicacion } from '../workspace-guardar-ubicacion'
import { hayOtraUbicacion } from '../use-ubicacion-guardada'

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaComplementario: [], faltaBloqueante: [],
}
const preview = {
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 1, precioUnitario: 3000, subtotal: 3000, precioOrigen: 'base' }], subtotal: 3000, recargoDomicilio: 0, total: 3000, totalPagado: 0, saldoProyectado: 3000, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'], warnings: [], riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total: 3000, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } },
}

type Detalle = { lat: number | null; lng: number | null } | 'error'
let detalle: Detalle = { lat: null, lng: null }

function routedFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes('/api/pedidos/preview')) return { ok: true, json: async () => preview }
    if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
    if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
    if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
    if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
    if (/\/api\/clientes\/[^/]+$/.test(url)) {
      const d = detalle
      if (d === 'error') return { ok: false, status: 500, json: async () => ({ error: 'x' }) }
      return { ok: true, status: 200, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [], lat: d.lat, lng: d.lng, negocios: [] } }) }
    }
    return { ok: true, json: async () => ({ success: true }) }
  })
}

const clientes = [{ id: 'c1', nombre: 'Tienda X', telefono: '3001112222', direccion: 'Cra 1', barrio: 'Centro' }]

beforeEach(() => { detalle = { lat: null, lng: null }; vi.stubGlobal('fetch', routedFetch()) })
afterEach(() => vi.unstubAllGlobals())

async function conPuntoDelPedido() {
  const onSubmit = vi.fn()
  render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)
  fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
  fireEvent.click(await screen.findByTestId('cliente-search-result'))
  fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
  await waitFor(() => expect(screen.getByTestId('workspace-entrega')).toHaveAttribute('data-estado', 'SUFICIENTE'), { timeout: 3000 })
  fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
  fireEvent.change(screen.getByTestId('workspace-entrega-link'), { target: { value: 'https://www.google.com/maps?q=8.7479,-75.8814' } })
  await screen.findByTestId('workspace-guardar-ubicacion')
  await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
  return onSubmit
}

describe('Hub — guardar también la ubicación (#426)', () => {
  it('no aparece sin un punto propio del pedido; con el punto aparece apagada y dice dónde se guarda', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
    fireEvent.click(await screen.findByTestId('cliente-search-result'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('workspace-entrega')).toHaveAttribute('data-estado', 'SUFICIENTE'), { timeout: 3000 })
    expect(screen.queryByTestId('workspace-guardar-ubicacion')).toBeNull()
    fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
    fireEvent.change(screen.getByTestId('workspace-entrega-link'), { target: { value: 'https://www.google.com/maps?q=8.7479,-75.8814' } })
    expect(await screen.findByTestId('guardar-ubicacion-casilla')).not.toBeChecked()
    expect(screen.getByTestId('guardar-ubicacion-destino')).toHaveTextContent('Se guarda en el cliente.')
  })

  it('sin marcar la casilla no viaja nada de guardar la ubicación', async () => {
    const onSubmit = await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit.mock.calls[0][0].guardarUbicacion).toBeUndefined()
    expect(onSubmit.mock.calls[0][0].entregaLat).toBeCloseTo(8.7479, 4)
  })

  it('marcada y sin ubicación previa: se guarda sin preguntar nada más', async () => {
    const onSubmit = await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-casilla'))
    await waitFor(() => expect(screen.queryByTestId('guardar-ubicacion-cargando')).toBeNull())
    expect(screen.queryByTestId('guardar-ubicacion-otra')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit.mock.calls[0][0].guardarUbicacion).toEqual({})
  })

  it('si ya hay OTRA ubicación guardada no se pisa en silencio: hay que elegir, y la elección viaja', async () => {
    detalle = { lat: 8.7455, lng: -75.883 }
    const onSubmit = await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-casilla'))
    expect(await screen.findByTestId('guardar-ubicacion-otra')).toHaveTextContent('Guardada: 8.7455, -75.8830')
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
    expect(screen.getByText('Elige qué hacer con la ubicación que ya estaba guardada.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-reemplazar'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit.mock.calls[0][0].guardarUbicacion).toEqual({ reemplazar: true })
  })

  it('«Dejar la que ya tenía» guarda el pedido sin reemplazar', async () => {
    detalle = { lat: 8.7455, lng: -75.883 }
    const onSubmit = await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-casilla'))
    fireEvent.click(await screen.findByTestId('guardar-ubicacion-dejar'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit.mock.calls[0][0].guardarUbicacion).toEqual({})
  })

  it('la misma ubicación (a ~5 m) no pide elegir', async () => {
    detalle = { lat: 8.74791, lng: -75.88141 }
    await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-casilla'))
    expect(await screen.findByTestId('guardar-ubicacion-igual')).toBeInTheDocument()
    expect(screen.queryByTestId('guardar-ubicacion-otra')).toBeNull()
    expect(screen.getByTestId('workspace-commit')).toBeEnabled()
  })

  it('si no se pudo revisar la ubicación guardada, avisa y deja guardar el pedido (el servidor conserva la que haya)', async () => {
    detalle = 'error'
    const onSubmit = await conPuntoDelPedido()
    fireEvent.click(screen.getByTestId('guardar-ubicacion-casilla'))
    expect(await screen.findByTestId('guardar-ubicacion-sin-revisar')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit.mock.calls[0][0].guardarUbicacion).toEqual({})
  })
})

describe('WorkspaceGuardarUbicacion (presentación)', () => {
  const nueva = { lat: 8.7479, lng: -75.8814 }
  const base = { nueva, guardar: true, onGuardarChange: vi.fn(), reemplazar: null, onReemplazarChange: vi.fn() }

  it('en una tienda dice «la tienda <nombre>» y el título habla de la tienda', () => {
    render(<WorkspaceGuardarUbicacion {...base} nombreTienda="La Esquina" ubicacion={{ estado: 'ok', destino: 'NEGOCIO', anterior: { lat: 8.7455, lng: -75.883 } }} />)
    expect(screen.getByTestId('guardar-ubicacion-destino')).toHaveTextContent('Se guarda en la tienda La Esquina.')
    expect(screen.getByTestId('guardar-ubicacion-otra')).toHaveTextContent('La tienda ya tiene una ubicación')
  })

  it('las opciones se marcan y avisan su elección', () => {
    const onReemplazarChange = vi.fn()
    render(<WorkspaceGuardarUbicacion {...base} nombreTienda={null} onReemplazarChange={onReemplazarChange} ubicacion={{ estado: 'ok', destino: 'CLIENTE', anterior: { lat: 1, lng: 1 } }} />)
    fireEvent.click(screen.getByTestId('guardar-ubicacion-reemplazar'))
    expect(onReemplazarChange).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByTestId('guardar-ubicacion-dejar'))
    expect(onReemplazarChange).toHaveBeenCalledWith(false)
  })

  it('hayOtraUbicacion: null o igual no cuenta; un punto lejano sí', () => {
    expect(hayOtraUbicacion({ estado: 'ok', destino: 'CLIENTE', anterior: null }, nueva)).toBe(false)
    expect(hayOtraUbicacion({ estado: 'ok', destino: 'CLIENTE', anterior: nueva }, nueva)).toBe(false)
    expect(hayOtraUbicacion({ estado: 'error', destino: 'CLIENTE', anterior: { lat: 1, lng: 1 } }, nueva)).toBe(false)
    expect(hayOtraUbicacion({ estado: 'ok', destino: 'CLIENTE', anterior: { lat: 1, lng: 1 } }, nueva)).toBe(true)
  })
})
