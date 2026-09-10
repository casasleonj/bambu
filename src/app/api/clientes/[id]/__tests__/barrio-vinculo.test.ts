// @tests PUT /api/clientes/[id] — F1 Barrio canónico: vinculación de
// registros legacy. Un cliente con barrio!=null y barrioId=null que recibe
// un barrioId queda "vinculado" — evento auditado aparte del UPDATE
// genérico, distinguible en el historial.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')
const putStart = source.indexOf('export async function PUT')
const patchStart = source.indexOf('export async function PATCH')
const putSource = source.substring(putStart, patchStart)

describe('PUT /api/clientes/[id] — vinculación a Barrio canónico', () => {
  it('un barrioId inválido devuelve 400 y no toca el cliente', () => {
    expect(putSource).toMatch(/El barrio seleccionado no existe.*400/)
  })

  it('sincroniza el string legacy barrio con el nombre canónico', () => {
    expect(putSource).toMatch(/parsed\.data\.barrio\s*=\s*barrioCanonico\.nombre/)
  })

  it('solo marca vinculoAudit si el cliente NO tenía barrioId antes (legacy → canónico)', () => {
    expect(putSource).toMatch(/if\s*\(\s*!existing\.barrioId\s*\)\s*\{/)
    expect(putSource).toMatch(/vinculoAudit\s*=\s*\{/)
  })

  it('la vinculación se audita como evento propio, además del UPDATE genérico', () => {
    const vinculoBlock = putSource.match(/if\s*\(\s*vinculoAudit\s*\)\s*\{[\s\S]*?\}\)\s*\}/)?.[0] || ''
    expect(vinculoBlock).toMatch(/logAudit\s*\(/)
    expect(vinculoBlock).toMatch(/vinculoBarrio:\s*vinculoAudit/)
  })

  it('lee barrioId existente ANTES del update (para distinguir vínculo nuevo de re-confirmación)', () => {
    expect(putSource).toMatch(/select:\s*\{\s*updatedAt:\s*true,\s*barrioId:\s*true\s*\}/)
  })
})
