// @tests FASE 5 — ReceivableEntry (proyección de auditoría en DB)
// ADR-MONETARIO-001, contrato §12: la proyección se genera en la MISMA tx del
// Pago/Abono y `saldoResultante` refleja el saldo canónico del pedido. Nunca es
// un ledger competidor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { registrarReceivableEntry, detectarDivergencia } from '@/lib/receivable-entry'

describe('FASE 5 — ReceivableEntry (proyección de auditoría)', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')
    clienteId = cliente.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('registra la proyección con saldoResultante = saldo canónico del pedido', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        total: 20000,
        totalPagado: 5000,
        saldo: 15000,
        estadoPago: 'PARCIAL',
      },
    })

    await testPrisma.$transaction(async (tx) => {
      await registrarReceivableEntry(tx, {
        pedidoId: pedido.id,
        clienteId,
        tipo: 'PAGO',
        monto: 5000,
        saldoResultante: 15000,
        totalPagadoResultante: 5000,
      })
    })

    const entry = await testPrisma.receivableEntry.findFirst({
      where: { pedidoId: pedido.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(entry).not.toBeNull()
    expect(Number(entry!.saldoResultante)).toBe(15000)
    expect(Number(entry!.totalPagadoResultante)).toBe(5000)

    // Proyección == canónico → sin divergencia.
    const canonico = Number(
      (await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))!.saldo,
    )
    const d = detectarDivergencia(canonico, Number(entry!.saldoResultante))
    expect(d.divergencia).toBe(false)
  })

  it('detecta divergencia si el canónico se desvía de la proyección', async () => {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        total: 10000,
        totalPagado: 0,
        saldo: 10000,
      },
    })

    await testPrisma.$transaction(async (tx) => {
      await registrarReceivableEntry(tx, {
        pedidoId: pedido.id,
        clienteId,
        tipo: 'PAGO',
        monto: 0,
        saldoResultante: 10000,
        totalPagadoResultante: 0,
      })
    })

    // Simular un desvío del canónico (sin actualizar la proyección). Se ajusta
    // totalPagado de forma consistente con chk_pedido_saldo_calc (saldo = total
    // - totalPagado): saldo pasa de 10000 a 9500.
    await testPrisma.pedido.update({
      where: { id: pedido.id },
      data: { totalPagado: 500, saldo: 9500, estadoPago: 'PARCIAL' },
    })

    const canonico = Number(
      (await testPrisma.pedido.findUnique({ where: { id: pedido.id } }))!.saldo,
    )
    const entry = await testPrisma.receivableEntry.findFirst({
      where: { pedidoId: pedido.id },
      orderBy: { createdAt: 'desc' },
    })
    const d = detectarDivergencia(canonico, Number(entry!.saldoResultante))
    expect(d.divergencia).toBe(true)
  })

  // Regresión: `POST /api/pedidos/pagar-fiado` reparte el abono FIFO sobre
  // varios pedidos y genera UNA proyección por pedido, todas con el mismo
  // `offlineId` del batch. Con `offlineId @unique` el 2do create tiraba
  // "Unique constraint failed on the fields: (`offlineId`)" y toda la
  // transacción del pago hacía rollback -> 500 "Error procesando el pago"
  // apenas el abono cubría 2+ pedidos fiados.
  it('permite varias proyecciones con el mismo offlineId en una tx (abono que cubre 2+ pedidos)', async () => {
    const batchOfflineId = `batch-${Date.now()}`

    const pedidoA = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', total: 10000, totalPagado: 10000, saldo: 0, estadoPago: 'ANTICIPADO' },
    })
    const pedidoB = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', total: 10000, totalPagado: 5000, saldo: 5000, estadoPago: 'PARCIAL' },
    })

    await expect(
      testPrisma.$transaction(async (tx) => {
        await registrarReceivableEntry(tx, {
          pedidoId: pedidoA.id,
          clienteId,
          tipo: 'PAGO',
          monto: 10000,
          saldoResultante: 0,
          totalPagadoResultante: 10000,
          offlineId: batchOfflineId,
        })
        await registrarReceivableEntry(tx, {
          pedidoId: pedidoB.id,
          clienteId,
          tipo: 'PAGO',
          monto: 5000,
          saldoResultante: 5000,
          totalPagadoResultante: 5000,
          offlineId: batchOfflineId,
        })
      }),
    ).resolves.not.toThrow()

    const entries = await testPrisma.receivableEntry.findMany({
      where: { offlineId: batchOfflineId },
      orderBy: { createdAt: 'asc' },
    })
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.pedidoId).sort()).toEqual([pedidoA.id, pedidoB.id].sort())
  })
})
