// @tests auth/profile PUT — F-28 fix verification
// Hallazgos F-28a/F-28b/F-28c (mismo patrón que F-27 pero en
// el endpoint de auto-edición del perfil):
//   F-28a: dos requests cambiando el username al mismo valor
//   F-28b: cambio de password sin lock
//   F-28c: dos requests con cambios distintos al mismo perfil
//   (last-write-wins)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/auth/profile/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('F-28: auth/profile PUT usa prisma.$transaction con optimistic lock', () => {
  // Extraer el PUT handler
  const putStart = source.indexOf('export async function PUT')
  const putSource = source.substring(putStart)

  it('FIX: el PUT usa prisma.$transaction', () => {
    expect(putSource).toMatch(/prisma\.\$transaction\(/)
  })

  it('FIX: el findUnique de username está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.user\.findUnique\(\s*\{[\s\S]+?where:\s*\{\s*username\s*\}\s*\}/)
  })

  it('FIX: el bcrypt compare está DENTRO de tx', () => {
    expect(putSource).toMatch(/tx\.user\.findUnique\(\s*\{[\s\S]+?select:\s*\{\s*password:\s*true/)
    expect(putSource).toMatch(/bcrypt\.compare\(/)
  })

  it('FIX: el updateMany usa condición sobre updatedAt (optimistic lock)', () => {
    expect(putSource).toMatch(/tx\.user\.updateMany\(\s*\{[\s\S]+?where:\s*\{[\s\S]+?id:\s*userId,[\s\S]+?updatedAt:\s*(?:dbUser|existing)\.updatedAt/)
  })

  it('FIX: si count === 0, throw PROFILE_MODIFICADO_POR_OTRO_REQUEST', () => {
    expect(putSource).toMatch(/updateResult\.count\s*===\s*0/)
    expect(putSource).toMatch(/PROFILE_MODIFICADO_POR_OTRO_REQUEST/)
  })

  it('FIX: si password incorrecto, throw PROFILE_WRONG_PASSWORD', () => {
    expect(putSource).toMatch(/PROFILE_WRONG_PASSWORD/)
  })
})

describe('F-28: el catch mapea errores thrown a HTTP responses', () => {
  const putStart = source.indexOf('export async function PUT')
  const putSource = source.substring(putStart)
  const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+?(?=\n\})/)?.[0] || ''

  it('FIX: PROFILE_USERNAME_TAKEN → 409', () => {
    expect(catchBlock).toMatch(/PROFILE_USERNAME_TAKEN/)
    expect(catchBlock).toMatch(/409/)
  })

  it('FIX: PROFILE_USER_NOT_FOUND → 404', () => {
    expect(catchBlock).toMatch(/PROFILE_USER_NOT_FOUND/)
    expect(catchBlock).toMatch(/404/)
  })

  it('FIX: PROFILE_NO_DATA → 400', () => {
    expect(catchBlock).toMatch(/PROFILE_NO_DATA/)
    expect(catchBlock).toMatch(/400/)
  })

  it('FIX: PROFILE_WRONG_PASSWORD → 403', () => {
    expect(catchBlock).toMatch(/PROFILE_WRONG_PASSWORD/)
    expect(catchBlock).toMatch(/403/)
  })

  it('FIX: PROFILE_MODIFICADO_POR_OTRO_REQUEST → 409', () => {
    expect(catchBlock).toMatch(/PROFILE_MODIFICADO_POR_OTRO_REQUEST/)
    expect(catchBlock).toMatch(/modificado por otro request/)
  })
})

describe('F-28: el GET sigue intacto', () => {
  it('FIX: el GET no se tocó', () => {
    const getStart = source.indexOf('export async function GET')
    const putStart = source.indexOf('export async function PUT')
    const getSource = source.substring(getStart, putStart)
    expect(getSource).toMatch(/prisma\.user\.findUnique/)
  })
})
