// @tests G5.2 (ADR-PEDIDO-ESTADO-CANONICO-001, fase B)
// Gate de la fase B: tras el backfill, `Pedido.estado` (legacy) == `estadoEntrega`
// para toda fila. Los lectores migrados (cierre, reportes, forecast, etc.) leen
// `estadoEntrega`; si divergiera, un pedido entregado podría contarse como activo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'

describe('G5.2 — Pedido.estado == estadoEntrega (invariante de mirror)', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿seed-test?')
    clienteId = cliente.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('el backfill deja 0 divergencias estado vs estadoEntrega', async () => {
    // Crear pedidos en varios estados vía el mapper (dual-write).
    await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', total: 1000, saldo: 1000, estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO' },
    })
    await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', total: 1000, saldo: 1000, estado: 'CANCELADO', estadoEntrega: 'CANCELADO' },
    })

    const rows = await testPrisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM "Pedido" WHERE estado::text <> "estadoEntrega"::text
    `
    expect(Number(rows[0].n)).toBe(0)
  })

  it('backfill es idempotente y corrige una fila desincronizada', async () => {
    const p = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', total: 1000, saldo: 1000, estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO' },
    })
    // Simular una fila legacy: estadoEntrega quedó en el default sin sync.
    await testPrisma.$executeRaw`UPDATE "Pedido" SET "estadoEntrega" = 'PENDIENTE' WHERE id = ${p.id}`
    // Correr el backfill de la migración.
    await testPrisma.$executeRaw`
      UPDATE "Pedido" SET "estadoEntrega" = "estado"::text::"EstadoEntrega"
      WHERE "estadoEntrega"::text <> "estado"::text
    `
    const fixed = await testPrisma.pedido.findUnique({ where: { id: p.id }, select: { estadoEntrega: true } })
    expect(fixed?.estadoEntrega).toBe('ENTREGADO')
  })

  it('existe el índice compuesto Pedido_estadoEntrega_fecha_idx', async () => {
    const rows = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Pedido' AND indexname = 'Pedido_estadoEntrega_fecha_idx'
    `
    expect(rows).toHaveLength(1)
  })
})
