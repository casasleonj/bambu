import { PrismaClient } from '@prisma/client'
import { spawnSync } from 'child_process'

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

// Salida visible sin ruido (#322): clean.ts y el seed imprimen ~40 líneas cada
// uno y antes se descartaban por completo (`stdio: 'ignore'`), así que ningún
// log de CI mostraba si el reintento de lock_timeout de clean.ts se disparaba.
// Se captura todo y solo se reimprime lo que importa (contención de locks,
// tablas omitidas, conexiones terminadas, errores) más una línea-resumen con la
// duración. Si el comando falla se imprime la salida COMPLETA antes de relanzar.
const RELEVANTE = /Lock contention|Skipped |Terminated |terminateStaleConnections|error|Error|ERROR/

function ejecutar(etiqueta: string, comando: string): void {
  const r = spawnSync(comando, { shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) {
    process.stderr.write(salida)
    throw new Error(`[reset] ${etiqueta} terminó con código ${r.status ?? `señal ${r.signal}`}`)
  }
  for (const linea of salida.split('\n')) {
    if (RELEVANTE.test(linea)) console.log(`[reset] ${etiqueta}: ${linea.trim()}`)
  }
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

async function main() {
  const mode = process.argv[2] === 'full' ? 'full' : 'test'
  const seedScript = mode === 'full' ? 'prisma/seed.ts' : 'prisma/seed-test.ts'

  const inicio = Date.now()
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${LOCK_KEY})`)
  const esperaLock = Date.now() - inicio
  try {
    ejecutar('clean', 'npx tsx prisma/clean.ts')
    ejecutar('seed', `npx tsx ${seedScript}`)
    console.log(`[reset] ${mode}: ${Date.now() - inicio} ms (espera del lock: ${esperaLock} ms)`)
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
