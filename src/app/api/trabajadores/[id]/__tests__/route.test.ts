// @tests trabajadores DELETE — F-N18 fix verification
// Hallazgo: el DELETE hacía findUnique + count + update FUERA de tx.
// Dos admins casi simultáneos podían desactivar un trabajdor con
// embarques activos recién creados por otro admin.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/trabajadores/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-N18: trabajadores DELETE envuelve read+check+update en tx', () => {
  // Extraer el DELETE handler
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el DELETE usa prisma.$transaction', () => {
    expect(deleteSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique del trabajdor está DENTRO de la tx (usa tx.trabajador)', () => {
    // El findUnique debe usar tx.trabajador, no prisma.trabajador
    expect(deleteSource).toMatch(/tx\.trabajador\.findUnique/)
    // NO debe haber prisma.trabajador.findUnique directo en el DELETE
    expect(deleteSource).not.toMatch(/prisma\.trabajador\.findUnique/)
  })

  it('FIX: el count de embarques activos está DENTRO de la tx', () => {
    expect(deleteSource).toMatch(/tx\.embarque\.count/)
    expect(deleteSource).not.toMatch(/prisma\.embarque\.count/)
  })

  it('FIX: el update del trabajdor está DENTRO de la tx', () => {
    expect(deleteSource).toMatch(/tx\.trabajador\.update/)
  })

  it('FIX: el DELETE ya NO tiene read+check+update sueltos con prisma.* global', () => {
    // El bloque de read+check+update debe estar dentro de la tx
    const txStart = deleteSource.indexOf('prisma.$transaction(')
    const findIdx = deleteSource.indexOf('findUnique', txStart)
    const countIdx = deleteSource.indexOf('embarque.count', txStart)
    const updateIdx = deleteSource.indexOf('trabajador.update', txStart)

    expect(txStart).toBeGreaterThan(-1)
    expect(findIdx).toBeGreaterThan(txStart)
    expect(countIdx).toBeGreaterThan(findIdx)
    expect(updateIdx).toBeGreaterThan(countIdx)
  })
})

describe('F-N18: el catch mapea errores thrown a HTTP responses', () => {
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)
  const catchBlock = deleteSource.match(/catch[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: TRABAJADOR_NOT_FOUND → 404', () => {
    expect(catchBlock).toMatch(/TRABAJADOR_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: TRABAJADOR_YA_DESACTIVADO → 409', () => {
    expect(catchBlock).toMatch(/TRABAJADOR_YA_DESACTIVADO/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: EMBARQUES_ACTIVOS:N → 400 con mensaje específico', () => {
    expect(catchBlock).toMatch(/EMBARQUES_ACTIVOS:/)
    expect(catchBlock).toMatch(/No se puede desactivar/)
    expect(catchBlock).toMatch(/400/)
  })
})

describe('F-N18: el flujo normal sigue funcionando (no rompe)', () => {
  const deleteStart = source.indexOf('export async function DELETE')
  const deleteSource = source.substring(deleteStart)

  it('FIX: el logAudit sigue funcionando (fuera de tx)', () => {
    expect(deleteSource).toMatch(/logAudit\(/)
    expect(deleteSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })

  it('FIX: el DELETE sigue retornando apiSuccess({})', () => {
    expect(deleteSource).toMatch(/return apiSuccess\(\{\}\)/)
  })
})

describe('F-N18: el PUT sigue intacto (no se refactorizó)', () => {
  it('FIX: el PUT no se tocó', () => {
    const putStart = source.indexOf('export async function PUT')
    const deleteStart = source.indexOf('export async function DELETE')
    const putSource = source.substring(putStart, deleteStart)

    expect(putSource).toMatch(/prisma\.trabajador\.update/)
  })
})
