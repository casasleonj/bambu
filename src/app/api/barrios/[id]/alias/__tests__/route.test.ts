// @tests /api/barrios/[id]/alias — F4 Barrio: crear Alias (bloqueo duro).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/[id]/alias/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('POST /api/barrios/[id]/alias — estructura', () => {
  it('exporta una función POST, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('usa BarrioAliasCreateSchema para validar el body (sin tipo como input)', () => {
    expect(source).toMatch(/BarrioAliasCreateSchema\.parse\s*\(/)
    expect(source).not.toMatch(/data\.tipo|body\.tipo/)
  })

  it('delega la decisión de conflicto a crearAlias (no decide bloqueo en la ruta)', () => {
    expect(source).toMatch(/crearAlias\s*\(/)
  })

  it('el usuarioId sale de la sesión autenticada, nunca del body', () => {
    expect(source).toMatch(/authResult\.user/)
    expect(source).not.toMatch(/body\.usuarioId|data\.usuarioId/)
  })

  it('traduce ConflictoTerritorialError y ReferenciaRedundanteError a 409 (bloqueo duro, no confirmable)', () => {
    expect(source).toMatch(/ConflictoTerritorialError/)
    expect(source).toMatch(/ReferenciaRedundanteError/)
    expect(source).toMatch(/409/)
    expect(source).not.toMatch(/confirmOverlap|requiresConfirmation/)
  })

  it('maneja Barrio no encontrado (404) y P2002 de alias duplicado (409)', () => {
    expect(source).toMatch(/BarrioNoEncontradoError/)
    expect(source).toMatch(/404/)
    expect(source).toMatch(/P2002/)
  })

  it('crea con 201', () => {
    expect(source).toMatch(/201/)
  })
})
