// @tests config route POST — F-N24 fix verification
// Hallazgo 43: el upsert corría FUERA de tx. Si fallaba,
// revalidateConfigCache se ejecutaba igual, invalidando la cache
// innecesariamente (stale invalidation).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/config/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N24: config POST envuelve upsert en tx y revalida solo si commit OK', () => {
  // Extraer el POST handler
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el upsert está DENTRO de prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
    expect(postSource).toMatch(/tx\.config\.upsert\(/)
  })

  it('FIX: el findUnique de existing está DENTRO de la tx', () => {
    expect(postSource).toMatch(/tx\.config\.findUnique/)
  })

  it('FIX: el revalidateConfigCache se llama DESPUÉS del commit de la tx', () => {
    // El revalidate debe estar FUERA del bloque prisma.$transaction
    const txStart = postSource.indexOf('prisma.$transaction(')
    const txClose = postSource.lastIndexOf('})')
    const revalidateIdx = postSource.indexOf('revalidateConfigCache()')

    expect(txStart).toBeGreaterThan(-1)
    expect(revalidateIdx).toBeGreaterThan(txClose)
  })

  it('FIX: si la tx falla, revalidate NO se llama', () => {
    // El revalidate está dentro del try, después del await
    // Si el await throw, revalidate no se ejecuta
    const txAwait = postSource.indexOf('await prisma.$transaction')
    const revalidateIdx = postSource.indexOf('revalidateConfigCache()')
    const tryEnd = postSource.indexOf('return apiSuccess({ config }, 201)')

    expect(txAwait).toBeGreaterThan(-1)
    expect(revalidateIdx).toBeGreaterThan(txAwait)
    expect(revalidateIdx).toBeLessThan(tryEnd)
  })

  it('FIX: hay un comentario F-N24 explicando el fix', () => {
    expect(postSource).toMatch(/FIX F-N24/)
  })
})

describe('F-N24: el logAudit sigue funcionando', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el logAudit sigue funcionando (entre tx commit y revalidate)', () => {
    expect(postSource).toMatch(/logAudit\(/)
    expect(postSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })

  it('FIX: el logAudit determina accion CREATE vs UPDATE basado en existing', () => {
    expect(postSource).toMatch(/accion:\s*existing\s*\?\s*['"]UPDATE['"]\s*:\s*['"]CREATE['"]/)
  })
})

describe('F-N24: el response final sigue siendo 201', () => {
  it('FIX: el POST sigue retornando 201 con { config }', () => {
    const postStart = source.indexOf('export async function POST')
    const postSource = source.substring(postStart)
    expect(postSource).toMatch(/return apiSuccess\(\{\s*config\s*\},\s*201\)/)
  })
})

describe('F-N24: el GET no se refactorizó', () => {
  it('FIX: el GET sigue usando prisma.config.findUnique directamente', () => {
    const getStart = source.indexOf('export async function GET')
    const postStart = source.indexOf('export async function POST')
    const getSource = source.substring(getStart, postStart)

    expect(getSource).toMatch(/prisma\.config\.findUnique/)
    expect(getSource).toMatch(/prisma\.config\.findMany/)
  })
})
