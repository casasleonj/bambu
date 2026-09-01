// @tests G1 — idempotencia de Abono (garantía de DB)
//
// Hallazgo (docs/pedidos/INVENTARIO_PEDIDOS_OPERACION_COMERCIAL.md §G1):
// POST /api/abonos no deduplicaba → doble submit / retry = doble abono
// (dinero cobrado registrado dos veces).
//
// FIX: `Abono.offlineId @unique` + dedup dentro del lock CARTERA.
// Verificamos la garantía de DB (mismo enfoque que cierre-idempotencia):
//   1. Dos abonos con el mismo offlineId → el 2º falla con P2002.
//   2. Múltiples abonos con offlineId NULL conviven (pagar-fiado FIFO
//      multi-factura y abonos históricos quedan NULL).
//   3. La unique constraint existe a nivel de índice.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'

describe('G1 — Abono.offlineId (idempotencia)', () => {
  let clienteId: string
  let facturaId: string

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')
    clienteId = cliente.id

    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        estadoEntrega: 'ENTREGADO',
        estado: 'ENTREGADO',
        total: 30000,
        totalPagado: 0,
        saldo: 30000,
      },
    })
    const factura = await testPrisma.factura.create({
      data: {
        numero: `FAC-TEST-${Date.now()}`,
        clienteId,
        pedidoId: pedido.id,
        fecha: new Date(),
        subtotal: 30000,
        total: 30000,
        saldo: 30000,
        montoPagado: 0,
      },
    })
    facturaId = factura.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dos abonos con el mismo offlineId: el 2º falla con unique constraint (P2002)', async () => {
    const offlineId = `abono-dedup-${Date.now()}`

    await testPrisma.abono.create({
      data: {
        numero: `ABO-T1-${Date.now()}`,
        facturaId,
        clienteId,
        monto: 5000,
        metodoPago: 'EFECTIVO',
        offlineId,
      },
    })

    await expect(
      testPrisma.abono.create({
        data: {
          numero: `ABO-T2-${Date.now()}`,
          facturaId,
          clienteId,
          monto: 5000,
          metodoPago: 'EFECTIVO',
          offlineId,
        },
      }),
    ).rejects.toThrow(/Unique constraint failed|P2002/)
  })

  it('múltiples abonos con offlineId NULL conviven (compat pagar-fiado / históricos)', async () => {
    const mk = (n: number) =>
      testPrisma.abono.create({
        data: {
          numero: `ABO-NULL-${Date.now()}-${n}`,
          facturaId,
          clienteId,
          monto: 1000,
          metodoPago: 'EFECTIVO',
          // offlineId omitido → NULL
        },
      })

    await expect(Promise.all([mk(1), mk(2), mk(3)])).resolves.toHaveLength(3)
  })

  it('offlineId "" (string vacío) normalizado a NULL por el route no colisiona', async () => {
    // El route usa `offlineId || null` (no `?? null`): un "" — válido para
    // z.string().optional() — se persiste como NULL y no entra al índice UNIQUE.
    const norm = (v: string) => v || null
    await expect(
      Promise.all([
        testPrisma.abono.create({ data: { numero: `ABO-E1-${Date.now()}`, facturaId, clienteId, monto: 1000, metodoPago: 'EFECTIVO', offlineId: norm('') } }),
        testPrisma.abono.create({ data: { numero: `ABO-E2-${Date.now()}`, facturaId, clienteId, monto: 1000, metodoPago: 'EFECTIVO', offlineId: norm('') } }),
      ]),
    ).resolves.toHaveLength(2)
  })

  it('existe el índice UNIQUE Abono_offlineId_key', async () => {
    const rows = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Abono' AND indexname = 'Abono_offlineId_key'
    `
    expect(rows).toHaveLength(1)
  })
})
