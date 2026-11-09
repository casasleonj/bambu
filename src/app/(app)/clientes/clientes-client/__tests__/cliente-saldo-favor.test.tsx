// @tests #696 — saldo a favor en el detalle del cliente: estados y origen de cada movimiento.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { ClienteSaldoFavor } from '../cliente-saldo-favor'
import { __resetPanelCaches } from '../panel-prefetch'
import type { MovimientoSaldoFavorCliente, SaldoFavorCliente } from '@/lib/saldo-favor-cliente'

const entrada: MovimientoSaldoFavorCliente = {
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
    recibio: { quien: 'REPARTIDOR', nombre: 'Carlos Mejía', fecha: '2026-11-08T18:05:00.000Z' },
  },
  referencia: 'cobro-7f3a91',
}
const correccion: MovimientoSaldoFavorCliente = {
  id: 'm1',
  tipo: 'ACREDITACION',
  monto: 1500,
  signo: 1,
  fecha: '2026-11-02T21:30:00.000Z',
  metodo: null,
  motivo: 'El precio acordado era $1.800 por paca',
  origenTipo: 'CORRECCION_PRECIO',
  registro: { nombre: 'Luis Torres', rol: 'ADMIN' },
  pedido: { id: 'p2', numero: 1271, factura: 'F-00212', negocio: 'Tienda Don Pedro' },
  cobro: null,
  referencia: null,
}
const reversion: MovimientoSaldoFavorCliente = { ...correccion, id: 'm2', tipo: 'REVERSION_ANULACION', signo: -1, monto: 500, origenTipo: 'ANULACION', motivo: 'Pedido anulado por error' }

const lectura = (extra: Partial<SaldoFavorCliente> = {}): SaldoFavorCliente => ({
  cliente: { id: 'c1', nombre: 'Pedro Gómez' },
  saldo: 4000,
  movimientos: [entrada, correccion],
  hayMas: false,
  ...extra,
})

const respuesta = (cuerpo: unknown, ok = true) => ({ ok, json: () => Promise.resolve(cuerpo) }) as Response

