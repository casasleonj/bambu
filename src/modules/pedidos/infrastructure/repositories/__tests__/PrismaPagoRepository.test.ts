import { describe, it, expect, vi } from 'vitest'
import { PrismaPagoRepository } from '../PrismaPagoRepository'
import type { TransactionClient } from '../../transactions/PrismaTransactionManager'

describe('PrismaPagoRepository.createMany — ADR-PAGO-REPORTADO-CONFIRMADO-001', () => {
  it('clasifica cada pago por método (NEQUI → REPORTADO, EFECTIVO → CONFIRMADO)', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 })
    const tx = { pago: { createMany } } as unknown as TransactionClient
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
    expect(data).toEqual([
      { pedidoId: 'ped_1', metodo: 'NEQUI', monto: 5000, confirmacion: 'REPORTADO' },
      { pedidoId: 'ped_1', metodo: 'EFECTIVO', monto: 3000, confirmacion: 'CONFIRMADO' },
    ])
  })

  it('no llama a createMany con lista vacía', async () => {
    const createMany = vi.fn()
    const tx = { pago: { createMany } } as unknown as TransactionClient
    await new PrismaPagoRepository().createMany('ped_1', [], tx)
    expect(createMany).not.toHaveBeenCalled()
  })
})
