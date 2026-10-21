import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

/**
 * P0-3 (#357) — flujo completo dentro del workspace: cliente en el límite →
 * panel → pedir excepción → pendiente → autorizada → el preview levanta el
 * bloqueo con `excepcionId` → crear envía `excepcionId`.
 */

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaBloqueante: [], faltaComplementario: [],
}
const calculation = { items: [{ producto: 'PACA_AGUA', cantidad: 1, precioUnitario: 30000, subtotal: 30000, precioOrigen: 'base' }], subtotal: 30000, recargoDomicilio: 0, total: 30000, totalPagado: 0, saldoProyectado: 30000, saldoFavorProyectado: 0, estadoEntregaProyectado: 'PENDIENTE', estadoPagoProyectado: 'PENDIENTE' }
const credito = { limite: 4, abiertos: 4, saldoAbierto: 86000, saldoOperacion: 30000, abiertosDespues: 5, saldoDespues: 116000, bloqueado: true, causa: 'LIMITE' }
const audit = { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total: 30000, clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO', tienePrecioManual: false } }

const previewBloqueado = {
  success: true, calculation, permissions: { canCreate: false, canSetManualPrice: true }, allowedActions: [],
  warnings: [{ code: 'FIADO_SOBRE_LIMITE', message: 'Límite de fiados alcanzado' }], riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false, auditPreview: audit, credito,
}
const previewConExcepcion = {
  ...previewBloqueado, permissions: { canCreate: true, canSetManualPrice: true }, allowedActions: ['crear'], warnings: [],
  credito: { ...credito, bloqueado: false }, excepcionAplicada: { id: 'e1', motivoSolicitud: 'paga el viernes', autorizadoPorId: 'u2' },
}

const clientes = [{ id: 'c1', nombre: 'Tienda X', telefono: '3001112222', direccion: 'Cra 1', barrio: 'Centro' }]

describe('P0-3 — excepción de crédito en el workspace', () => {
  let previewBodies: Array<Record<string, unknown>>
  let estadoExcepcion: 'PENDIENTE' | 'AUTORIZADA'

  beforeEach(() => {
    previewBodies = []
    estadoExcepcion = 'PENDIENTE'
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.includes('/api/pedidos/preview')) {
        const body = init?.body ? JSON.parse(init.body) : {}
        previewBodies.push(body)
        return { ok: true, json: async () => (body.excepcionId === 'e1' ? previewConExcepcion : previewBloqueado) }
      }
      if (url === '/api/pedidos/excepciones-credito' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ success: true, id: 'e1', estado: 'PENDIENTE', deduped: false }) }
      }
      if (url === '/api/pedidos/excepciones-credito/e1') {
        return { ok: true, json: async () => ({ success: true, excepcion: { id: 'e1', estado: estadoExcepcion, motivoSolicitud: 'paga el viernes', operacionSaldoSnapshot: 30000, autorizadoPor: { nombre: 'Ana' } } }) }
      }
      if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'limite', count: 4, limite: 4 } }) }
      if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
      if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
      if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
      if (/\/api\/clientes\/[^/]+$/.test(url)) return { ok: true, json: async () => ({ success: true, cliente: { id: 'c1', frecuenciaSugerida: null, productosSugeridos: [], pedidos: [] } }) }
      return { ok: true, json: async () => ({ success: true }) }
    }))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('bloqueado → pedir → pendiente → autorizada → crear envía excepcionId', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(<PedidosWorkspace clientes={clientes} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
    fireEvent.click(await screen.findByTestId('cliente-search-result'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))

    // A · bloqueado: panel con números, sin aviso rojo duplicado y sin poder crear
    await waitFor(() => expect(screen.getByTestId('credito-panel')).toBeInTheDocument(), { timeout: 3000 })
    expect(screen.getByTestId('credito-tabla')).toHaveTextContent('5 de 4')
    expect(screen.queryByTestId('risk-warning-FIADO_SOBRE_LIMITE')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()

    // pedir excepción
    fireEvent.click(screen.getByTestId('credito-pedir-excepcion'))
    fireEvent.change(screen.getByTestId('credito-motivo'), { target: { value: 'paga el viernes' } })
    await act(async () => { fireEvent.click(screen.getByTestId('credito-enviar')) })
    // B · pendiente (el borrador y el botón siguen bloqueados)
    await waitFor(() => expect(screen.getByTestId('credito-estado-pendiente')).toBeInTheDocument())
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()

    // la persona autoriza; el siguiente consulta (10 s) lo detecta
    estadoExcepcion = 'AUTORIZADA'
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

    // C · autorizada: el preview recibe excepcionId y levanta el bloqueo
    await waitFor(() => expect(screen.getByTestId('credito-estado-autorizada')).toHaveTextContent('Ana'), { timeout: 3000 })
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled(), { timeout: 3000 })
    expect(previewBodies.at(-1)).toMatchObject({ excepcionId: 'e1' })

    fireEvent.click(screen.getByTestId('workspace-commit'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'c1', excepcionId: 'e1' }))
  })

  it('cambiar de cliente descarta la excepción del borrador', async () => {
    render(<PedidosWorkspace clientes={clientes} onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByTestId('cliente-search-input'), { target: { value: 'Tienda' } })
    fireEvent.click(await screen.findByTestId('cliente-search-result'))
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
    await waitFor(() => expect(screen.getByTestId('credito-panel')).toBeInTheDocument(), { timeout: 3000 })
    fireEvent.click(screen.getByTestId('credito-pedir-excepcion'))
    fireEvent.change(screen.getByTestId('credito-motivo'), { target: { value: 'm' } })
    await act(async () => { fireEvent.click(screen.getByTestId('credito-enviar')) })
    await waitFor(() => expect(screen.getByTestId('credito-estado-pendiente')).toBeInTheDocument())
    // quitar el cliente: ya no hay solicitud pendiente de ese cliente
    fireEvent.click(screen.getByTitle('Quitar cliente'))
    await waitFor(() => expect(screen.queryByTestId('credito-estado-pendiente')).not.toBeInTheDocument())
  })
})
