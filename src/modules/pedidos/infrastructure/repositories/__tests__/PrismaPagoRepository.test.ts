import { describe, it, expect, vi } from 'vitest'
import { PrismaPagoRepository } from '../PrismaPagoRepository'
import type { TransactionClient } from '../../transactions/PrismaTransactionManager'

describe('PrismaPagoRepository.createMany — ADR-PAGO-REPORTADO-CONFIRMADO-001', () => {
  it('clasifica cada pago por método (NEQUI → REPORTADO, EFECTIVO → CONFIRMADO)', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 })
    const tx = {
      pago: { createMany },
      config: { findUnique: vi.fn().mockResolvedValue(null) }, // METODOS_REQUIEREN_CONFIRMACION → default
    } as unknown as TransactionClient
    const repo = new PrismaPagoRepository()

    await repo.createMany(
      'ped_1',
      [
        { metodo: 'NEQUI', monto: 5000 },
        { metodo: 'EFECTIVO', monto: 3000 },
      ],
      tx,
    )

    const data = createMany.mock.calls[0][0].data
    // ADR-PAGO-EMBARQUE-CAPTURA-001: sin `embarqueId` explícito → null (fuera de misión).
    expect(data[0]).toEqual({ pedidoId: 'ped_1', metodo: 'NEQUI', monto: 5000, confirmacion: 'REPORTADO', embarqueId: null })
    expect(data[1]).toMatchObject({ pedidoId: 'ped_1', metodo: 'EFECTIVO', monto: 3000, confirmacion: 'CONFIRMADO', embarqueId: null })
    // CONFIRMADO auto → confirmadoAt seteado, coherente con el backfill.
    expect(data[1].confirmadoAt).toBeInstanceOf(Date)
    expect(data[0]).not.toHaveProperty('confirmadoAt')
  })

  it('ADR-PAGO-EMBARQUE-CAPTURA-001: propaga el embarqueId de captura al batch', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = {
      pago: { createMany },
      config: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as TransactionClient
    const repo = new PrismaPagoRepository()

    await repo.createMany('ped_1', [{ metodo: 'EFECTIVO', monto: 3000 }], tx, undefined, 'emb_70')

    const data = createMany.mock.calls[0][0].data
    expect(data[0].embarqueId).toBe('emb_70')
  })

  it('no llama a createMany con lista vacía', async () => {
    const createMany = vi.fn()
    const tx = {
      pago: { createMany },
      config: { findUnique: vi.fn().mockResolvedValue(null) }, // METODOS_REQUIEREN_CONFIRMACION → default
    } as unknown as TransactionClient
    await new PrismaPagoRepository().createMany('ped_1', [], tx)
    expect(createMany).not.toHaveBeenCalled()
  })
})
