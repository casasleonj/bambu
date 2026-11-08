// @tests #408 — aviso (no bloqueo) de venta repetida en el Hub: se confirma con una casilla y la confirmación viaja al servidor.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PedidosWorkspace } from '../index'

const ENTREGA_OK = {
  estado: 'SUFICIENTE', via: 'TEXTO', direccion: 'Cra 1', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaComplementario: [], faltaBloqueante: [],
}

const REPETIDA = { id: 'ped-1234', numero: 1234, haceSegundos: 25 }

const previewBody = (total: number, pagado: number, repetida: typeof REPETIDA | null) => ({
  success: true,
  calculation: { items: [{ producto: 'PACA_AGUA', cantidad: 3, precioUnitario: total / 3, subtotal: total, precioOrigen: 'base' }], subtotal: total, recargoDomicilio: 0, total, totalPagado: pagado, saldoProyectado: Math.max(0, total - pagado), saldoFavorProyectado: 0, estadoEntregaProyectado: 'ENTREGADO', estadoPagoProyectado: 'PENDIENTE' },
  permissions: { canCreate: true, canSetManualPrice: true },
  allowedActions: ['crear'],
  warnings: repetida ? [{ code: 'VENTA_POSIBLE_DUPLICADA', message: `Parece una venta repetida: hace ${repetida.haceSegundos} segundos se registró la venta #${repetida.numero}` }] : [],
  ventaRepetida: repetida ?? undefined,
  riskSignals: [], entrega: ENTREGA_OK, requiresAuthorization: false,
  auditPreview: { actor: 'u', accion: 'CREAR_PEDIDO', recurso: 'Pedido (nuevo)', valoresRelevantes: { total, clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', origen: 'VENTA_RAPIDA', tienePrecioManual: false } },
})

let repetidaActual: typeof REPETIDA | null = REPETIDA
const cuerposPreview: Array<Record<string, unknown>> = []

function routedFetch() {
  return vi.fn(async (url: string, init?: { body?: string }) => {
    if (url.includes('/api/pedidos/preview')) {
      const body = init?.body ? JSON.parse(init.body) : {}
      cuerposPreview.push(body)
      const pagado = ((body.pagos ?? []) as Array<{ monto: number }>).reduce((s, p) => s + (p.monto || 0), 0)
      return { ok: true, json: async () => previewBody(9000, pagado, repetidaActual) }
    }
    if (url.includes('/fiado-status')) return { ok: true, json: async () => ({ success: true, status: { nivel: 'ok', count: 0, limite: 3 } }) }
    if (url.includes('/api/negocios')) return { ok: true, json: async () => ({ success: true, data: [] }) }
    if (url.includes('/api/precios/tabla')) return { ok: true, json: async () => ({ success: true, tabla: {} }) }
    if (url.includes('/api/productos/configs')) return { ok: true, json: async () => ({ success: true, productos: [] }) }
    return { ok: true, json: async () => ({ success: true }) }
  })
}

beforeEach(() => {
  repetidaActual = REPETIDA
  cuerposPreview.length = 0
  vi.stubGlobal('fetch', routedFetch())
})
afterEach(() => vi.unstubAllGlobals())

async function montarYLlegarAlCobro(onSubmit = vi.fn().mockResolvedValue(true)) {
  render(<PedidosWorkspace clientes={[]} intent="venta-rapida" onSubmit={onSubmit} />)
  fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA'))
  fireEvent.click(await screen.findByTestId('dinero-pagar-completo-EFECTIVO'))
  return onSubmit
}

describe('PedidosWorkspace — aviso de venta repetida (#408)', () => {
  it('muestra el aviso con la venta señalada y un enlace para verla; no bloquea para siempre', async () => {
    await montarYLlegarAlCobro()
    const aviso = await screen.findByTestId('venta-repetida')
    expect(aviso).toHaveTextContent('Parece una venta repetida')
    expect(screen.getByTestId('venta-repetida-texto')).toHaveTextContent('Hace 25 segundos se registró la venta #1234')
    expect(screen.getByTestId('venta-repetida-ver')).toHaveAttribute('href', '/pedidos?openPedido=ped-1234')
    // el aviso del servidor no se repite en la lista general de advertencias
    expect(screen.getAllByText(/Parece una venta repetida/)).toHaveLength(1)
  })

  it('«Cobrar» queda apagado hasta marcar la casilla; al marcarla se puede guardar', async () => {
    await montarYLlegarAlCobro()
    await screen.findByTestId('venta-repetida')
    expect(screen.getByTestId('workspace-commit')).toBeDisabled()
    expect(screen.getByText('Marca «Es otra venta distinta» para continuar.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('venta-repetida-confirmar'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
  })

  it('la confirmación viaja como ventaRepetidaConfirmada y el preview manda la clave del borrador', async () => {
    const onSubmit = await montarYLlegarAlCobro()
    await screen.findByTestId('venta-repetida')
    fireEvent.click(screen.getByTestId('venta-repetida-confirmar'))
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const enviado = onSubmit.mock.calls[0][0]
    expect(enviado.ventaRepetidaConfirmada).toBe(true)
    expect(typeof enviado.offlineId).toBe('string')
    expect(cuerposPreview.every((c) => c.borradorId === enviado.offlineId)).toBe(true)
  })

  it('sin aviso no aparece la casilla ni se envía la confirmación', async () => {
    repetidaActual = null
    const onSubmit = await montarYLlegarAlCobro()
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    expect(screen.queryByTestId('venta-repetida')).toBeNull()
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].ventaRepetidaConfirmada).toBeUndefined()
  })

  it('si el aviso desaparece (se cambia la venta) ya no exige la casilla ni la manda', async () => {
    const onSubmit = await montarYLlegarAlCobro()
    await screen.findByTestId('venta-repetida')
    fireEvent.click(screen.getByTestId('venta-repetida-confirmar'))
    repetidaActual = null
    fireEvent.click(screen.getByTestId('workspace-inc-PACA_AGUA')) // cambia el borrador → nuevo preview sin aviso
    await waitFor(() => expect(screen.queryByTestId('venta-repetida')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('workspace-commit')).toBeEnabled())
    fireEvent.click(screen.getByTestId('workspace-commit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].ventaRepetidaConfirmada).toBeUndefined()
  })
})
