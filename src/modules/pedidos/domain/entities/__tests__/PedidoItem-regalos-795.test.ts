import { describe, expect, it } from 'vitest'
import { Money, UnitPrice } from '@/shared/domain'
import { PedidoItem, type RegaloPedidoItem } from '../PedidoItem'
import { Pedido } from '../Pedido'
import { PedidoId } from '../../value-objects/PedidoId'
import { CanalVO } from '../../value-objects/Canal'
import { OrigenPedidoVO } from '../../value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../value-objects/EstadoPago'

const autorizacion = (): RegaloPedidoItem => ({ cantidad: 3, autorizadoPorId: 'admin-test', autorizadoEn: new Date('2026-11-18T10:00:00Z'), motivo: 'Regalo acordado' })
const item = (regalo = autorizacion()) => new PedidoItem('PACA_AGUA', 60, UnitPrice.fromDecimal(2300), 'manual', 0, regalo)
function pedido(items: PedidoItem[]) {
  return Pedido.create({ id: PedidoId.from('pedido-regalo'), numero: 1, clienteId: 'cliente-test',
    canal: CanalVO.create('DOMICILIO'), origen: OrigenPedidoVO.create('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.create('EN_RUTA'), estadoPago: EstadoPagoVO.create('PENDIENTE'),
    items, total: Money.fromDecimal(138000), totalPagado: Money.fromDecimal(0), pagos: [], fecha: new Date('2026-11-18T10:00:00Z') })
}

describe('#795 · cantidades con precio y de regalo', () => {
  it('60 con precio y 3 de regalo son 63 físicas por 138000', () => {
    const i = item()
    expect(i.cantidadFisicaPedida).toBe(63)
    expect(i.subtotalPedido.toDecimal()).toBe(138000)
    expect(i.faltanteFisico).toBe(63)
  })
  it('parcial 10 con precio y 1 regalo: 11 físicas, valor 23000; quedan 50 y 2', () => {
    const i = item(); i.entregar(10, 1)
    expect(i.cantidadFisicaEntregada).toBe(11)
    expect(i.subtotalEntregado.toDecimal()).toBe(23000)
    expect(i.subtotalPedido.toDecimal()).toBe(138000)
    expect([i.faltante, i.faltanteRegalo]).toEqual([50, 2])
  })
  it('entregar solo regalo no crea valor comercial entregado', () => {
    const i = item(); i.entregar(0, 1)
    expect(i.cantidadFisicaEntregada).toBe(1)
    expect(i.subtotalEntregado.toDecimal()).toBe(0)
  })
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])('rechaza cantidad de regalo inválida %s', cantidad => {
    expect(() => item({ ...autorizacion(), cantidad })).toThrow('CANTIDAD_REGALO_INVALIDA')
  })
  it.each([{ autorizadoPorId: '' }, { motivo: '  ' }, { autorizadoEn: new Date('invalid') }])('exige evidencia de autorización completa %s', override => {
    expect(() => item({ ...autorizacion(), ...override })).toThrow('REGALO_SIN_AUTORIZACION')
  })
  it('no conserva una referencia mutable a la fecha de autorización', () => {
    const a = autorizacion(), original = a.autorizadoEn.getTime(), i = item(a)
    a.autorizadoEn.setFullYear(2000)
    const copia = i.regalo!
    copia.autorizadoEn.setFullYear(2001)
    expect(i.regalo?.autorizadoEn.getTime()).toBe(original)
  })
  it('rechazar exceso de regalo no aplica primero la cantidad con precio', () => {
    const i = item()
    expect(() => i.entregar(10, 4)).toThrow('REGALO_ENTREGADO_SUPERA_PEDIDO')
    expect([i.cantEntrega, i.cantRegaloEntrega]).toEqual([0, 0])
  })
  it('una línea sin regalo no permite entregarlo', () => {
    const i = new PedidoItem('PACA_AGUA', 2, Money.fromDecimal(2300), 'base')
    expect(() => i.entregar(1, 1)).toThrow('REGALO_ENTREGADO_SUPERA_PEDIDO')
    expect(i.cantEntrega).toBe(0)
  })
  it('corregir precio conserva desglose y evidencia del regalo', () => {
    const i = item(); i.entregar(10, 1)
    const corregido = i.cloneWithPrecio(UnitPrice.fromDecimal(2200), 'manual')
    expect(corregido.subtotalPedido.toDecimal()).toBe(132000)
    expect(corregido.cantidadFisicaEntregada).toBe(11)
    expect(corregido.regalo).toEqual(i.regalo)
  })
  it('rechaza trasladar regalos pendientes al camino legado de pedido hijo', () => {
    const i = item()
    expect(() => i.cloneForHijo()).toThrow('REGALO_REQUIERE_ENTREGA_EN_PEDIDO_ORIGINAL')
    expect(() => pedido([i]).crearPedidoHijo(2)).toThrow('REGALO_REQUIERE_ENTREGA_EN_PEDIDO_ORIGINAL')
  })
  it('conserva el precio preciso y total de pedidos existentes sin regalos', () => {
    const i = new PedidoItem('PACA_AGUA', 63, UnitPrice.fromDecimal(2190.47619), 'manual')
    i.entregar(63)
    expect(i.subtotalPedido.toDecimal()).toBe(138000)
    expect(i.subtotalEntregado.toDecimal()).toBe(138000)
    expect([i.cantRegaloPedido, i.cantRegaloEntrega]).toEqual([0, 0])
  })
  it('completar 60 con precio no cierra el pedido mientras falten regalos', () => {
    const p = pedido([item()])
    p.entregar([{ producto: 'PACA_AGUA', cantidad: 60 }])
    expect(p.estadoEntrega.get()).toBe('PENDIENTE')
    expect(p.total.toDecimal()).toBe(138000)
    p.entregar([{ producto: 'PACA_AGUA', cantidad: 0, cantidadRegalo: 3 }], { desdeOficina: true })
    expect(p.estadoEntrega.get()).toBe('ENTREGADO')
    expect(p.total.toDecimal()).toBe(138000)
    expect(p.totalPagado.toDecimal()).toBe(0)
  })
  it('rechazar una línea posterior no muta la entrega de la anterior', () => {
    const agua = item(), hielo = new PedidoItem('PACA_HIELO', 2, Money.fromDecimal(4000), 'base')
    const p = pedido([agua, hielo])
    expect(() => p.entregar([{ producto: 'PACA_AGUA', cantidad: 1, cantidadRegalo: 1 }, { producto: 'PACA_HIELO', cantidad: 3 }])).toThrow()
    expect([agua.cantEntrega, agua.cantRegaloEntrega, hielo.cantEntrega]).toEqual([0, 0, 0])
  })
})
