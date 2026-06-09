// @tests users PUT — F-27 fix verification
// Hallazgos F-27a + F-27b:
//   F-27a: dos admins renombrando dos users al mismo username
//   casi simultáneo. P2002 → 500.
//   F-27b: dos admins editando al mismo user, last-write-wins
//   silencioso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/users/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-27: users PUT usa prisma.$transaction con optimistic lock', () => {
  // Extraer el PUT handler
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(putSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique de username (si se cambia) está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.user\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*username\s*\}\s*\}/)
  })

  it('FIX: si username está tomado, throw USER_USERNAME_TAKEN', () => {
    expect(putSource).toMatch(/USER_USERNAME_TAKEN/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(putSource).toMatch(/tx\.user\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*existingTarget\.updatedAt/)
  })

  it('FIX: si count === 0, throw USER_MODIFICADO_POR_OTRO_USUARIO', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/USER_MODIFICADO_POR_OTRO_USUARIO/)
  })

  it('FIX: el catch mapea USER_USERNAME_TAKEN → 409', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/USER_USERNAME_TAKEN/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch mapea USER_MODIFICADO_POR_OTRO_USUARIO → 409', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/USER_MODIFICADO_POR_OTRO_USUARIO/)
    expect(catchBlock).toMatch(/modificado por otro admin/)
  })

  it('FIX: el catch mapea USER_NOT_FOUND → 404', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/USER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: el catch sigue manejando P2002 (defensa en profundidad)', () => {
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/P2002/)
  })
})

describe('F-27: el logAudit sigue funcionando', () => {
  const putStart = source.indexOf('export async function PUT')
  const deleteStart = source.indexOf('export async function DELETE')
  const putSource = source.substring(putStart, deleteStart)

  it('FIX: el logAudit se ejecuta después del updateMany exitoso', () => {
    expect(putSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]UPDATE['"]/)
    expect(putSource).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/)
  })
})

describe('F-27: el DELETE sigue intacto (no se refactorizó)', () => {
  it('FIX: el DELETE no se tocó', () => {
    const deleteStart = source.indexOf('export async function DELETE')
    const deleteSource = source.substring(deleteStart)
    expect(deleteSource).toMatch(/prisma\.user\.findUnique/)
    expect(deleteSource).toMatch(/prisma\.user\.update/)
  })
})
