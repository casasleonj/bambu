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
    // DIAGNÓSTICO (temporal, Plan Fase 1 — docs/testing/PLAN_RECUPERACION_E2E_8_8.md):
    // se propaga el stdio de clean.ts y del seed para que su salida (incluido
    // el retry de lock_timeout y el snapshot de pg_stat_activity) llegue a los
    // logs de CI. `e2e/fixtures.ts` ya corre este script con stdio:'inherit',
    // pero acá se anulaba con 'ignore'. Revertir a 'ignore' una vez recolectada
    // la evidencia de un run real (ver AGENTS.md Known Issue #20).
    const childStdio = process.env.RESET_LOCKED_QUIET === '1' ? 'ignore' : 'inherit'
    execSync('npx tsx prisma/clean.ts', { stdio: childStdio })
    execSync(`npx tsx ${seedScript}`, { stdio: childStdio })
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
