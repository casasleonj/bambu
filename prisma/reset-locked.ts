import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

// Playwright workers are separate OS processes; with workers>1, two
// different describe blocks' beforeAll/beforeEach hooks can both call
// resetDatabase()/resetTestDatabase() at close to the same instant. clean.ts
// runs unlocked TRUNCATEs across ~40 tables — an unlocked concurrent
// clean+seed from another process can interleave with this one (partial
// TRUNCATE from worker B landing between two of worker A's inserts, etc.).
//
// A Postgres session-level advisory lock, held for the *combined*
// clean+seed sequence, serializes these calls across workers/processes so
// only one reset runs against the shared DB at a time. This does NOT
// eliminate the (separate, larger) risk that any single reset invalidates
// every currently-active session cluster-wide by truncating `SesionActiva`
// — see AGENTS.md Known Issue #20 — it only prevents resets from corrupting
// each other.
const LOCK_KEY = 847362951

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

async function main() {
  const mode = process.argv[2] === 'full' ? 'full' : 'test'
  const seedScript = mode === 'full' ? 'prisma/seed.ts' : 'prisma/seed-test.ts'

  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_KEY})`)
  try {
    execSync('npx tsx prisma/clean.ts', { stdio: 'ignore' })
    execSync(`npx tsx ${seedScript}`, { stdio: 'ignore' })
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_KEY})`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
