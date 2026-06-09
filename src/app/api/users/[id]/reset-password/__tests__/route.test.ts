// @tests users/[id]/reset-password — F-30 fix verification
// Hallazgo F-30: dos admins reseteando password del mismo user
// casi simultáneo. Last-write-wins silencioso: el admin A
// le dice al usuario "tu nueva contraseña es abc" pero la
// real es "xyz" (que generó B). El usuario no puede entrar.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/users/[id]/reset-password/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-30: reset-password usa prisma.$transaction con optimistic lock', () => {
  it('FIX: el PATCH usa prisma.$transaction', () => {
    expect(source).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique está DENTRO de tx', () => {
    expect(source).toMatch(/tx\.user\.findUnique/)
  })

  it('FIX: el select incluye updatedAt para optimistic lock', () => {
    expect(source).toMatch(/select:\s*\{[\s\S]+?updatedAt:\s*true\s*\}/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(source).toMatch(/tx\.user\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id,[\s\S]+?updatedAt:\s*user\.updatedAt/)
  })

  it('FIX: si count === 0, throw RESET_MODIFICADO_POR_OTRO_ADMIN', () => {
    expect(source).toMatch(/updateResult\.count\s*===\s*0/)
    expect(source).toMatch(/RESET_MODIFICADO_POR_OTRO_ADMIN/)
  })

  it('FIX: si user no existe, throw RESET_USER_NOT_FOUND', () => {
    expect(source).toMatch(/RESET_USER_NOT_FOUND/)
  })
})

describe('F-30: el catch mapea errores thrown a HTTP responses', () => {
  const catchBlock = source.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: RESET_USER_NOT_FOUND → 404', () => {
    expect(catchBlock).toMatch(/RESET_USER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: RESET_MODIFICADO_POR_OTRO_ADMIN → 409', () => {
    expect(catchBlock).toMatch(/RESET_MODIFICADO_POR_OTRO_ADMIN/)
    expect(catchBlock).toMatch(/modificado por otro admin/)
    expect(catchBlock).toMatch(/409/)
  })
})

describe('F-30: el flujo normal sigue funcionando', () => {
  it('FIX: el logAudit sigue funcionando con result.user.id', () => {
    expect(source).toMatch(/logAudit\([\s\S]+?tipo:\s*['"]RESET_PASSWORD['"]/)
    expect(source).toMatch(/registroId:\s*result\.user\.id/)
  })

  it('FIX: el response sigue retornando password + user', () => {
    expect(source).toMatch(/return apiSuccess\(\{[\s\S]+?password:\s*result\.plainPassword,[\s\S]+?user:\s*\{/)
  })
})

describe('F-30: el check self-reset sigue funcionando', () => {
  it('FIX: no se permite resetear la propia contraseña', () => {
    expect(source).toMatch(/if\s*\(id\s*===\s*adminId\)/)
    expect(source).toMatch(/No puedes resetear tu propia contraseña/)
  })
})
