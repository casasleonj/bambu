// @tests /api/barrios/[id]/referencias/[referenciaId] — F4 Barrio: eliminar Referencia.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/[id]/referencias/[referenciaId]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('DELETE /api/barrios/[id]/referencias/[referenciaId] — estructura', () => {
  it('exporta una función DELETE, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('pasa barrioId (params.id) para cruzar pertenencia, no solo referenciaId', () => {
    expect(source).toMatch(/eliminarReferencia\s*\(\s*barrioId\s*,\s*referenciaId\s*,/)
  })

  it('traduce ReferenciaNoEncontradaError a 404', () => {
    expect(source).toMatch(/ReferenciaNoEncontradaError/)
    expect(source).toMatch(/404/)
  })
})
