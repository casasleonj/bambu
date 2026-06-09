// @tests casos PATCH — F-N19 fix verification
// Hallazgo: el PATCH hacía findUnique FUERA de tx + update sin
// verificar updatedAt. Dos PATCH simultáneos con cambios a
// status+asignado producían eventos con valorPre stale (trazabilidad sucia).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/casos/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N19: casos PATCH usa optimistic locking con updatedAt', () => {
  // Extraer el PATCH handler
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)

  it('FIX: el findUnique selecciona updatedAt', () => {
    expect(patchSource).toMatch(/select:\s*\{[\s\S]+?updatedAt:\s*true/)
  })

  it('FIX: el PATCH usa updateMany con condición sobre updatedAt (optimistic lock)', () => {
    expect(patchSource).toMatch(/tx\.caso\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existing\.updatedAt/)
  })

  it('FIX: si count === 0, throw con código específico', () => {
    expect(patchSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(patchSource).toMatch(/CASO_MODIFICADO_POR_OTRO_USUARIO/)
  })

  it('FIX: re-leer el caso después del updateMany para devolver estado final', () => {
    expect(patchSource).toMatch(/tx\.caso\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*id/)
  })
})

describe('F-N19: el catch mapea errores thrown a HTTP responses', () => {
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)
  const catchBlock = patchSource.match(/catch[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: CASO_MODIFICADO_POR_OTRO_USUARIO → 409 con mensaje claro', () => {
    expect(catchBlock).toMatch(/CASO_MODIFICADO_POR_OTRO_USUARIO/)
    expect(catchBlock).toMatch(/modificado por otro usuario/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: CASO_NOT_FOUND → 404', () => {
    expect(catchBlock).toMatch(/CASO_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })
})

describe('F-N19: el flujo normal sigue funcionando (no rompe)', () => {
  const patchStart = source.indexOf('export async function PATCH')
  const patchSource = source.substring(patchStart)

  it('FIX: la tx sigue envolviendo update + createMany eventos', () => {
    expect(patchSource).toMatch(/prisma\.\$transaction\(/)
    expect(patchSource).toMatch(/tx\.casoEvento\.createMany/)
  })

  it('FIX: los eventos siguen registrándose con valorPre/valorPost', () => {
    expect(patchSource).toMatch(/valorPre:\s*e\.valorPre\s*\|\|\s*null/)
    expect(patchSource).toMatch(/valorPost:\s*e\.valorPost\s*\|\|\s*null/)
  })

  it('FIX: el logAudit sigue funcionando (fuera de tx)', () => {
    expect(patchSource).toMatch(/logAudit\(/)
  })
})

describe('F-N19: el GET sigue intacto (no se refactorizó)', () => {
  it('FIX: el GET no se tocó', () => {
    const getStart = source.indexOf('export async function GET')
    const patchStart = source.indexOf('export async function PATCH')
    const getSource = source.substring(getStart, patchStart)

    expect(getSource).toMatch(/prisma\.caso\.findUnique/)
  })
})
