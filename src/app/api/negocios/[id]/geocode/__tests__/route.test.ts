// @tests api/negocios/[id]/geocode — Bloque 6 (coords de negocio)
// Espejo de POST /api/clientes/[id]/geocode con entidad Negocio.
// Patrón del repo: aserción estática sobre la fuente del route handler.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/negocios/[id]/geocode/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('negocios/[id]/geocode: SEGURIDAD', () => {
  it('POST con params Promise + await (Next 15/16)', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    expect(source).toMatch(/params:\s*Promise<\{ id: string \}>/)
    expect(source).toMatch(/const \{ id \} = await params/)
  })

  it('FIX: requireAuth ANTES que requireRole', () => {
    const authIdx = source.indexOf('requireAuth()')
    const roleIdx = source.indexOf('requireRole(')
    expect(authIdx).toBeGreaterThan(-1)
    expect(roleIdx).toBeGreaterThan(authIdx)
  })

  it('FIX: solo ADMIN/ASISTENTE (los roles que editan un negocio)', () => {
    expect(source).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('FIX: usa la estrategia de backfill de negocio', () => {
    expect(source).toMatch(/backfillNegocioCoords\(/)
    expect(source).toMatch(/persistNegocioCoords\(/)
  })

  it('FIX: registra audit con entidad Negocio y campo geocode', () => {
    expect(source).toMatch(/logAudit\(/)
    expect(source).toMatch(/entidad:\s*'Negocio'/)
    expect(source).toMatch(/campo:\s*'geocode'/)
  })

  it('FIX: es idempotente (devuelve coords null si no hay fuente)', () => {
    expect(source).toMatch(/coords:\s*result/)
    expect(source).toMatch(/result\s*\?\s*\{ lat: result\.lat/)
    expect(source).toMatch(/:\s*null/)
  })

  it('FIX: error 500 con logger (no console.log)', () => {
    expect(source).toMatch(/logger\.error/)
    expect(source).toMatch(/apiError\('Error al geocodificar negocio', 500\)/)
  })
})
