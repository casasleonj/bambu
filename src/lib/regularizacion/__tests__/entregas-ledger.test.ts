import { describe, expect, it } from 'vitest'
import {
  offlineIdRegularizacion,
  planificarEntrega,
  validarLedger,
  type EntradaLedgerEntrega,
  type PedidoParaRegularizar,
} from '../entregas-ledger'

const creado = new Date('2026-09-12T16:08:48.603Z')

function pedido(over: Partial<PedidoParaRegularizar> = {}): PedidoParaRegularizar {
  return {
    id: 'p1',
    numero: 179,
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'PENDIENTE',
    total: 25000,
    totalPagado: 0,
    embarqueId: null,
    entregaOfflineId: null,
    createdAt: creado,
    items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0 }],
    ...over,
  }
}

const efectivo: EntradaLedgerEntrega = { pedidoId: 'p1', numero: 179, total: 25000, pago: 'EFECTIVO_TOTAL' }
const yaPagado: EntradaLedgerEntrega = { pedidoId: 'p1', numero: 179, total: 25000, pago: 'YA_PAGADO' }

describe('planificarEntrega', () => {
  it('EFECTIVO_TOTAL: entrega todo con fecha de creación y un pago efectivo por el total', () => {
    const r = planificarEntrega(efectivo, pedido())
    expect(r).toEqual({
      tipo: 'PLAN',
      plan: {
        pedidoId: 'p1',
        offlineId: offlineIdRegularizacion('p1'),
        entregadoAt: creado.toISOString(),
        itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 25000 }],
      },
    })
  })

  it('YA_PAGADO: no crea pagos', () => {
    const r = planificarEntrega(yaPagado, pedido({ estadoPago: 'ANTICIPADO', totalPagado: 25000 }))
    expect(r.tipo).toBe('PLAN')
    if (r.tipo === 'PLAN') expect(r.plan.pagos).toEqual([])
  })

  it('YA_PAGADO con saldo pendiente es conflicto (no inventa pagos)', () => {
    expect(planificarEntrega(yaPagado, pedido({ totalPagado: 10000 })).tipo).toBe('CONFLICTO')
  })

  it('EFECTIVO_TOTAL con pago previo parcial es conflicto (no completa saldos)', () => {
    expect(planificarEntrega(efectivo, pedido({ totalPagado: 5000 })).tipo).toBe('CONFLICTO')
  })

  it('reejecución: entregado con el mismo offlineId → YA_REGULARIZADO', () => {
    const r = planificarEntrega(
      efectivo,
      pedido({ estadoEntrega: 'ENTREGADO', entregaOfflineId: offlineIdRegularizacion('p1') }),
    )
    expect(r.tipo).toBe('YA_REGULARIZADO')
  })

  it('EN_RUTA sin embarque (corrida previa cortada) se retoma', () => {
    expect(planificarEntrega(efectivo, pedido({ estadoEntrega: 'EN_RUTA' })).tipo).toBe('PLAN')
  })

  it('EN_RUTA en un embarque real es conflicto', () => {
    expect(planificarEntrega(efectivo, pedido({ estadoEntrega: 'EN_RUTA', embarqueId: 'e1' })).tipo).toBe('CONFLICTO')
  })

  it('entregado por otro camino → conflicto', () => {
    expect(planificarEntrega(efectivo, pedido({ estadoEntrega: 'ENTREGADO' })).tipo).toBe('CONFLICTO')
  })

  it.each([
    ['no encontrado', null],
    ['anulado', pedido({ estadoEntrega: 'ANULADO' })],
    ['total distinto', pedido({ total: 30000 })],
    ['numero distinto', pedido({ numero: 999 })],
    ['en embarque', pedido({ embarqueId: 'e1' })],
    ['entrega parcial previa', pedido({ items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 3 }] })],
    ['producto desconocido', pedido({ items: [{ producto: 'OTRO', cantPedido: 1, cantEntrega: 0 }] })],
  ])('conflicto: %s', (_n, p) => {
    expect(planificarEntrega(efectivo, p).tipo).toBe('CONFLICTO')
  })
})

describe('validarLedger', () => {
  it('acepta entradas válidas', () => {
    expect(validarLedger([efectivo])).toEqual([efectivo])
  })

  it.each([
    ['vacío', []],
    ['no array', {}],
    ['pago inválido', [{ ...efectivo, pago: 'NEQUI' }]],
    ['total 0', [{ ...efectivo, total: 0 }]],
    ['sin pedidoId', [{ ...efectivo, pedidoId: '' }]],
    ['duplicado', [efectivo, efectivo]],
  ])('rechaza ledger %s', (_n, l) => {
    expect(() => validarLedger(l)).toThrow()
  })
})
