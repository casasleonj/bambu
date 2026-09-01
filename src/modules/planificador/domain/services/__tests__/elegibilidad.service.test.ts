import { describe, it, expect } from 'vitest'
import { esPedidoElegible, type PedidoElegibleInput } from '../elegibilidad.service'

const FECHA = '2026-08-30'

function base(over: Partial<PedidoElegibleInput> = {}): PedidoElegibleInput {
  return {
    estadoEntrega: 'PENDIENTE',
    embarqueId: null,
    canal: 'DOMICILIO',
    origen: 'PEDIDO',
    fecha: '2026-08-29',
    clienteId: 'c1',
    direccionEntrega: null,
    negocioId: null,
    ...over,
  }
}

describe('esPedidoElegible', () => {
  it('pedido normal PENDIENTE domicilio sin embarque → elegible', () => {
    expect(esPedidoElegible(base(), FECHA)).toBe(true)
  })

  it('NO_ENTREGADO sin embarque → elegible (Ejecución lo reprogramó)', () => {
    expect(esPedidoElegible(base({ estadoEntrega: 'NO_ENTREGADO' }), FECHA)).toBe(true)
  })

  it('ya asignado a un embarque → no elegible', () => {
    expect(esPedidoElegible(base({ embarqueId: 'e1' }), FECHA)).toBe(false)
  })

  it('ENTREGADO → no elegible', () => {
    expect(esPedidoElegible(base({ estadoEntrega: 'ENTREGADO' }), FECHA)).toBe(false)
  })

  it('canal PUNTO (mostrador) → no elegible', () => {
    expect(esPedidoElegible(base({ canal: 'PUNTO' }), FECHA)).toBe(false)
  })

  // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: una venta libre con entrega posterior
  // queda PENDIENTE + embarqueId null → se planifica como cualquier pendiente.
  it('origen VENTA_LIBRE PENDIENTE sin embarque → elegible (entrega posterior)', () => {
    expect(esPedidoElegible(base({ origen: 'VENTA_LIBRE' }), FECHA)).toBe(true)
  })

  it('origen VENTA_LIBRE ya ENTREGADO → no elegible', () => {
    expect(
      esPedidoElegible(base({ origen: 'VENTA_LIBRE', estadoEntrega: 'ENTREGADO' }), FECHA),
    ).toBe(false)
  })

  it('VENTA_RAPIDA a domicilio → elegible', () => {
    expect(esPedidoElegible(base({ origen: 'VENTA_RAPIDA' }), FECHA)).toBe(true)
  })

  it('fecha futura > F → no elegible', () => {
    expect(esPedidoElegible(base({ fecha: '2026-09-05' }), FECHA)).toBe(false)
  })

  it('fecha == F → elegible', () => {
    expect(esPedidoElegible(base({ fecha: '2026-08-30T10:00:00-05:00' }), FECHA)).toBe(true)
  })

  it('CONSUMIDOR_FINAL sin dirección ni negocio → no elegible', () => {
    expect(
      esPedidoElegible(base({ clienteId: 'CONSUMIDOR_FINAL' }), FECHA),
    ).toBe(false)
  })

  it('CONSUMIDOR_FINAL con direccionEntrega → elegible', () => {
    expect(
      esPedidoElegible(
        base({ clienteId: 'CONSUMIDOR_FINAL', direccionEntrega: 'Cll 1 # 2-3' }),
        FECHA,
      ),
    ).toBe(true)
  })
})
