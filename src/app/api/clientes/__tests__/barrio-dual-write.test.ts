// @tests POST /api/clientes — F1 Barrio canónico: dual-write de barrioId
// Si el body trae barrioId, el server debe resolver el Barrio DENTRO de la
// misma transacción Serializable y sincronizar el string legacy `barrio`
// con Barrio.nombre — nunca aceptar un barrioId inválido en silencio.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/route.ts')
const source = readFileSync(routePath, 'utf-8')
const postStart = source.indexOf('export async function POST')
const postSource = source.substring(postStart)

describe('POST /api/clientes — dual-write barrioId', () => {
  it('resuelve el Barrio con tx.barrio.findUnique DENTRO de la transacción', () => {
    expect(postSource).toMatch(/tx\.barrio\.findUnique\s*\(\s*\{\s*where:\s*\{\s*id:\s*parsed\.data\.barrioId\s*\}/)
  })

  it('un barrioId inexistente produce kind barrio_not_found, no un cliente a medias', () => {
    expect(postSource).toMatch(/kind:\s*['"]barrio_not_found['"]/)
  })

  it('barrio_not_found se traduce a 400, no a un 500 genérico', () => {
    const handled = postSource.match(/if\s*\(\s*result\.kind\s*===\s*['"]barrio_not_found['"][\s\S]{0,120}/)?.[0] || ''
    expect(handled).toMatch(/400/)
  })

  it('sincroniza el string legacy barrio con el nombre canónico antes de crear', () => {
    expect(postSource).toMatch(/barrioLegacy\s*=\s*barrioCanonico\.nombre/)
    expect(postSource).toMatch(/barrio:\s*barrioLegacy/)
  })

  it('persiste barrioId en el Cliente creado', () => {
    expect(postSource).toMatch(/barrioId:\s*parsed\.data\.barrioId\s*\?\?\s*null/)
  })
})
