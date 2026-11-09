// @tests #311 — aritmética de la disponibilidad física con un cliente simulado (las consultas reales, en la prueba de integración).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { calcularDisponibilidadFisica, type ClienteDisponibilidad } from '../disponibilidad-fisica.service'

afterEach(() => vi.unstubAllEnvs())

function cliente(o: {
  estado?: string
  cargas?: Array<{ producto: string; cantidad: number }>
  movimientos?: Array<{ tipo: string; producto: string; cantidad: number; origen?: string | null; metadata?: unknown }>
  atribuidos?: number
  pedidos?: Array<{ id: string; origen: string; estadoEntrega: string; items: Array<{ producto: string; cantPedido: number; cantEntrega: number }> }>
}): ClienteDisponibilidad {
  return {
    embarque: { findUnique: async () => ({ id: 'e1', estado: o.estado ?? 'EN_RUTA', createdAt: new Date('2026-11-01T00:00:00Z') }) },
    embarqueCargaProducto: { findMany: async () => o.cargas ?? [] },
    embarqueMovimiento: {
      findMany: async () => (o.movimientos ?? []).map((m) => ({ origen: 'VEHICULO', metadata: null, ...m })),
      count: async () => o.atribuidos ?? 0,
    },
    pedido: { findMany: async () => o.pedidos ?? [] },
  }
}

describe('calcularDisponibilidadFisica (aritmética)', () => {
  it('60 cargadas, 25 comprometidas y un cambio de 3: custodia 57, libre 32', async () => {
    const d = await calcularDisponibilidadFisica(cliente({
      cargas: [{ producto: 'PACA_AGUA', cantidad: 60 }],
      movimientos: [{ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 3 }],
      pedidos: [{ id: 'p1', origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', items: [{ producto: 'PACA_AGUA', cantPedido: 25, cantEntrega: 0 }] }],
    }), 'e1')
    expect(d.custodia.PACA_AGUA).toBe(57)
    expect(d.comprometido.PACA_AGUA).toBe(25)
    expect(d.disponible.PACA_AGUA).toBe(32)
  })

  it('suma varias cargas y recargas del mismo producto', async () => {
    const d = await calcularDisponibilidadFisica(cliente({ cargas: [{ producto: 'PACA_HIELO', cantidad: 20 }, { producto: 'PACA_HIELO', cantidad: 10 }] }), 'e1')
    expect(d.custodia.PACA_HIELO).toBe(30)
  })

  it('un producto desconocido en el ledger se ignora sin romper', async () => {
    const d = await calcularDisponibilidadFisica(cliente({ cargas: [{ producto: 'PACA_AGUA', cantidad: 5 }], movimientos: [{ tipo: 'ENTREGA', producto: 'OTRO', cantidad: 9 }] }), 'e1')
    expect(d.custodia.PACA_AGUA).toBe(5)
  })

  it('la entrega viva atribuida (hay eventos) no vuelve a leer las entregas de los pedidos', async () => {
    const d = await calcularDisponibilidadFisica(cliente({
      cargas: [{ producto: 'PACA_AGUA', cantidad: 60 }],
      atribuidos: 1,
      movimientos: [{ tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 10, metadata: { captura: 'ENTREGA_PEDIDO', pedidoId: 'p1' } }],
      pedidos: [{ id: 'p1', origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', items: [{ producto: 'PACA_AGUA', cantPedido: 25, cantEntrega: 10 }] }],
    }), 'e1')
    expect(d.modo).toBe('VIVO')
    expect(d.custodia.PACA_AGUA).toBe(50)
    expect(d.comprometido.PACA_AGUA).toBe(15)
  })

  it('un embarque inexistente lanza el error claro', async () => {
    const vacio = { ...cliente({}), embarque: { findUnique: async () => null } }
    await expect(calcularDisponibilidadFisica(vacio, 'x')).rejects.toMatchObject({ code: 'EMBARQUE_NO_ENCONTRADO' })
  })
})