describe('ClienteSaldoFavor', () => {
  beforeEach(() => __resetPanelCaches())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('mientras carga muestra un esqueleto (no un cero)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<ClienteSaldoFavor clienteId="c1" />)
    expect(screen.getByTestId('saldo-favor-cargando')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByTestId('saldo-favor-monto')).not.toBeInTheDocument()
  })

  it('con saldo: tarjeta con el monto, línea corta por movimiento y nada de detalle hasta abrirlo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura() })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    expect(await screen.findByTestId('saldo-favor-monto')).toHaveTextContent('4.000')
    const filas = screen.getAllByTestId('saldo-favor-movimiento')
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveTextContent('Entregó de más al pagar fiados')
    expect(filas[0]).toHaveTextContent('Lo registró Ana Ruiz')
    expect(filas[0]).toHaveTextContent('+')
    expect(filas[1]).toHaveTextContent('Corrección de precio de un pedido')
    expect(filas[0]).not.toHaveAttribute('open')
  })

  it('«Pedido #N» abre un recuadro con pedido, factura y negocio sin abrir el detalle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura() })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    const fila = (await screen.findAllByTestId('saldo-favor-movimiento'))[0]
    fireEvent.click(within(fila).getByRole('button', { name: 'Pedido #1285' }))
    const recuadro = screen.getByRole('tooltip')
    expect(recuadro).toHaveTextContent('Pedido #1285')
    expect(recuadro).toHaveTextContent('Factura F-00231')
    expect(recuadro).toHaveTextContent('Negocio: Tienda Don Pedro')
    expect(fila).not.toHaveAttribute('open')
  })

  it('el detalle de una entrada dice cobro, pedidos pagados, quién registró y quién recibió el dinero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura() })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    const fila = (await screen.findAllByTestId('saldo-favor-movimiento'))[0] as HTMLDetailsElement
    fila.open = true
    const d = within(fila).getByTestId('saldo-favor-detalle')
    expect(d).toHaveTextContent('Efectivo')
    expect(d).toHaveTextContent('Se recibieron')
    expect(d).toHaveTextContent('a deuda')
    expect(d).toHaveTextContent('#1285 · Factura F-00231 · Tienda Don Pedro')
    expect(d).toHaveTextContent('Ana Ruiz (Asistente)')
    expect(d).toHaveTextContent('Carlos Mejía (repartidor)')
    expect(d).toHaveTextContent('cobro-7f3a91')
  })

  it('el detalle de una corrección dice pedido, motivo y quién lo registró; una resta lleva el signo −', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura({ movimientos: [reversion, correccion] }) })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    const filas = (await screen.findAllByTestId('saldo-favor-movimiento')) as HTMLDetailsElement[]
    expect(filas[0]).toHaveTextContent('Se restó al anular un pedido')
    expect(filas[0]).toHaveTextContent('−')
    filas[1].open = true
    const d = within(filas[1]).getByTestId('saldo-favor-detalle')
    expect(d).toHaveTextContent('#1271 · Factura F-00212 · Tienda Don Pedro')
    expect(d).toHaveTextContent('«El precio acordado era $1.800 por paca»')
    expect(d).toHaveTextContent('Luis Torres (Administrador)')
  })

  it('una entrada sin auditoría legible dice «Sin dato» y no inventa pedido, factura ni quién recibió', async () => {
    const sinDato = { ...entrada, cobro: null, registro: null, referencia: null }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura({ movimientos: [sinDato] }) })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    const fila = (await screen.findByTestId('saldo-favor-movimiento')) as HTMLDetailsElement
    fila.open = true
    const d = within(fila).getByTestId('saldo-favor-detalle')
    expect(d).toHaveTextContent('Sin dato')
    expect(d).not.toHaveTextContent('Recibió el dinero')
    expect(d).not.toHaveTextContent('Lo registró')
    expect(within(fila).queryByRole('button', { name: /Pedido #/ })).not.toBeInTheDocument()
  })

  it('sin saldo ni movimientos: una línea que lo dice (no una tarjeta en cero)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura({ saldo: 0, movimientos: [] }) })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    expect(await screen.findByTestId('saldo-favor-vacio')).toHaveTextContent('no tiene')
    expect(screen.queryByTestId('saldo-favor-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('saldo-favor-movimiento')).not.toBeInTheDocument()
  })

  it('sin saldo pero con historial: dice que no tiene y conserva los movimientos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura({ saldo: 0, movimientos: [correccion, reversion] }) })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    expect(await screen.findByTestId('saldo-favor-vacio')).toBeInTheDocument()
    expect(screen.getAllByTestId('saldo-favor-movimiento')).toHaveLength(2)
  })

  it('con más de 5 movimientos muestra 5 y «Ver los N restantes»; avisa si hay más de los que se traen', async () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({ ...correccion, id: `m${i}` }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura({ movimientos: muchos, hayMas: true }) })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    await screen.findByTestId('saldo-favor-card')
    expect(screen.getAllByTestId('saldo-favor-movimiento')).toHaveLength(5)
    fireEvent.click(screen.getByTestId('ver-restantes'))
    expect(screen.getAllByTestId('saldo-favor-movimiento')).toHaveLength(8)
    expect(screen.getByText(/50 movimientos más recientes/)).toBeInTheDocument()
  })

  it('aclara que el uso del saldo en pedidos nuevos todavía no se guarda', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ success: true, ...lectura() })))
    render(<ClienteSaldoFavor clienteId="c1" />)
    expect(await screen.findByText(/todavía no se guarda/)).toBeInTheDocument()
  })

  it('si falla dice que NO es cero y Reintentar vuelve a pedirlo', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respuesta({}, false)).mockResolvedValueOnce(respuesta({ success: true, ...lectura() }))
    vi.stubGlobal('fetch', fetchMock)
    render(<ClienteSaldoFavor clienteId="c1" />)
    const aviso = await screen.findByTestId('saldo-favor-error')
    expect(aviso).toHaveTextContent('No es cero')
    expect(screen.queryByTestId('saldo-favor-vacio')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByTestId('saldo-favor-monto')).toHaveTextContent('4.000')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('al cambiar de cliente no deja ver el saldo del anterior', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(respuesta(url.includes('/c2/') ? { success: true, ...lectura({ saldo: 0, movimientos: [] }) } : { success: true, ...lectura() })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<ClienteSaldoFavor clienteId="c1" />)
    expect(await screen.findByTestId('saldo-favor-monto')).toBeInTheDocument()
    rerender(<ClienteSaldoFavor clienteId="c2" />)
    expect(screen.queryByTestId('saldo-favor-monto')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('saldo-favor-vacio')).toBeInTheDocument())
  })
})
