// @tests produccion POST — FASE 1: dedup por offlineId DENTRO del lock
// Hallazgo: el dedup por offlineId estaba FUERA del $transaction (cliente
// global). Dos requests concurrentes con el mismo offlineId pasaban el
// findUnique (null) y el segundo caía en P2002 → 409 no idempotente.
// FIX: el dedup corre dentro del lock (después de acquireAdvisoryLockTx).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/produccion/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('FASE 1: dedup por offlineId DENTRO del lock en produccion POST', () => {
  it('FIX: el dedup por offlineId está DENTRO del callback de prisma.$transaction', () => {
    const txOpen = source.indexOf('prisma.$transaction')
    const lockAcquire = source.indexOf("acquireAdvisoryLockTx(tx, 'SECUENCIA', 'produccion')")
    const dedupFind = source.indexOf('where: { offlineId: parsed.data.offlineId }')
    // El findUnique del dedup debe estar dentro del $transaction y DESPUÉS del lock.
    expect(txOpen).toBeGreaterThan(-1)
    expect(lockAcquire).toBeGreaterThan(txOpen)
    expect(dedupFind).toBeGreaterThan(lockAcquire)
  })

  it('FIX: el dedup fuera del lock fue eliminado (no hay findUnique de offlineId con prisma global)', () => {
    // El patrón viejo era: `await prisma.produccion.findUnique({ where: { offlineId: ... } })`
    // fuera del $transaction. No debe quedar.
    expect(source).not.toMatch(/prisma\.produccion\.findUnique\(\{\s*where:\s*\{\s*offlineId/)
  })

  it('FIX: el retorno del $transaction distingue deduped', () => {
    expect(source).toMatch(/deduped:\s*true\s+as\s+const/)
    expect(source).toMatch(/deduped:\s*false\s+as\s+const/)
  })
})
