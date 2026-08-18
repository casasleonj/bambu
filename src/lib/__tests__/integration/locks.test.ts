// @tests locks — FASE 0 (ADR-CONCURRENCIA-001, contrato §5/§6)
// Verifica el contrato de advisory locks por agregado con hash de 64 bits:
//   1. withAdvisoryLock funciona (adquiere y libera al commit).
//   2. withAdvisoryLockTx adquiere dentro de una tx ya abierta.
//   3. acquireAdvisoryLockTx es el primitivo de bajo nivel.
//   4. Dos transacciones con el MISMO entityKey se serializan.
//   5. La anidación de withAdvisoryLock lanza error explícito.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { withAdvisoryLock, withAdvisoryLockTx, acquireAdvisoryLockTx, advisoryLockKey } from '@/lib/locks'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('locks — contrato transaccional (FASE 0)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('withAdvisoryLock adquiere y libera el lock al commit', async () => {
    const result = await withAdvisoryLock('SECUENCIA', 'test-lock-1', async (tx) => {
      return tx.pedido.count()
    })
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('withAdvisoryLockTx adquiere dentro de una tx ya abierta', async () => {
    const result = await testPrisma.$transaction(async (tx) => {
      await withAdvisoryLockTx(tx, 'SECUENCIA', 'test-lock-2', async () => {
        return tx.pedido.count()
      })
      return 'done'
    })
    expect(result).toBe('done')
  })

  it('acquireAdvisoryLockTx adquiere el lock sin envolver el callback (multi-lock)', async () => {
    const result = await testPrisma.$transaction(async (tx) => {
      await acquireAdvisoryLockTx(tx, 'CIERRE', 'test-embarque')
      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'pedido')
      return tx.pedido.count()
    })
    expect(typeof result).toBe('number')
  })

  it('dos transacciones con el MISMO entityKey se serializan', async () => {
    // tx1 mantiene el lock durante 400ms. tx2 debe esperar a que tx1
    // haga commit antes de adquirir el mismo lock.
    const tx1 = testPrisma.$transaction(async (tx) => {
      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'test-serialized')
      await sleep(400)
      return 'tx1'
    })

    // dar tiempo a tx1 para adquirir el lock
    await sleep(100)

    const start = Date.now()
    const tx2 = await testPrisma.$transaction(async (tx) => {
      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'test-serialized')
      return 'tx2'
    })
    const elapsed = Date.now() - start

    await tx1
    expect(tx2).toBe('tx2')
    // tx1 libera el lock recién a los ~400ms (commit), así que tx2 debió
    // esperar al menos ~200ms más allá del arranque.
    expect(elapsed).toBeGreaterThan(200)
  })

  it('la anidación de withAdvisoryLock lanza error explícito', async () => {
    await expect(
      withAdvisoryLock('SECUENCIA', 'test-outer', async () => {
        // Intentar abrir OTRA transacción de lock dentro → prohibido (§5).
        return withAdvisoryLock('SECUENCIA', 'test-inner', async () => 'inner')
      }),
    ).rejects.toThrow(/ADVISORY_LOCK_NESTED_TRANSACTION/)
  })

  it('advisoryLockKey es determinista y distingue namespaces', () => {
    expect(advisoryLockKey('CARTERA', 'c1')).toBe('CARTERA:c1')
    expect(advisoryLockKey('CARTERA', 'c1')).not.toBe(advisoryLockKey('PEDIDO', 'c1'))
  })
})
