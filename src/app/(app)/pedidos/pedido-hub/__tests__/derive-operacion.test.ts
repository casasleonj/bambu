import { describe, it, expect } from 'vitest'
import { deriveOperacion } from '../derive-operacion'
import type { Pedido } from '../../pedidos-client/types'

const base = (over: Partial<Pedido>): Pedido => ({
  id: 'p1', numero: 1, clienteId: 'c1', nombreCli: 'Tienda X', telefonoCli: '300',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE',
  origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
  items: [], cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0,
  cBolsaAguaPed: 0, cBolsaHieloPed: 0, cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
  cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0, precioPacaAgua: 0, precioPacaHielo: 0,
  precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 10000, saldo: 10000, fecha: '2026-09-07T08:00:00.000Z',
  ...over,
})
const ctx = { hoyBogota: '2026-09-07' }

describe('deriveOperacion', () => {
  it('PENDIENTE sin embarque → acción "Planificar", foco porPlanificar', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'PENDIENTE', embarqueId: undefined }), ctx)
    expect(d.accionDestacada?.key).toBe('planificar')
    expect(d.focos).toContain('porPlanificar')
    expect(d.estadoLegible).toMatch(/[Pp]endiente/)
  })

  it('EN_RUTA → acción "Registrar entrega", foco enRuta', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'EN_RUTA', embarqueId: 'e1' }), ctx)
    expect(d.accionDestacada?.key).toBe('registrar-entrega')
    expect(d.focos).toContain('enRuta')
  })

  it('ENTREGADO con saldo → microcopy con deuda + días, acción "Registrar pago", foco esperandoPago', () => {
    const d = deriveOperacion(
      base({ estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL', totalPagado: 4000, saldo: 6000, fecha: '2026-09-04T08:00:00.000Z' }),
      ctx,
    )
    expect(d.accionDestacada?.key).toBe('registrar-pago')
    expect(d.focos).toContain('esperandoPago')
    expect(d.estadoLegible).toMatch(/6\.000/)
    expect(d.estadoLegible).toMatch(/3 d[ií]as/)
  })

  it('pago reportado sin confirmar → acción "Confirmar pago"', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', saldo: 0, totalPagado: 10000, pagoReportadoPendiente: true }), ctx)
    expect(d.accionDestacada?.key).toBe('confirmar-pago')
  })

  it('excepción abierta → acción "Resolver excepción", foco excepciones', () => {
    const d = deriveOperacion(base({ disputaAbierta: true }), { ...ctx, tieneExcepcion: true })
    expect(d.accionDestacada?.key).toBe('resolver-excepcion')
    expect(d.focos).toContain('excepciones')
  })

  it('pendiente N2 activo → acción "Completar pendiente", foco pendientesN2', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ENTREGADO', saldo: 0, totalPagado: 10000 }), { ...ctx, tienePendienteN2: true })
    expect(d.accionDestacada?.key).toBe('completar-pendiente')
    expect(d.focos).toContain('pendientesN2')
  })

  it('CANCELADO/ANULADO → sin acción destacada, sin focos', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ANULADO', estadoPago: 'ANULADO' }), ctx)
    expect(d.accionDestacada).toBeNull()
    expect(d.focos).toEqual([])
  })

  it('multi-pertenencia: EN_RUTA + excepción → ambos focos', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'EN_RUTA', embarqueId: 'e1', disputaAbierta: true }), { ...ctx, tieneExcepcion: true })
    expect(d.focos).toEqual(expect.arrayContaining(['enRuta', 'excepciones']))
  })

  it('cliente bloqueado → acción "Ver cartera" (prioridad sobre registrar pago)', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL', totalPagado: 4000, saldo: 6000 }), { ...ctx, clienteBloqueado: true })
    expect(d.accionDestacada?.key).toBe('ver-cartera')
  })
})
