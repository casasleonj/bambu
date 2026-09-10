// @tests POST/PUT /api/negocios — F1 Barrio canónico: dual-write + vinculación
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/negocios/route.ts')
const source = readFileSync(routePath, 'utf-8')
const postStart = source.indexOf('export async function POST')
const putStart = source.indexOf('export async function PUT')
const postSource = source.substring(postStart, putStart)
const putSource = source.substring(putStart)

describe('POST /api/negocios — dual-write barrioId', () => {
  it('resuelve el Barrio vía resolverBarrioParaVinculo DENTRO de la transacción (tx)', () => {
    expect(postSource).toMatch(/resolverBarrioParaVinculo\s*\(\s*parsed\.data\.barrioId,\s*tx\s*\)/)
  })

  it('un barrioId inexistente devuelve 400, no crea el negocio', () => {
    expect(postSource).toMatch(/El barrio seleccionado no existe.*400/)
  })

  it('sincroniza el string legacy barrio con el nombre canónico', () => {
    expect(postSource).toMatch(/barrioLegacy\s*=\s*barrioCanonico\.nombre/)
    expect(postSource).toMatch(/barrio:\s*barrioLegacy/)
  })

  it('F1-CONCURRENCIA (fix revisión pre-merge): verificar cliente + resolver Barrio + crear negocio en LA MISMA transacción', () => {
    // Antes: resolverBarrioParaVinculo (sin tx) seguido, en una operación
    // separada, de prisma.negocio.create — ventana abierta a un rename
    // concurrente del Barrio entre ambas.
    expect(postSource).toMatch(/prisma\.\$transaction\s*\(\s*async\s*\(\s*tx\s*\)\s*=>/)
    expect(postSource).toMatch(/tx\.cliente\.findUnique/)
    expect(postSource).toMatch(/tx\.negocio\.create/)
  })
})

describe('PUT /api/negocios?id= — dual-write + vinculación', () => {
  it('resuelve el Barrio DENTRO de la transacción (tx)', () => {
    expect(putSource).toMatch(/resolverBarrioParaVinculo\s*\(\s*parsed\.data\.barrioId,\s*tx\s*\)/)
  })

  it('un barrioId inexistente lanza BARRIO_NOT_FOUND, mapeado a 400', () => {
    expect(putSource).toMatch(/BARRIO_NOT_FOUND/)
    const catchBlock = putSource.match(/catch\s*\(error\)[\s\S]+$/)?.[0] || ''
    expect(catchBlock).toMatch(/BARRIO_NOT_FOUND/)
    expect(catchBlock).toMatch(/400/)
  })

  it('solo marca vinculoAudit si el negocio no tenía barrioId antes', () => {
    expect(putSource).toMatch(/if\s*\(\s*!existing\.barrioId\s*\)\s*\{/)
    expect(putSource).toMatch(/vinculoAudit\s*=\s*\{/)
  })

  it('la vinculación se audita como evento UPDATE propio, además del genérico', () => {
    expect(putSource).toMatch(/vinculoBarrio:\s*vinculoAudit/)
  })
})
