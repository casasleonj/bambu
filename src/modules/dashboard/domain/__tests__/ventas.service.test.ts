import { describe, it, expect } from 'vitest'
import { buildVentasPorPrecio } from '@/modules/dashboard/domain/ventas.service'
import type { PedidoRaw } from '@/modules/dashboard/domain/types'

describe('buildVentasPorPrecio', () => {
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
    const bucket6500 = result.find(r => r.precio === 6500)
    const bucket6000 = result.find(r => r.precio === 6000)
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

  it('ignora pedidos que no están ENTREGADO', () => {
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
        items: [{ producto: 'PACA_AGUA', cantEntrega: 2, precio: 6500 }],
      },
    ]

    const result = buildVentasPorPrecio(pedidos)

    expect(result).toHaveLength(0)
  })
})
