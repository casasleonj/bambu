// @tests #696 — el Historial del cliente muestra los movimientos del saldo a favor con su origen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ClienteHistorial } from '../cliente-historial'
import { __resetPanelCaches } from '../panel-prefetch'
import type { MovimientoSaldoFavorCliente } from '@/lib/saldo-favor-cliente'
import type { TimelineEvent } from '../types'

const mov: MovimientoSaldoFavorCliente = {
  id: 'i1',
  tipo: 'ENTRADA_COBRO',
  monto: 4000,
  signo: 1,
  fecha: '2026-11-08T19:20:00.000Z',
  metodo: 'EFECTIVO',
  motivo: null,
  origenTipo: 'PAGAR_FIADO',
  registro: { nombre: 'Ana Ruiz', rol: 'ASISTENTE' },
  pedido: null,
  cobro: {
    montoRecibido: 14000,
    montoAplicado: 10000,
    pedidos: [{ id: 'p1', numero: 1285, factura: 'F-00231', negocio: 'Tienda Don Pedro', montoAplicado: 10000 }],
    recibio: null,
  },
  referencia: null,
}
const eventoSaldo: TimelineEvent = { id: 'saldofavor-i1', tipo: 'SALDO_FAVOR', fecha: mov.fecha, titulo: 'Entrada', monto: 4000, metadata: { movimiento: mov } }
const eventoPedido: TimelineEvent = { id: 'pedido-1', tipo: 'PEDIDO', fecha: '2026-11-07T10:00:00.000Z', titulo: 'Pedido #1290', numero: 1290, monto: 10000 }

const respuesta = (extra: Record<string, unknown> = {}) =>
  ({ ok: true, json: () => Promise.resolve({ success: true, events: [eventoSaldo, eventoPedido], total: 2, page: 1, pageSize: 20, hasMore: false, ...extra }) }) as Response

describe('ClienteHistorial · saldo a favor (#696)', () => {
  beforeEach(() => __resetPanelCaches())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('el filtro «Saldo a favor» deja solo esos movimientos, con su detalle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta()))
    render(<ClienteHistorial clienteId="c1" />)
    await waitFor(() => expect(screen.getByText('Pedido #1290')).toBeTruthy())
    expect(screen.getByTestId('saldo-favor-movimiento')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Saldo a favor' }))
    expect(screen.queryByText('Pedido #1290')).toBeNull()
    expect(screen.getByTestId('saldo-favor-movimiento')).toBeTruthy()
  })

  it('sin movimientos con el filtro puesto, lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ events: [eventoPedido] })))
    render(<ClienteHistorial clienteId="c1" />)
    await waitFor(() => expect(screen.getByText('Pedido #1290')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Saldo a favor' }))
    expect(screen.getByText(/Sin movimientos de saldo a favor/)).toBeTruthy()
  })

  it('si el saldo a favor no se pudo leer, avisa que no es que no existan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ events: [eventoPedido], saldoFavorNoDisponible: true })))
    render(<ClienteHistorial clienteId="c1" />)
    const aviso = await screen.findByTestId('historial-saldo-favor-error')
    expect(aviso.getAttribute('role')).toBe('status')
    expect(aviso.textContent).toMatch(/no significa que no existan/)
  })
})
