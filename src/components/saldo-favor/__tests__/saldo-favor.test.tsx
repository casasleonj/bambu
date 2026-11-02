// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { SaldoFavorAnulacionAviso } from '../saldo-favor-anulacion-aviso'
import { SaldoFavorHistorial } from '../saldo-favor-historial'

const cliente = { titular: 'Rosa Gómez', tienda: 'Tienda La Esperanza' }
const proy = (o: Partial<{ salioDelPedido: number; seResta: number; yaUsado: number; saldoActual: number; saldoDespues: number }> = {}) => ({
  salioDelPedido: 20000, seResta: 20000, yaUsado: 0, saldoActual: 35000, saldoDespues: 15000, ...o,
})
const mov = (tipo: string, monto: number, extra: Record<string, unknown> = {}) => ({
  id: `${tipo}-${monto}`, tipo, monto, origenTipo: tipo === 'REVERSION_ANULACION' ? 'ANULACION' : 'CORRECCION_PRECIO',
  motivo: 'error de facturación', fecha: '2026-11-01T15:00:00Z', autor: 'Ana', ...extra,
})

function responder(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }))
}

describe('SaldoFavorAnulacionAviso (#577)', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => cleanup())

  it('mientras carga, lo dice y no promete montos', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    expect(screen.getByTestId('saldo-favor-cargando')).toBeTruthy()
  })

  it('todo se puede restar: muestra de cuánto a cuánto queda el saldo a favor y nombra la tienda', async () => {
    responder({ pedido: { id: 'p1', numero: 1, estadoEntrega: 'ENTREGADO' }, cliente, proyeccion: proy(), resultado: null, movimientos: [] })
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    const caja = await screen.findByTestId('saldo-favor-se-resta')
    expect(caja.textContent).toContain('Tienda La Esperanza')
    expect(caja.textContent).toMatch(/Al anular, ese saldo se resta/)
    expect(caja.textContent).toMatch(/\$\s?35\.000\s*→\s*\$\s?15\.000/)
    expect(caja.textContent).toMatch(/Los\s+\$\s?15\.000 restantes vienen de otros pedidos/)
    expect(screen.queryByTestId('saldo-favor-parte-usada')).toBeNull()
  })

  it('parte ya usada: aviso ámbar que separa lo que se resta de lo ya usado', async () => {
    responder({
      pedido: { id: 'p1', numero: 1, estadoEntrega: 'ENTREGADO' }, cliente, resultado: null, movimientos: [],
      proyeccion: proy({ seResta: 8000, yaUsado: 12000, saldoActual: 8000, saldoDespues: 0 }),
    })
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    const caja = await screen.findByTestId('saldo-favor-parte-usada')
    expect(caja.textContent).toMatch(/ya usó\s+\$\s?12\.000/)
    expect(caja.textContent).toMatch(/el cliente no queda debiendo/)
    expect(caja.textContent).toMatch(/\$\s?8\.000\s*→\s*\$\s?0/)
  })

  it('sin crédito del pedido: dice que el saldo a favor no cambia', async () => {
    responder({ pedido: { id: 'p1', numero: 1, estadoEntrega: 'ENTREGADO' }, cliente, proyeccion: proy({ salioDelPedido: 0, seResta: 0, saldoDespues: 35000 }), resultado: null, movimientos: [] })
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    expect((await screen.findByTestId('saldo-favor-sin-credito')).textContent).toMatch(/no cambia/)
  })

  it('sin tienda usa el nombre del titular; al cancelar el verbo cambia', async () => {
    responder({ pedido: { id: 'p1', numero: 1, estadoEntrega: 'PENDIENTE' }, cliente: { titular: 'Rosa Gómez', tienda: null }, proyeccion: proy(), resultado: null, movimientos: [] })
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="cancelar" />)
    const caja = await screen.findByTestId('saldo-favor-se-resta')
    expect(caja.textContent).toContain('Rosa Gómez')
    expect(caja.textContent).toMatch(/Al cancelar, ese saldo se resta/)
  })

  it('sin conexión o error del servidor: avisa que no pudo calcular y que se verá el monto al terminar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    const caja = await screen.findByTestId('saldo-favor-sin-conexion')
    expect(caja.textContent).toMatch(/No pude calcular/)
    expect(caja.textContent).toMatch(/verás el monto exacto/)
    cleanup()
    responder({}, false)
    render(<SaldoFavorAnulacionAviso pedidoId="p1" accion="anular" />)
    await waitFor(() => expect(screen.getByTestId('saldo-favor-sin-conexion')).toBeTruthy())
  })
})

describe('SaldoFavorHistorial (#577)', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => cleanup())

  it('no muestra nada si el pedido nunca movió saldo a favor', async () => {
    responder({ pedido: { id: 'p1', numero: 1, estadoEntrega: 'ENTREGADO' }, cliente, proyeccion: proy({ salioDelPedido: 0 }), resultado: null, movimientos: [] })
    const { container } = render(<SaldoFavorHistorial pedidoId="p1" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.querySelector('[data-testid="saldo-favor-historial"]')).toBeNull()
  })

  it('pedido anulado con parte ya usada: resumen, filas del historial y la fila de lo ya usado', async () => {
    responder({
      pedido: { id: 'p1', numero: 1234, estadoEntrega: 'ANULADO' }, cliente, proyeccion: null,
      resultado: { revertido: 8000, yaUsado: 12000 },
      movimientos: [mov('ACREDITACION', 20000), mov('REVERSION_ANULACION', 8000)],
    })
    render(<SaldoFavorHistorial pedidoId="p1" />)
    const resumen = await screen.findByTestId('saldo-favor-resultado')
    expect(resumen.textContent).toMatch(/Al anular se restaron\s+\$\s?8\.000/)
    expect(resumen.textContent).toMatch(/\$\s?12\.000\s+ya se habían usado en otros pedidos/)
    const tabla = screen.getByTestId('saldo-favor-historial')
    expect(tabla.textContent).toContain('Pasó al saldo a favor (corrección de precio)')
    expect(tabla.textContent).toContain('Se restó al anular el pedido')
    expect(tabla.textContent).toContain('Motivo: error de facturación')
    expect(tabla.textContent).toMatch(/\+\s\$\s?20\.000/)
    expect(tabla.textContent).toMatch(/−\s\$\s?8\.000/)
    expect(screen.getByTestId('saldo-favor-fila-ya-usado').textContent).toMatch(/12\.000/)
  })

  it('pedido anulado donde todo se restó: dice que no quedó saldo a favor', async () => {
    responder({
      pedido: { id: 'p1', numero: 1, estadoEntrega: 'CANCELADO' }, cliente, proyeccion: null,
      resultado: { revertido: 5000, yaUsado: 0 },
      movimientos: [mov('ACREDITACION', 5000), mov('REVERSION_ANULACION', 5000, { origenTipo: 'CANCELACION' })],
    })
    render(<SaldoFavorHistorial pedidoId="p1" />)
    const resumen = await screen.findByTestId('saldo-favor-resultado')
    expect(resumen.textContent).toMatch(/Al cancelar se restaron/)
    expect(resumen.textContent).toMatch(/No quedó saldo a favor de este pedido/)
    expect(screen.queryByTestId('saldo-favor-fila-ya-usado')).toBeNull()
    expect(screen.getByTestId('saldo-favor-historial').textContent).toContain('Se restó al cancelar el pedido')
  })
})
