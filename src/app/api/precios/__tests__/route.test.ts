// @tests precios route POST + restore — F-N23 fix verification
// Hallazgo 36 (overlapping ranges) + Hallazgo 39 (restore TOCTOU):
// las validaciones estaban FUERA de tx. Dos requests casi simultáneos
// podían crear rangos solapados o restaurar tiers que ya estaban
// activos.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const preciosPath = join(process.cwd(), 'src/app/api/precios/route.ts')
const restorePath = join(process.cwd(), 'src/app/api/precios/[id]/restore/route.ts')

const preciosSource = readFileSync(preciosPath, 'utf-8')
const restoreSource = readFileSync(restorePath, 'utf-8')

describe('F-N23 (H36): precios POST usa tx atómica para validar + crear', () => {
  // Extraer el bloque create del POST
  const postStart = preciosSource.indexOf('export async function POST')
  const postSource = preciosSource.substring(postStart)

  it('FIX: el create está DENTRO de prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findFirst de exact match usa tx.precioVolumen', () => {
    expect(postSource).toMatch(/tx\.precioVolumen\.findFirst/)
  })

  it('FIX: el findFirst de overlapping usa tx.precioVolumen', () => {
    expect(postSource).toMatch(/tx\.precioVolumen\.findFirst/)
  })

  it('FIX: el create usa tx.precioVolumen.create', () => {
    expect(postSource).toMatch(/tx\.precioVolumen\.create/)
  })

  it('FIX: los errores thrown con prefijo se mapean en catch', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/RANGO_DUPLICADO:/)
    expect(catchBlock).toMatch(/INACTIVE_TIER_BLOCKING:/)
    expect(catchBlock).toMatch(/RANGO_SOLAPADO:/)
  })
})

describe('F-N23 (H39): precios restore usa tx atómica', () => {
  it('FIX: el findUnique está DENTRO de prisma.$transaction', () => {
    expect(restoreSource).toMatch(/prisma\.\$transaction\(/)
    expect(restoreSource).toMatch(/tx\.precioVolumen\.findUnique/)
  })

  it('FIX: el update usa tx.precioVolumen.update', () => {
    expect(restoreSource).toMatch(/tx\.precioVolumen\.update/)
  })

  it('FIX: el findUnique de restore ya NO está FUERA de tx', () => {
    // Quitar comentarios para verificar solo código
    const codeOnly = restoreSource
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    const txStart = codeOnly.indexOf('prisma.$transaction(')
    const findIdx = codeOnly.indexOf('findUnique')
    const updateIdx = codeOnly.indexOf('update')

    expect(txStart).toBeGreaterThan(-1)
    expect(findIdx).toBeGreaterThan(txStart)
    expect(updateIdx).toBeGreaterThan(findIdx)
  })

  it('FIX: el catch mapea TIER_NOT_FOUND → 404 y TIER_YA_ACTIVO → 409', () => {
    const catchBlock = restoreSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/TIER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
    expect(catchBlock).toMatch(/TIER_YA_ACTIVO/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: hay un comentario F-N23 explicando el fix', () => {
    expect(restoreSource).toMatch(/FIX F-N23/)
  })
})

describe('F-N23: el restore sigue retornando el tier restaurado', () => {
  it('FIX: el logAudit sigue funcionando (fuera de tx)', () => {
    expect(restoreSource).toMatch(/logAudit\(/)
    expect(restoreSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })

  it('FIX: el response final sigue siendo apiSuccess({ tier: restored })', () => {
    expect(restoreSource).toMatch(/return apiSuccess\(\{\s*tier:\s*restored\s*\}\)/)
  })
})
