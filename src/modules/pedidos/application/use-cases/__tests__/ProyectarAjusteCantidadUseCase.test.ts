import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    pedido: { findUnique: vi.fn() },
    pedidoItem: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  ProyectarAjusteCantidadUseCase,
  ProyectarAjusteCantidadError,
} from '../ProyectarAjusteCantidadUseCase'

const uc = () => new ProyectarAjusteCantidadUseCase()

beforeEach(() => {
  vi.clearAllMocks()
  // Pedido PENDIENTE, $20.000 total, $5.000 pagado, 1 item de 10 × $2.000.
  mockPrisma.pedido.findUnique.mockResolvedValue({
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'ANTICIPADO',
    total: 20000,
    totalPagado: 5000,
    saldo: 15000,
  })
  mockPrisma.pedidoItem.findFirst.mockResolvedValue({
    cantPedido: 10,
    cantEntrega: 0,
    precio: 2000,
    subtotal: 20000,
  })
})

describe('ProyectarAjusteCantidadUseCase — corrección válida', () => {
  it('subir cantidad: total y saldo suben, precio histórico intacto', async () => {
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 12 })
    expect(r.delta).toBe(2)
    expect(r.precioHistorico).toBe(2000)
    expect(r.subtotalAntes).toBe(20000)
    expect(r.subtotalDespues).toBe(24000)
    expect(r.totalAntes).toBe(20000)
    expect(r.totalDespues).toBe(24000)
    expect(r.saldoDespues).toBe(19000)
    expect(r.bloqueadoPor).toBeNull()
    expect(r.puedeCorregir).toBe(true)
    expect(r.allowedActions).toEqual(['confirmar-correccion'])
    expect(r.sobrepagoProyectado).toBe(0)
  })

  it('bajar cantidad sin sobrepago: total baja, sigue permitido', async () => {
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 8 })
    expect(r.delta).toBe(-2)
    expect(r.totalDespues).toBe(16000)
    expect(r.saldoDespues).toBe(11000)
    expect(r.bloqueadoPor).toBeNull()
    expect(r.puedeCorregir).toBe(true)
  })

  it('estadoPagoDespues se recalcula (baja a monto ya cubierto → PAGADO no, PENDIENTE)', async () => {
    // total 20000 → 5000 (cantidadNueva 2.5 no válida; usar 3 → 6000), pagado 5000 → saldo 1000
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 3 })
    expect(r.totalDespues).toBe(6000)
    expect(r.saldoDespues).toBe(1000)
    expect(r.estadoPagoAntes).toBe('ANTICIPADO')
    expect(typeof r.estadoPagoDespues).toBe('string')
  })

  it('delta 0 → warning SIN_CAMBIO, no puede corregir', async () => {
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 10 })
    expect(r.delta).toBe(0)
    expect(r.warnings.some((w) => w.code === 'SIN_CAMBIO')).toBe(true)
    expect(r.puedeCorregir).toBe(false)
    expect(r.allowedActions).toEqual([])
  })
})

describe('ProyectarAjusteCantidadUseCase — guards (calculados en el servidor)', () => {
  it('pedido cerrado → CORRECCION_PEDIDO_CERRADO + ir-a-cartera', async () => {
    mockPrisma.pedido.findUnique.mockResolvedValue({
      estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', total: 20000, totalPagado: 20000, saldo: 0,
    })
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 12 })
    expect(r.bloqueadoPor).toBe('CORRECCION_PEDIDO_CERRADO')
    expect(r.puedeCorregir).toBe(false)
    expect(r.allowedActions).toEqual(['ir-a-cartera'])
  })

  it('cantidad ya entregada → CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA + ir-a-nueva-demanda', async () => {
    mockPrisma.pedidoItem.findFirst.mockResolvedValue({ cantPedido: 10, cantEntrega: 4, precio: 2000, subtotal: 20000 })
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 12 })
    expect(r.bloqueadoPor).toBe('CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA')
    expect(r.cantidadEntregada).toBe(4)
    expect(r.allowedActions).toEqual(['ir-a-nueva-demanda'])
  })

  it('bajar cantidad generaría sobrepago → CORRECCION_GENERARIA_SOBREPAGO + ir-a-cartera', async () => {
    // pagado 5000; bajar a 2 unidades → total 4000 < 5000 pagado
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 2 })
    expect(r.bloqueadoPor).toBe('CORRECCION_GENERARIA_SOBREPAGO')
    expect(r.totalDespues).toBe(4000)
    expect(r.sobrepagoProyectado).toBe(1000)
    expect(r.allowedActions).toEqual(['ir-a-cartera'])
  })

  it('prioridad de guards: pedido cerrado gana sobre cantidad entregada', async () => {
    mockPrisma.pedido.findUnique.mockResolvedValue({
      estadoEntrega: 'ANULADO', estadoPago: 'PAGADO', total: 20000, totalPagado: 0, saldo: 20000,
    })
    mockPrisma.pedidoItem.findFirst.mockResolvedValue({ cantPedido: 10, cantEntrega: 4, precio: 2000, subtotal: 20000 })
    const r = await uc().execute({ pedidoId: 'p1', producto: 'PACA_AGUA', cantidadNueva: 12 })
    expect(r.bloqueadoPor).toBe('CORRECCION_PEDIDO_CERRADO')
  })
})

describe('ProyectarAjusteCantidadUseCase — errores', () => {
  it('pedido inexistente → PEDIDO_NOT_FOUND', async () => {
    mockPrisma.pedido.findUnique.mockResolvedValue(null)
    await expect(uc().execute({ pedidoId: 'x', producto: 'PACA_AGUA', cantidadNueva: 5 }))
      .rejects.toThrow(ProyectarAjusteCantidadError)
  })

  it('producto sin item → PEDIDO_ITEM_NOT_FOUND', async () => {
    mockPrisma.pedidoItem.findFirst.mockResolvedValue(null)
    await expect(uc().execute({ pedidoId: 'p1', producto: 'BOLSA_HIELO', cantidadNueva: 5 }))
      .rejects.toThrow(/PEDIDO_ITEM_NOT_FOUND/)
  })

  it('no invoca ninguna API de escritura de prisma', () => {
    // El mock solo expone lecturas (findUnique/findFirst). Si el use case
    // intentara update/create, el test explotaría con "is not a function".
    expect(Object.keys(mockPrisma.pedido)).toEqual(['findUnique'])
    expect(Object.keys(mockPrisma.pedidoItem)).toEqual(['findFirst'])
  })
})
