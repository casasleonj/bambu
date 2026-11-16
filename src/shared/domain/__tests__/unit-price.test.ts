import { describe, expect, it } from 'vitest'
import { UnitPrice, importeLineaCentavos, sumarPreciosUnitarios } from '../unit-price'
import { Money } from '../value-objects'
import { PedidoItem } from '@/modules/pedidos/domain/entities/PedidoItem'
import { resolverPreciosPedido } from '@/modules/pedidos/domain/services/pricing-algorithm.service'
import { PedidoItemSchema } from '@/lib/validators'
import { calcularCorreccion } from '@/modules/pedidos/domain/services/correccion-precio.service'
import { calcularReduccion } from '@/modules/pedidos/domain/services/reduccion-comercial.service'
import { valorEntregadoPedidoCentavos } from '@/lib/valor-entregado-pedido'
import { calcularExigibleVigente } from '@/lib/entregas-exigibles'

describe('#795 precio preciso, importe monetario y consumidores', () => {
  it('conserva el precio escrito y redondea después de multiplicar las 63 unidades', () => {
    const precio = UnitPrice.fromDecimal('2190.47619')
    expect(precio.toDecimal()).toBe(2190.47619)
    expect(JSON.stringify({ precio })).toBe('{"precio":2190.47619}')
    expect(precio.total(63).toDecimal()).toBe(138000)
    expect(UnitPrice.fromDecimal('2190.48').total(63).toDecimal()).toBe(138000.24)
  })

  it('pricing y entidad coinciden sin perder precisión al crear o releer una línea', () => {
    const [r] = resolverPreciosPedido({ items: [{ codigo: 'PACA_AGUA', cantidad: 63, precioManual: 2190.47619 }],
      canal: 'DOMICILIO', clienteOverrides: null, tiersByCode: {}, productosByCode: {} })
    const item = new PedidoItem(r.producto, r.cantidad, UnitPrice.fromDecimal(r.precio), r.origen)
    expect(r.subtotal).toBe(138000)
    expect(item.subtotalPedido.toDecimal()).toBe(r.subtotal)
    item.entregar(21)
    expect(item.subtotalEntregado.toDecimal()).toBe(46000)
    expect(item.cloneWithPrecio(item.precio, 'manual').precio.toDecimal()).toBe(2190.47619)
  })

  it('precios históricos de dos decimales conservan su importe y constructor compatible', () => {
    const item = new PedidoItem('PACA_AGUA', 3, Money.fromDecimal(2300.25), 'base')
    expect(item.subtotalPedido.toDecimal()).toBe(6900.75)
  })

  it('la suma de un precio base y su recargo no introduce decimales binarios espurios', () => {
    expect(sumarPreciosUnitarios(0.1, 0.2)).toBe(0.3)
    const [linea] = resolverPreciosPedido({items:[{codigo:'PACA_AGUA',cantidad:3}],canal:'DOMICILIO',
      clienteOverrides:null,tiersByCode:{},productosByCode:{PACA_AGUA:{precioBase:0.1,sobreCostoDomicilio:0.2,aplicaDomicilio:true}}})
    expect(linea.subtotal).toBe(0.9)
  })

  it('63 entregas unitarias por delta del acumulado suman el importe de la línea', () => {
    let totalCents = 0
    for (let n = 1; n <= 63; n++) {
      totalCents += importeLineaCentavos(2190.47619, n) - importeLineaCentavos(2190.47619, n - 1)
    }
    expect(totalCents).toBe(13_800_000)
  })

  it('rechaza decimales que no se pueden conservar, negativos, no finitos y excesos de rango', () => {
    for (const price of [-1, Number.NaN, Number.POSITIVE_INFINITY, 100000000, 2190.4761904]) {
      expect(() => UnitPrice.fromDecimal(price)).toThrow('PRECIO_INVALIDO')
      expect(PedidoItemSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 63, precioManual: price }).success).toBe(false)
    }
    expect(PedidoItemSchema.safeParse({ producto: 'PACA_AGUA', cantidad: 63, precioManual: 2190.47619 }).success).toBe(true)
    expect(UnitPrice.fromDecimal('99999999.999999').toDecimal()).toBe(99999999.999999)
  })

  it('no trunca ni interpreta formatos ambiguos de precio de API como miles', () => {
    expect(UnitPrice.fromDecimal('2190.476').toDecimal()).toBe(2190.476)
    for (const value of ['', '2.190,47619', '1e3', '2190.4761904']) expect(() => UnitPrice.fromDecimal(value)).toThrow()
  })

  it('rechaza cantidades fraccionadas o con importe fuera del rango seguro', () => {
    const price = UnitPrice.fromDecimal(2190.47619)
    for (const qty of [-1, 0.5, Number.NaN]) expect(() => price.total(qty)).toThrow('CANTIDAD_INVALIDA')
    expect(() => UnitPrice.fromDecimal(99999999).total(Number.MAX_SAFE_INTEGER)).toThrow('IMPORTE_FUERA_DE_RANGO')
  })

  it('corrección detecta una diferencia inferior al centavo por unidad y cuadra el nuevo total', () => {
    const r = calcularCorreccion({ total: 138000.24, totalPagado: 0, cantidad: 63, precioAnterior: 2190.48, precioNuevo: 2190.47619 })
    expect(r.delta).toBe(-0.24)
    expect(r.totalNuevo).toBe(138000)
  })

  it('reducciones sucesivas conservan el importe remanente sin residuos', () => {
    let cantidad = 63, total = 138000
    for (let n = 0; n < 62; n++) {
      const r = calcularReduccion({ total, totalPagado: 0, cantPedido: cantidad, cantEntrega: 0,
        precio: 2190.47619, cantidadReducida: 1, unidadesOtrasLineas: 0 })
      cantidad = r.cantPedidoNueva; total = r.totalNuevo
      expect(Math.round(total * 100)).toBe(importeLineaCentavos(2190.47619, cantidad))
    }
  })

  it('valor entregado y deuda exigible usan precio preciso, incluso con pagos previos', () => {
    const pedido = { total: 138000, totalPagado: 10000, saldo: 128000, estadoEntrega: 'PENDIENTE',
      items: [{ producto: 'PACA_AGUA', cantEntrega: 21, precio: 2190.47619 }],
      entregasExigibles: [{ valorEntregado: 46000, lineas: [{ producto: 'PACA_AGUA', cantidad: 21 }] }] }
    expect(valorEntregadoPedidoCentavos(pedido)).toBe(4_600_000)
    expect(calcularExigibleVigente(pedido)).toBe(36000)
    expect(valorEntregadoPedidoCentavos({ ...pedido, estadoEntrega: 'ANULADO' })).toBe(0)
  })
})
