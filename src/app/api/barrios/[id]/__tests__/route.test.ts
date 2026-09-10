// @tests /api/barrios/[id] — F1 Barrio canónico (PATCH: rename/archivar/reactivar)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('PATCH /api/barrios/[id] — estructura', () => {
  it('exporta una función PATCH', () => {
    expect(source).toMatch(/export\s+async\s+function\s+PATCH\s*\(/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('usa BarrioUpdateSchema para validar el body', () => {
    expect(source).toMatch(/BarrioUpdateSchema\.parse\s*\(/)
  })

  it('404 si el barrio no existe', () => {
    expect(source).toMatch(/Barrio no encontrado.*404/)
  })

  it('rename: usa renombrarBarrio y audita UPDATE con antes/cambios', () => {
    expect(source).toMatch(/renombrarBarrio\s*\(/)
    expect(source).toMatch(/cambios:\s*\{\s*nombre:/)
    expect(source).toMatch(/antes:\s*\{\s*nombre:\s*existente\.nombre\s*\}/)
  })

  it('rename: audita cuántos Cliente/Negocio se sincronizaron', () => {
    expect(source).toMatch(/clientesSincronizados/)
    expect(source).toMatch(/negociosSincronizados/)
  })

  it('archivar (activo=false) audita accion DELETE', () => {
    expect(source).toMatch(/archivarBarrio\s*\(/)
    expect(source).toMatch(/data\.activo\s*\?\s*['"]RESTORE['"]\s*:\s*['"]DELETE['"]/)
  })

  it('reactivar (activo=true) audita accion RESTORE', () => {
    expect(source).toMatch(/reactivarBarrio\s*\(/)
  })

  it('rename y archivado/reactivación son independientes (pueden coexistir en un solo PATCH)', () => {
    // Dos bloques `if` separados sobre data.nombre y data.activo, no un
    // solo branch exclusivo.
    expect(source).toMatch(/if\s*\(\s*data\.nombre\s*!==\s*undefined/)
    expect(source).toMatch(/if\s*\(\s*data\.activo\s*!==\s*undefined/)
  })

  it('mapea BarrioNoEncontradoError → 404', () => {
    expect(source).toMatch(/BarrioNoEncontradoError/)
  })

  it('mapea P2002 (rename colisiona con otro barrio) → 409', () => {
    expect(source).toMatch(/P2002/)
    expect(source).toMatch(/409/)
  })
})
