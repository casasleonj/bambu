import { describe, it, expect } from 'vitest'
import {
  buildVentasPorPrecio,
  calcularVendidos,
  calcularVentas,
} from '@/modules/dashboard/domain/ventas.service'
import type { PedidoRaw } from '@/modules/dashboard/domain/types'

describe('buildVentasPorPrecio', () => {
  it('conserva centavos al sumar pedidos y líneas del mismo producto/precio/canal', () => {
    const p: PedidoRaw = {
      id: 'decimal',
      numero: 1,
      fecha: new Date(),
      total: 0.1,
      saldo: 0,
      estadoEntrega: 'ENTREGADO',
      estadoPago: 'PAGADO',
      canal: 'PUNTO',
      cPacaAguaEnt: 1,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      items: [{ producto: 'PACA_AGUA', cantEntrega: 1, precio: 0.1 }],
    }
    expect(calcularVentas([p, { ...p, id: 'dos', total: 0.2 }])).toBe(0.3)
    expect(buildVentasPorPrecio([p, p, p])[0].subtotal).toBe(0.3)
  })
  it('usa códigos de producto (PACA_AGUA), no labels bonitos (Paca Agua)', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'p1',
        numero: 1,
        fecha: new Date(),
        total: 100,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        cPacaAguaEnt: 0,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [{ producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(1)
    expect(result[0].producto).toBe('PACA_AGUA')
    expect(result[0].cantidad).toBe(2)
    expect(result[0].precio).toBe(6500)
    expect(result[0].subtotal).toBe(13000)
  })

  it('agrupa por producto + precio', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'p1',
        numero: 1,
        fecha: new Date(),
        total: 100,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        cPacaAguaEnt: 0,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [
          { producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 },
          { producto: 'PACA_AGUA', cantEntrega: 1, precio: 6500 },
          { producto: 'PACA_AGUA', cantEntrega: 3, precio: 6000 },
        ],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(2)
    const bucket6500 = result.find((r) => r.precio === 6500)
    const bucket6000 = result.find((r) => r.precio === 6000)
    expect(bucket6500?.cantidad).toBe(3)
    expect(bucket6500?.subtotal).toBe(19500)
    expect(bucket6000?.cantidad).toBe(3)
    expect(bucket6000?.subtotal).toBe(18000)
  })

  it('ordena por subtotal descendente', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'p1',
        numero: 1,
        fecha: new Date(),
        total: 100,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        cPacaAguaEnt: 0,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [
          { producto: 'PACA_HIELO', cantEntrega: 1, precio: 8000 }, // subtotal 8000
          { producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }, // subtotal 13000
        ],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result[0].producto).toBe('PACA_AGUA')
    expect(result[1].producto).toBe('PACA_HIELO')
  })

  it('ignora pedidos que no están ENTREGADO y no entregaron nada', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'p1',
        numero: 1,
        fecha: new Date(),
        total: 100,
        saldo: 0,
        estadoEntrega: 'PENDIENTE',
        estadoPago: 'PENDIENTE',
        cPacaAguaEnt: 0,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [{ producto: 'PACA_AGUA', cantEntrega: 0, precio: 6500 }],
      },
    ]

    expect(buildVentasPorPrecio(pedidos)).toHaveLength(0)
  })

  it('cuenta la entrega parcial (pedido sin ENTREGADO con cantEntrega > 0) por lo realmente entregado', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'parcial',
        numero: 693,
        fecha: new Date(),
        total: 65000,
        saldo: 0,
        estadoEntrega: 'EN_RUTA',
        estadoPago: 'PAGADO',
        canal: 'DOMICILIO',
        cPacaAguaEnt: 6,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [{ producto: 'PACA_AGUA', cantEntrega: 6, precio: 6500 }],
      },
      {
        id: 'completo',
        numero: 694,
        fecha: new Date(),
        total: 13000,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        canal: 'DOMICILIO',
        cPacaAguaEnt: 2,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [{ producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(1)
    expect(result[0].cantidad).toBe(8)
    expect(result[0].subtotal).toBe(52000)
  })

  it('no cuenta parciales anulados o cancelados', () => {
    const base = {
      numero: 1,
      fecha: new Date(),
      total: 100,
      saldo: 0,
      estadoPago: 'PENDIENTE',
      cPacaAguaEnt: 2,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
      items: [{ producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }],
    }
    expect(
      buildVentasPorPrecio([
        { ...base, id: 'a', estadoEntrega: 'ANULADO' },
        { ...base, id: 'c', estadoEntrega: 'CANCELADO' },
      ]),
    ).toHaveLength(0)
  })

  it('separa mismo producto + precio en filas distintas por canal', () => {
    const base = {
      numero: 1,
      fecha: new Date(),
      total: 100,
      saldo: 0,
      estadoEntrega: 'ENTREGADO',
      estadoPago: 'PAGADO',
      cPacaAguaEnt: 0,
      cPacaHieloEnt: 0,
      cBotellonFabEnt: 0,
      cBotellonDomEnt: 0,
    }
    const pedidos: PedidoRaw[] = [
      {
        ...base,
        id: 'p1',
        canal: 'DOMICILIO',
        items: [{ producto: 'PACA_AGUA', cantEntrega: 12, precio: 6500 }],
      },
      {
        ...base,
        id: 'p2',
        canal: 'PUNTO',
        items: [{ producto: 'PACA_AGUA', cantEntrega: 5, precio: 6500 }],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(2)
    const dom = result.find((r) => r.canal === 'DOMICILIO')
    const punto = result.find((r) => r.canal === 'PUNTO')
    expect(dom?.cantidad).toBe(12)
    expect(dom?.subtotal).toBe(78000)
    expect(punto?.cantidad).toBe(5)
    expect(punto?.subtotal).toBe(32500)
  })

  it('canal ausente o desconocido se trata como DOMICILIO', () => {
    const pedidos: PedidoRaw[] = [
      {
        id: 'p1',
        numero: 1,
        fecha: new Date(),
        total: 100,
        saldo: 0,
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        canal: null,
        cPacaAguaEnt: 0,
        cPacaHieloEnt: 0,
        cBotellonFabEnt: 0,
        cBotellonDomEnt: 0,
        items: [{ producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(1)
    expect(result[0].canal).toBe('DOMICILIO')
  })
})

describe('calcularVentas (#470)', () => {
  const base = {
    numero: 1,
    fecha: new Date(),
    saldo: 0,
    estadoPago: 'PENDIENTE',
    cPacaAguaEnt: 0,
    cPacaHieloEnt: 0,
    cBotellonFabEnt: 0,
    cBotellonDomEnt: 0,
  }

  it('solo suma pedidos ENTREGADOS: pendientes, en ruta, anulados y cancelados no cuentan', () => {
    const pedidos: PedidoRaw[] = [
      { ...base, id: 'a', total: 40000, estadoEntrega: 'ENTREGADO' },
      { ...base, id: 'b', total: 100000, estadoEntrega: 'PENDIENTE' },
      { ...base, id: 'c', total: 20000, estadoEntrega: 'EN_RUTA' },
      { ...base, id: 'd', total: 50000, estadoEntrega: 'ANULADO' },
      { ...base, id: 'e', total: 10000, estadoEntrega: 'CANCELADO' },
    ]

    expect(calcularVentas(pedidos)).toBe(40000)
  })

  it('suma el valor entregado de una entrega parcial (cantEntrega × precio), no el total', () => {
    const pedidos: PedidoRaw[] = [
      { ...base, id: 'a', total: 40000, estadoEntrega: 'ENTREGADO' },
      {
        ...base,
        id: 'parcial',
        total: 65000,
        estadoEntrega: 'EN_RUTA',
        items: [{ producto: 'PACA_AGUA', cantEntrega: 6, precio: 6500 }],
      },
      {
        ...base,
        id: 'anulado-con-entrega',
        total: 9999,
        estadoEntrega: 'ANULADO',
        items: [{ producto: 'PACA_AGUA', cantEntrega: 1, precio: 6500 }],
      },
    ]

    expect(calcularVentas(pedidos)).toBe(79000)
  })
})

describe('calcularVendidos con entrega parcial', () => {
  const base = {
    numero: 1,
    fecha: new Date(),
    total: 0,
    saldo: 0,
    estadoPago: 'PENDIENTE',
    cPacaHieloEnt: 0,
    cBotellonFabEnt: 0,
    cBotellonDomEnt: 0,
  }

  it('incluye unidades de pedidos parciales y excluye anulados', () => {
    const pedidos: PedidoRaw[] = [
      { ...base, id: 'a', estadoEntrega: 'ENTREGADO', cPacaAguaEnt: 2 },
      { ...base, id: 'b', estadoEntrega: 'EN_RUTA', cPacaAguaEnt: 6 },
      { ...base, id: 'c', estadoEntrega: 'PENDIENTE', cPacaAguaEnt: 0 },
      { ...base, id: 'd', estadoEntrega: 'ANULADO', cPacaAguaEnt: 3 },
    ]

    expect(calcularVendidos(pedidos).agua).toBe(8)
  })
})
