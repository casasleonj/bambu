// @tests /api/barrios/[id]/referencias — F4 Barrio: crear Referencia
// (compartible entre Barrios, solo rechaza redundancia propia).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/[id]/referencias/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('POST /api/barrios/[id]/referencias — estructura', () => {
  it('exporta una función POST, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('usa BarrioReferenciaCreateSchema para validar el body', () => {
    expect(source).toMatch(/BarrioReferenciaCreateSchema\.parse\s*\(/)
  })

  it('delega a crearReferencia (no a crearAlias — rutas separadas por tabla, sin tipo en el payload)', () => {
    expect(source).toMatch(/crearReferencia\s*\(/)
    expect(source).not.toMatch(/crearAlias\s*\(/)
  })

  it('NO importa ConflictoTerritorialError — una Referencia nunca bloquea contra otro Barrio', () => {
    expect(source).not.toMatch(/ConflictoTerritorialError/)
  })

  it('traduce ReferenciaRedundanteError a 409 (redundancia dentro del mismo Barrio)', () => {
    expect(source).toMatch(/ReferenciaRedundanteError/)
    expect(source).toMatch(/409/)
  })

  it('el usuarioId sale de la sesión autenticada, nunca del body', () => {
    expect(source).toMatch(/authResult\.user/)
    expect(source).not.toMatch(/body\.usuarioId|data\.usuarioId/)
  })

  it('maneja Barrio no encontrado (404) y P2002 de duplicado exacto dentro del mismo Barrio (409)', () => {
    expect(source).toMatch(/BarrioNoEncontradoError/)
    expect(source).toMatch(/404/)
    expect(source).toMatch(/P2002/)
  })

  it('crea con 201', () => {
    expect(source).toMatch(/201/)
  })
})
