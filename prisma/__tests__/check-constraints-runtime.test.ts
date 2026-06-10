// @tests runtime CHECK constraints Fase 3 §1.1
// Verifica contra la DB real que las 9 CHECK constraints están aplicadas
// y rechazan inserciones inválidas.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('Fase 3 §1.1: CHECK constraints activas en la DB', () => {
  const testClienteId = '__test_chk_cliente__'
  const testPedidoId = '__test_chk_pedido__'

  beforeAll(async () => {
    // Setup: cliente dummy
    await prisma.cliente.upsert({
      where: { id: testClienteId },
      create: {
        id: testClienteId,
        nombre: 'Test CHECK',
        telefono: '0000000000',
      },
      update: {},
    })
  })

  afterAll(async () => {
    // Cleanup
    await prisma.pago.deleteMany({ where: { pedidoId: testPedidoId } })
    await prisma.pedido.deleteMany({ where: { id: testPedidoId } })
    await prisma.cliente.delete({ where: { id: testClienteId } })
    await prisma.$disconnect()
  })

  it('FIX: las 9 CHECK constraints existen en pg_constraint', async () => {
    const result = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c' AND conname LIKE 'chk_%'
      ORDER BY conname
    `
    const expected = [
      'chk_abono_monto_pos',
      'chk_factura_montopagado_le_total',
      'chk_factura_saldo_nonneg',
      'chk_factura_total_nonneg',
      'chk_pago_monto_pos',
      'chk_pedido_montopagado_le_total',
      'chk_pedido_saldo_calc',
      'chk_pedido_saldo_nonneg',
      'chk_pedido_total_nonneg',
    ]
    const actual = result.map(r => r.conname)
    for (const name of expected) {
      expect(actual).toContain(name)
    }
  })

  it('FIX: INSERT Pedido con saldo < 0 es rechazado por chk_pedido_saldo_nonneg', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pedido" (id, "clienteId", total, "totalPagado", saldo, fecha, "updatedAt")
        VALUES (${testPedidoId} || '_a', ${testClienteId}, 1000, 0, -100, NOW(), NOW())
      `,
    ).rejects.toThrow()
  })

  it('FIX: INSERT Pedido con totalPagado > total es rechazado por chk_pedido_montopagado_le_total', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pedido" (id, "clienteId", total, "totalPagado", saldo, fecha, "updatedAt")
        VALUES (${testPedidoId} || '_b', ${testClienteId}, 1000, 1500, -500, NOW(), NOW())
      `,
    ).rejects.toThrow()
  })

  it('FIX: INSERT Pedido con saldo != total - totalPagado es rechazado por chk_pedido_saldo_calc', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pedido" (id, "clienteId", total, "totalPagado", saldo, fecha, "updatedAt")
        VALUES (${testPedidoId} || '_c', ${testClienteId}, 1000, 200, 100, NOW(), NOW())
      `,
    ).rejects.toThrow()
  })

  it('FIX: INSERT Pedido con total < 0 es rechazado por chk_pedido_total_nonneg', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pedido" (id, "clienteId", total, "totalPagado", saldo, fecha, "updatedAt")
        VALUES (${testPedidoId} || '_d', ${testClienteId}, -100, 0, -100, NOW(), NOW())
      `,
    ).rejects.toThrow()
  })

  it('FIX: INSERT Pedido válido pasa (sanity check)', async () => {
    await prisma.pedido.create({
      data: {
        id: testPedidoId,
        clienteId: testClienteId,
        total: 5000,
        totalPagado: 2000,
        saldo: 3000, // = 5000 - 2000
        fecha: new Date(),
      },
    })
    const pedido = await prisma.pedido.findUnique({ where: { id: testPedidoId } })
    expect(pedido).toBeTruthy()
    expect(Number(pedido!.saldo)).toBe(3000)
  })

  it('FIX: INSERT Pago con monto = 0 es rechazado por chk_pago_monto_pos', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pago" (id, "pedidoId", metodo, monto, "createdAt")
        VALUES ('__test_pago_zero', ${testPedidoId}, 'EFECTIVO', 0, NOW())
      `,
    ).rejects.toThrow()
  })

  it('FIX: INSERT Pago con monto negativo es rechazado', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Pago" (id, "pedidoId", metodo, monto, "createdAt")
        VALUES ('__test_pago_neg', ${testPedidoId}, 'EFECTIVO', -100, NOW())
      `,
    ).rejects.toThrow()
  })
})
