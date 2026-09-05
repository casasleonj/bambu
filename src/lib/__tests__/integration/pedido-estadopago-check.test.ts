// @tests G5.5 (ADR-PEDIDO-ESTADO-CANONICO-001 §2) — `chk_pedido_estadopago_proyectado`
// en Postgres real. `estadoPago` es una PROYECCIÓN forzada de
// (total, totalPagado, estadoEntrega), igual que `chk_pedido_saldo_calc`.
// Cubre cada rama de `EstadoPagoVO.proyectar()` + el override VENCIDO,
// incluyendo la corrección de NO_ENTREGADO que el borrador del ADR omitía.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente } from './setup'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

let clienteId: string

describe('chk_pedido_estadopago_proyectado — CHECK constraint en Postgres real', () => {
  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (await createTestCliente('EstadoPagoCheck')).id
  })

  afterAll(async () => { await disconnect() })

  it('rechaza PAGADO cuando la entrega aún no ocurrió (debería ser ANTICIPADO)', async () => {
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: 10_000, totalPagado: 10_000, saldo: 0,
          estadoEntrega: 'PENDIENTE', estadoPago: 'PAGADO',
        },
      }),
    ).rejects.toThrow()
  })

  it('rechaza PENDIENTE cuando hay pago parcial (debería ser PARCIAL)', async () => {
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: 10_000, totalPagado: 5_000, saldo: 5_000,
          estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE',
        },
      }),
    ).rejects.toThrow()
  })

  it('rechaza estadoPago != ANULADO cuando estadoEntrega es CANCELADO', async () => {
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: 10_000, totalPagado: 0, saldo: 10_000,
          estadoEntrega: 'CANCELADO', estadoPago: 'PENDIENTE',
        },
      }),
    ).rejects.toThrow()
  })

  it('rechaza estadoPago != ANULADO cuando estadoEntrega es ANULADO, aun con saldo pendiente', async () => {
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: 10_000, totalPagado: 3_000, saldo: 7_000,
          estadoEntrega: 'ANULADO', estadoPago: 'PARCIAL',
        },
      }),
    ).rejects.toThrow()
  })

  // Corrección respecto al borrador SQL del ADR: NO_ENTREGADO (intento de
  // entrega fallido) también cuenta como "la entrega no ocurrió" → ANTICIPADO.
  it('acepta ANTICIPADO con NO_ENTREGADO + pago completo (corrección sobre el borrador del ADR)', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO',
        total: 10_000, totalPagado: 10_000, saldo: 0,
        estadoEntrega: 'NO_ENTREGADO', estadoPago: 'ANTICIPADO',
      },
    })
    expect(pedido.estadoPago).toBe('ANTICIPADO')
  })

  it('rechaza PAGADO con NO_ENTREGADO + pago completo (debería ser ANTICIPADO)', async () => {
    await expect(
      testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: 10_000, totalPagado: 10_000, saldo: 0,
          estadoEntrega: 'NO_ENTREGADO', estadoPago: 'PAGADO',
        },
      }),
    ).rejects.toThrow()
  })

  it('el override VENCIDO se acepta sin importar total/totalPagado/estadoEntrega', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO',
        total: 10_000, totalPagado: 0, saldo: 10_000,
        estadoEntrega: 'PENDIENTE', estadoPago: 'VENCIDO',
      },
    })
    expect(pedido.estadoPago).toBe('VENCIDO')
  })

  it('acepta cada combinación válida de la tabla de proyección (EstadoPagoVO.proyectar)', async () => {
    const casos: Array<{ total: number; totalPagado: number; estadoEntrega: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO' | 'ANULADO' }> = [
      { total: 10_000, totalPagado: 0, estadoEntrega: 'PENDIENTE' },       // PENDIENTE
      { total: 10_000, totalPagado: 4_000, estadoEntrega: 'PENDIENTE' },  // PARCIAL
      { total: 10_000, totalPagado: 10_000, estadoEntrega: 'PENDIENTE' }, // ANTICIPADO
      { total: 10_000, totalPagado: 10_000, estadoEntrega: 'EN_RUTA' },   // ANTICIPADO
      { total: 10_000, totalPagado: 10_000, estadoEntrega: 'ENTREGADO' }, // PAGADO
      { total: 10_000, totalPagado: 4_000, estadoEntrega: 'ENTREGADO' },  // PARCIAL
      { total: 10_000, totalPagado: 0, estadoEntrega: 'CANCELADO' },      // ANULADO
      { total: 10_000, totalPagado: 3_000, estadoEntrega: 'ANULADO' },    // ANULADO
    ]
    for (const c of casos) {
      const estadoPago = calcularEstadoPago(c.total, c.totalPagado, c.estadoEntrega)
      const pedido = await testPrisma.pedido.create({
        data: {
          clienteId, canal: 'DOMICILIO',
          total: c.total, totalPagado: c.totalPagado, saldo: Math.max(0, c.total - c.totalPagado),
          estadoEntrega: c.estadoEntrega, estadoPago,
        },
      })
      expect(pedido.estadoPago).toBe(estadoPago)
    }
  })
})
