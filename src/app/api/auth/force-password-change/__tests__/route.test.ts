// @tests auth/force-password-change — F-29 fix verification
// Hallazgo F-29: read+check+update sin tx. Si el admin resetea
// el password entre el read y el update, el usuario puede usar
// el password actual brevemente. También permite bypass del
// check currentPassword si el row cambia.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/auth/force-password-change/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-29: force-password-change usa prisma.$transaction con optimistic lock', () => {
  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(source).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique del dbUser está DENTRO de tx', () => {
    expect(source).toMatch(/tx\.user\.findUnique/)
  })

  it('FIX: el select incluye mustChangePassword, password, updatedAt', () => {
    expect(source).toMatch(/select:\s*\{\s*mustChangePassword:\s*true,[\s\S]+?password:\s*true,[\s\S]+?updatedAt:\s*true\s*\}/)
  })

  it('FIX: el bcrypt compare está DENTRO de tx', () => {
    expect(source).toMatch(/bcrypt\.compare\(currentPassword,\s*dbUser\.password\)/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(source).toMatch(/tx\.user\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id:\s*userId,[\s\S]+?updatedAt:\s*dbUser\.updatedAt/)
  })

  it('FIX: si count === 0, throw FORCE_MODIFICADO_POR_OTRO_REQUEST', () => {
    expect(source).toMatch(/updateResult\.count\s*===\s*0/)
    expect(source).toMatch(/FORCE_MODIFICADO_POR_OTRO_REQUEST/)
  })
})

describe('F-29: el catch mapea errores thrown a HTTP responses', () => {
  const catchBlock = source.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: FORCE_USER_NOT_FOUND → 404', () => {
    expect(catchBlock).toMatch(/FORCE_USER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: FORCE_NOT_REQUIRED → 400', () => {
    expect(catchBlock).toMatch(/FORCE_NOT_REQUIRED/)
    expect(catchBlock).toMatch(/400/)
  })

  it('FIX: FORCE_WRONG_PASSWORD → 401', () => {
    expect(catchBlock).toMatch(/FORCE_WRONG_PASSWORD/)
    expect(catchBlock).toMatch(/401/)
  })

  it('FIX: FORCE_PASSWORD_TOO_SHORT → 400', () => {
    expect(catchBlock).toMatch(/FORCE_PASSWORD_TOO_SHORT/)
    expect(catchBlock).toMatch(/400/)
  })

  it('FIX: FORCE_PASSWORD_MISMATCH → 400', () => {
    expect(catchBlock).toMatch(/FORCE_PASSWORD_MISMATCH/)
    expect(catchBlock).toMatch(/400/)
  })

  it('FIX: FORCE_MODIFICADO_POR_OTRO_REQUEST → 409', () => {
    expect(catchBlock).toMatch(/FORCE_MODIFICADO_POR_OTRO_REQUEST/)
    expect(catchBlock).toMatch(/modificada por otro request/)
    expect(catchBlock).toMatch(/409/)
  })
})

describe('F-29: el flujo normal sigue funcionando', () => {
  it('FIX: el logAudit sigue funcionando (después de la tx)', () => {
    expect(source).toMatch(/logAudit\([\s\S]+?tipo:\s*['"]FORCE_PASSWORD_CHANGE['"]/)
  })

  it('FIX: el response sigue retornando apiSuccess({ message })', () => {
    expect(source).toMatch(/return apiSuccess\(\{\s*message:\s*['"]Contraseña actualizada['"]\s*\}\)/)
  })
})

describe('F-29: hay comentarios F-29 explicando el fix', () => {
  it('FIX: el código tiene un comentario F-29', () => {
    expect(source).toMatch(/FIX F-29/)
  })
})
