// @tests /api/zonas/[id]/barrios/[barrioId] — F3 Zona territorial: quitar Barrio
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/zonas/[id]/barrios/[barrioId]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('DELETE /api/zonas/[id]/barrios/[barrioId] — estructura', () => {
  it('exporta una función DELETE, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('delega a quitarBarrioDeZona (auditoría atómica vive en el servicio, no en la ruta)', () => {
    expect(source).toMatch(/quitarBarrioDeZona\s*\(/)
  })

  it('devuelve 404 si el vínculo no existe (ZonaBarrioNoEncontradoError)', () => {
    expect(source).toMatch(/ZonaBarrioNoEncontradoError/)
    expect(source).toMatch(/404/)
  })
})
