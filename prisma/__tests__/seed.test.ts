/**
 * Seed idempotency sanity test.
 *
 * Runs the seed twice against the dev DB and asserts the row counts
 * stay the same and no errors are thrown.
 *
 * Skipped in CI (requires local Postgres). Tag: @seed.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEED_TAGS = ['@seed']
const isTagged = process.env.VITEST_TAG?.split(',') ?? []
const shouldRun = isTagged.length === 0 || SEED_TAGS.some(t => isTagged.includes(t))

const skipIf = shouldRun ? describe : describe.skip

skipIf('seed idempotency', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for seed test')
    }
  }, 30000)

  it('seed runs twice without errors and preserves counts', async () => {
    const countsBefore = await getCounts()

    // Run seed
    execSync('npx tsx prisma/seed.ts', {
      stdio: 'pipe',
      env: process.env,
    })
    const countsAfterFirst = await getCounts()
    expect(countsAfterFirst.users).toBeGreaterThanOrEqual(countsBefore.users)
    expect(countsAfterFirst.trabajadores).toBeGreaterThanOrEqual(countsBefore.trabajadores)
    expect(countsAfterFirst.configs).toBeGreaterThanOrEqual(countsBefore.configs)

    // Run again
    execSync('npx tsx prisma/seed.ts', {
      stdio: 'pipe',
      env: process.env,
    })
    const countsAfterSecond = await getCounts()
    expect(countsAfterSecond).toEqual(countsAfterFirst)
  }, 60000)
})

async function getCounts() {
  const [users, trabajadores, configs, productos] = await Promise.all([
    prisma.user.count(),
    prisma.trabajador.count(),
    prisma.config.count(),
    prisma.producto.count(),
  ])
  return { users, trabajadores, configs, productos }
}
