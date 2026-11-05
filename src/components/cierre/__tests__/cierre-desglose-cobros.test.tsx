// @tests #631 — bloque del cierre: de dónde viene lo cobrado, pagos por confirmar y a quién se fió hoy.
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CierreDesgloseCobros from '../cierre-desglose-cobros'
import type { CierreData } from '@/app/(app)/cierre/cierre-client/types'
import type { DesgloseCobros } from '@/lib/cierre-desglose-cobros'

const parte = (efectivo: number, digital: number, porMetodo: Record<string, number> = {}) => ({ efectivo, digital, total: efectivo + digital, porMetodo })
const desglose = (over: Partial<DesgloseCobros> = {}): DesgloseCobros => ({
  ventasHoy: parte(410000, 150000, { NEQUI: 90000, TRANSFERENCIA: 60000 }),
  fiadosAnteriores: parte(55000, 40000, { TRANSFERENCIA: 40000 }),
  abonos: { ...parte(0, 0), independientes: 0, ajustes: 0 },
  efectivo: 465000, digital: 190000, total: 655000, esperado: 655000, diferencia: 0, cuadra: true, ...over,
})
const fila = (over = {}) => ({ pagoId: 'g1', pedidoId: 'p1', numero: 1042, clienteId: 'c1', cliente: 'Tienda La Esperanza', factura: 'F-0318', fecha: '2026-11-05T15:42:00.000Z', metodo: 'NEQUI', monto: 90000, ...over })
const datos = (over: Record<string, unknown> = {}) => ({
  desgloseCobros: desglose(), fiadosDelDia: [], porConfirmar: { total: 0, count: 0, porMetodo: {}, diasPreviosCount: 0, diasPreviosTotal: 0 }, ...over,
}) as unknown as CierreData

