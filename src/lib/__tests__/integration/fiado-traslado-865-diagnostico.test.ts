// #865 F1: diagnostic of EXISTING PostgreSQL contracts, not a transfer implementation.
// No fixture reset, no writes to application tables, no production connections.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { acquireAdvisoryLockTx, advisoryLockKey } from '@/lib/locks'
import { testPrisma, disconnect } from './setup'

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  if (process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/bambu') {
    throw new Error('#865: diagnostics require the local disposable test database')
  }
}

describe('#865 F1 — PostgreSQL baseline (no business writes)', () => {
  beforeAll(assertLocalDatabase)
  afterAll(disconnect)

  it('installed payment-state CHECK and documented #715 schema gap', async () => {
    const rows = await testPrisma.$queryRaw<Array<{ name: string; definition: string; validated: boolean }>>`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition, convalidated AS validated
      FROM pg_constraint
      WHERE conrelid = 'public."Pedido"'::regclass
        AND conname IN ('chk_pedido_saldo_calc', 'chk_pedido_estadopago_proyectado')
    `
    const saldo = rows.find(r => r.name === 'chk_pedido_saldo_calc')
    const estado = rows.find(r => r.name === 'chk_pedido_estadopago_proyectado')
    expect(estado?.validated).toBe(true)
    if (saldo) {
      expect(saldo.validated).toBe(true)
      expect(saldo.definition).toMatch(/saldo.*total.*totalPagado/)
      expect(saldo.definition).not.toMatch(/traslad/i)
    } else {
      // #715 excludes this migration from the ephemeral CI database.
      const exclusions = readFileSync(resolve(process.cwd(), 'src/lib/__tests__/migraciones-sql-crudas.test.ts'), 'utf8')
      const list = readFileSync(resolve(process.cwd(), 'scripts/migraciones-sql-crudas.txt'), 'utf8')
      expect(exclusions).toMatch(/'20260610_add_check_constraints'/)
      expect(list.split('\n').map(l => l.split('#')[0].trim())).not.toContain('20260610_add_check_constraints')
    }
    expect(estado?.definition).toContain('totalPagado')
    const [fixture] = await testPrisma.$queryRaw<Array<{ old_valid: boolean; proposed_valid: boolean }>>`
      SELECT (40000::numeric = 60000::numeric - 5000::numeric) AS old_valid,
             (40000::numeric = 60000::numeric - 5000::numeric - 15000::numeric) AS proposed_valid
    `
    expect(fixture).toEqual({ old_valid: false, proposed_valid: true })
  })

  it('reproduces the legacy balance CHECK in an isolated PostgreSQL temporary table', async () => {
    const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260610_add_check_constraints/migration.sql'), 'utf8')
    expect(migration).toContain('ADD CONSTRAINT chk_pedido_saldo_calc CHECK (saldo = total - "totalPagado")')
    await testPrisma.$transaction(async tx => {
      await tx.$executeRaw`CREATE TEMP TABLE f1_865_balance (total numeric, "totalPagado" numeric, saldo numeric, CONSTRAINT chk_865_saldo_calc CHECK (saldo = total - "totalPagado")) ON COMMIT DROP`
      await tx.$executeRaw`INSERT INTO f1_865_balance VALUES (60000, 5000, 55000)`
    })
    await expect(testPrisma.$transaction(async tx => {
      await tx.$executeRaw`CREATE TEMP TABLE f1_865_balance (total numeric, "totalPagado" numeric, saldo numeric, CONSTRAINT chk_865_saldo_calc CHECK (saldo = total - "totalPagado")) ON COMMIT DROP`
      await tx.$executeRaw`INSERT INTO f1_865_balance VALUES (60000, 5000, 40000)`
    })).rejects.toThrow(/chk_865_saldo_calc/)
  })

  it('CARTERA then PEDIDO locks exclude another connection and release on commit', async () => {
    const key = 'test-865-' + randomUUID()
    const cartera = advisoryLockKey('CARTERA', key)
    const pedido = advisoryLockKey('PEDIDO', key)
    await testPrisma.$transaction(async tx => {
      await acquireAdvisoryLockTx(tx, 'CARTERA', key)
      await acquireAdvisoryLockTx(tx, 'PEDIDO', key)
      const [owner] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await testPrisma.$transaction(async other => {
        const [row] = await other.$queryRaw<Array<{ pid: number; cartera: boolean; pedido: boolean }>>`
          SELECT pg_backend_pid() AS pid,
            pg_try_advisory_xact_lock(hashtextextended(${cartera}, 0)) AS cartera,
            pg_try_advisory_xact_lock(hashtextextended(${pedido}, 0)) AS pedido
        `
        expect(row.pid).not.toBe(owner.pid)
        expect(row.cartera).toBe(false)
        expect(row.pedido).toBe(false)
      }, { timeout: 15000, maxWait: 10000 })
    }, { timeout: 30000, maxWait: 10000 })
    await testPrisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ cartera: boolean; pedido: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${cartera}, 0)) AS cartera,
               pg_try_advisory_xact_lock(hashtextextended(${pedido}, 0)) AS pedido
      `
      expect(row).toEqual({ cartera: true, pedido: true })
    })
  })

  it('a rollback releases both locks without persisting an application operation', async () => {
    const key = 'test-865-' + randomUUID()
    const cartera = advisoryLockKey('CARTERA', key)
    const pedido = advisoryLockKey('PEDIDO', key)
    await expect(testPrisma.$transaction(async tx => {
      await acquireAdvisoryLockTx(tx, 'CARTERA', key)
      await acquireAdvisoryLockTx(tx, 'PEDIDO', key)
      throw new Error('F1_SYNTHETIC_ROLLBACK')
    })).rejects.toThrow('F1_SYNTHETIC_ROLLBACK')
    await testPrisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ cartera: boolean; pedido: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${cartera}, 0)) AS cartera,
               pg_try_advisory_xact_lock(hashtextextended(${pedido}, 0)) AS pedido
      `
      expect(row).toEqual({ cartera: true, pedido: true })
    })
  })
})
