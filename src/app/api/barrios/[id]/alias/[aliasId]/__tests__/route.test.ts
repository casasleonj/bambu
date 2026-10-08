// @tests /api/barrios/[id]/alias/[aliasId] — F4 Barrio: eliminar Alias.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/[id]/alias/[aliasId]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('DELETE /api/barrios/[id]/alias/[aliasId] — estructura', () => {
  it('exporta una función DELETE, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('pasa barrioId (params.id) para cruzar pertenencia, no solo aliasId', () => {
    expect(source).toMatch(/eliminarAlias\s*\(\s*barrioId\s*,\s*aliasId\s*,/)
  })

  it('traduce AliasNoEncontradoError a 404', () => {
    expect(source).toMatch(/AliasNoEncontradoError/)
    expect(source).toMatch(/404/)
  })
})
