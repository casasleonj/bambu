// @tests precios/[id] DELETE — F-32 fix verification
// Hallazgo F-32: findUnique + update FUERA de tx. Si el tier era
// modificado entre el read y el update, el audit log capturaba
// datos stale.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/precios/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-32: precios DELETE usa prisma.$transaction atómica', () => {
  // Extraer el DELETE handler
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el DELETE usa prisma.$transaction', () => {
    expect(deleteSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique está DENTRO de tx', () => {
    expect(deleteSource).toMatch(/tx\.precioVolumen\.findUnique/)
  })

  it('FIX: el update usa tx.precioVolumen.update', () => {
    expect(deleteSource).toMatch(/tx\.precioVolumen\.update\(/)
  })

  it('FIX: si tier no existe, throw TIER_NOT_FOUND', () => {
    expect(deleteSource).toMatch(/TIER_NOT_FOUND/)
  })

  it('FIX: el catch mapea TIER_NOT_FOUND → 404', () => {
    const catchBlock = deleteSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/TIER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: hay un comentario F-32 explicando el fix', () => {
    expect(deleteSource).toMatch(/FIX F-32/)
  })
})

describe('F-32: el logAudit sigue funcionando con datos frescos', () => {
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el logAudit usa existing (de la tx)', () => {
    expect(deleteSource).toMatch(/logAudit\([\s\S]+?productoId:\s*existing\.productoId/)
    expect(deleteSource).toMatch(/cantMin:\s*existing\.cantMin/)
  })
})

describe('F-32: el response sigue retornando 200', () => {
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el response sigue siendo apiSuccess({})', () => {
    expect(deleteSource).toMatch(/return apiSuccess\(\{\}\)/)
  })
})