describe('#631 CierreDesgloseCobros', () => {
  it('separa efectivo (a la caja) de digital (a cuentas) con los medios con valor', () => {
    render(<CierreDesgloseCobros data={datos()} />)
    const ef = screen.getByTestId('cierre-cobro-efectivo')
    const dig = screen.getByTestId('cierre-cobro-digital')
    expect(ef.textContent).toContain('entra a la caja')
    expect(ef.textContent).toContain('465.000')
    expect(dig.textContent).toContain('entra a cuentas')
    expect(dig.textContent).toContain('190.000')
    expect(dig.textContent).toContain('Nequi')
    expect(dig.textContent).toContain('Transferencia')
    expect(dig.textContent).not.toContain('Daviplata')
    expect(screen.getByTestId('cierre-desglose-cuadra')).toBeTruthy()
  })

  it('sin pagos digitales no muestra el recuadro digital ni la columna', () => {
    render(<CierreDesgloseCobros data={datos({ desgloseCobros: desglose({
      ventasHoy: parte(320000, 0), fiadosAnteriores: parte(0, 0), efectivo: 320000, digital: 0, total: 320000, esperado: 320000,
    }) })} />)
    expect(screen.queryByTestId('cierre-cobro-digital')).toBeNull()
    expect(screen.getByTestId('cierre-desglose-tabla').textContent).not.toContain('Digital')
    expect(screen.getByTestId('cierre-desglose-tabla').textContent).not.toContain('Fiados de días anteriores')
  })

  it('sin cobros dice que no hubo cobros', () => {
    render(<CierreDesgloseCobros data={datos({ desgloseCobros: desglose({
      ventasHoy: parte(0, 0), fiadosAnteriores: parte(0, 0), efectivo: 0, digital: 0, total: 0, esperado: 0,
    }) })} />)
    expect(screen.getByTestId('cierre-desglose-sin-cobros')).toBeTruthy()
  })

  it('avisa (sin bloquear) cuando el desglose no cuadra', () => {
    render(<CierreDesgloseCobros data={datos({ desgloseCobros: desglose({ total: 650000, diferencia: -5000, cuadra: false }) })} />)
    expect(screen.getByTestId('cierre-desglose-no-cuadra').textContent).toContain('5.000')
  })

  it('cierre histórico sin desglose muestra el aviso', () => {
    render(<CierreDesgloseCobros data={datos({ desgloseCobros: undefined })} />)
    expect(screen.getByTestId('cierre-desglose-historico')).toBeTruthy()
  })

  it('lista a quién se fió con enlaces: cliente → Fiados filtrado, # → detalle del pedido', () => {
    render(<CierreDesgloseCobros data={datos({ fiadosDelDia: [
      { pedidoId: 'p1', numero: 1042, clienteId: 'c1', cliente: 'Tienda La Esperanza', total: 96000, pagado: 0, saldo: 96000, promesaPago: '2026-11-12' },
      { pedidoId: 'p2', numero: 1047, clienteId: 'c2', cliente: 'Don Pedro Ruiz', total: 80000, pagado: 30000, saldo: 50000, promesaPago: null },
    ] })} />)
    const sec = screen.getByTestId('cierre-fiados-del-dia')
    expect(sec.textContent).toContain('2 pedidos')
    expect(sec.textContent).toContain('146.000')
    expect(within(sec).getByText('Tienda La Esperanza').getAttribute('href')).toBe('/pedidos?tab=fiados&clienteId=c1')
    expect(within(sec).getByText('#1042').getAttribute('href')).toBe('/pedidos?openPedido=p1')
    expect(sec.textContent).toContain('Fiado total')
    expect(sec.textContent).toContain('sin promesa')
    expect(sec.textContent).toContain('Pagó')
    expect(sec.textContent).toContain('promesa de pago')
  })

  it('sin fiados lo dice', () => {
    render(<CierreDesgloseCobros data={datos()} />)
    expect(screen.getByTestId('cierre-fiados-del-dia').textContent).toContain('Hoy no se fió ningún pedido')
  })

  it('no ofrece enlace a Fiados para el consumidor final', () => {
    render(<CierreDesgloseCobros data={datos({ porConfirmar: {
      total: 10000, count: 1, porMetodo: {}, diasPreviosCount: 0, diasPreviosTotal: 0,
      detalleHoy: [fila({ clienteId: 'CONSUMIDOR_FINAL', cliente: 'Consumidor Final' })], detalleDiasPrevios: [],
    } })} />)
    const nombre = within(screen.getByTestId('cierre-por-confirmar-hoy')).getAllByText('Consumidor Final')[0]
    expect(nombre.getAttribute('href')).toBeNull()
  })

  it('pagos por confirmar: pedido, cliente, factura y fecha; hoy y días anteriores', () => {
    render(<CierreDesgloseCobros data={datos({ porConfirmar: {
      total: 90000, count: 1, porMetodo: { NEQUI: 90000 }, diasPreviosCount: 1, diasPreviosTotal: 80000,
      detalleHoy: [fila()], detalleDiasPrevios: [fila({ pagoId: 'g9', pedidoId: 'p9', numero: 1019, cliente: 'Don Pedro Ruiz', clienteId: 'c9', factura: null, monto: 80000, metodo: 'TRANSFERENCIA' })],
    } })} />)
    const caja = screen.getByTestId('cierre-por-confirmar')
    expect(caja.textContent).toContain('2')
    expect(caja.textContent).toContain('170.000')
    expect(within(screen.getByTestId('cierre-por-confirmar-hoy')).getAllByText('F-0318').length).toBeGreaterThan(0)
    expect(screen.getByTestId('cierre-por-confirmar-previos').textContent).toContain('no bloquea el cierre')
    expect(screen.getByTestId('cierre-por-confirmar-previos').textContent).toContain('Sin factura')
  })

  it('sin pagos por confirmar no aparece el desplegable', () => {
    render(<CierreDesgloseCobros data={datos()} />)
    expect(screen.queryByTestId('cierre-por-confirmar')).toBeNull()
  })
})

describe('#631 botón «Confirmar →» (con la confirmación de pagos activa)', () => {
  const conFlag = async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_PAGO_CONFIRMACION', 'true')
    return (await import('../cierre-desglose-cobros')).default
  }
  const porConfirmar = { total: 90000, count: 1, porMetodo: {}, diasPreviosCount: 0, diasPreviosTotal: 0, detalleHoy: [fila()], detalleDiasPrevios: [] }
  afterEach(() => vi.unstubAllEnvs())

  it('quien confirma pagos va a la cola filtrada por ESE pedido', async () => {
    const Componente = await conFlag()
    render(<Componente data={datos({ porConfirmar, confirmaPagos: { puede: true, nombre: null } })} />)
    expect(screen.getAllByTestId('cierre-confirmar-pago')[0].getAttribute('href')).toBe('/pagos-confirmar?pedidoId=p1')
  })

  it('quien no confirma ve quién lo hace, sin botón', async () => {
    const Componente = await conFlag()
    render(<Componente data={datos({ porConfirmar, confirmaPagos: { puede: false, nombre: 'Carlos' } })} />)
    expect(screen.queryByTestId('cierre-confirmar-pago')).toBeNull()
    expect(screen.getAllByText('Lo confirma Carlos').length).toBeGreaterThan(0)
  })

  it('con la confirmación desactivada solo informa, sin botón', () => {
    render(<CierreDesgloseCobros data={datos({ porConfirmar, confirmaPagos: { puede: true, nombre: null } })} />)
    expect(screen.queryByTestId('cierre-confirmar-pago')).toBeNull()
  })
})
