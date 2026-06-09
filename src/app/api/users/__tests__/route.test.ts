// @tests users POST — F-31 fix verification
// Hallazgo F-31: dos admins creando user con el mismo username
// casi simultáneo. Pasan el check, segundo recibía P2002 → 500.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/users/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-31: users POST usa prisma.$transaction para findUnique + create', () => {
  // Extraer el POST handler
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el POST usa prisma.$transaction', () => {
    expect(postSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique de username está DENTRO de tx', () => {
    expect(postSource).toMatch(/tx\.user\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*username/)
  })

  it('FIX: el create usa tx.user.create', () => {
    expect(postSource).toMatch(/tx\.user\.create\(/)
  })

  it('FIX: si username ya existe, throw USER_USERNAME_EXISTS', () => {
    expect(postSource).toMatch(/USER_USERNAME_EXISTS/)
  })

  it('FIX: el catch mapea USER_USERNAME_EXISTS → 409', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/USER_USERNAME_EXISTS/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: el catch sigue manejando P2002 (defensa en profundidad)', () => {
    const catchBlock = postSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''
    expect(catchBlock).toMatch(/P2002/)
  })

  it('FIX: hay un comentario F-31 explicando el fix', () => {
    expect(postSource).toMatch(/FIX F-31/)
  })
})

describe('F-31: el flujo normal sigue funcionando', () => {
  const postStart = source.indexOf('export async function POST')
  const postSource = source.substring(postStart)

  it('FIX: el bcrypt hash sigue funcionando (antes de la tx)', () => {
    expect(postSource).toMatch(/bcrypt\.hash\(password, 12\)/)
  })

  it('FIX: el logAudit sigue funcionando (después de la tx)', () => {
    expect(postSource).toMatch(/logAudit\([\s\S]+?accion:\s*['"]CREATE['"]/)
  })

  it('FIX: el response sigue retornando 201 con { user }', () => {
    expect(postSource).toMatch(/return apiSuccess\(\{\s*user\s*\},\s*201\)/)
  })
})

describe('F-31: el GET sigue intacto', () => {
  it('FIX: el GET no se tocó', () => {
    const getStart = source.indexOf('export async function GET')
    const postStart = source.indexOf('export async function POST')
    const getSource = source.substring(getStart, postStart)
    expect(getSource).toMatch(/prisma\.user\.findMany/)
  })
})
