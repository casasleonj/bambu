// @tests /api/zonas/[id]/barrios — F3 Zona territorial: agregar Barrio con
// contrato de solapamiento (ALS §7-8).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/zonas/[id]/barrios/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('POST /api/zonas/[id]/barrios — estructura', () => {
  it('exporta una función POST, restringida a ADMIN', () => {
    expect(source).toMatch(/export\s+async\s+function\s+POST\s*\(/)
    expect(source).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('usa ZonaBarrioAddSchema para validar el body (sin source/createdBy como input)', () => {
    expect(source).toMatch(/ZonaBarrioAddSchema\.parse\s*\(/)
    expect(source).not.toMatch(/data\.source|body\.source|data\.createdBy|body\.createdBy/)
  })

  it('delega la decisión de solapamiento a agregarBarrioAZona (no decide overlap en la ruta)', () => {
    expect(source).toMatch(/agregarBarrioAZona\s*\(/)
  })

  it('cuando requiere confirmación, responde sin crear (200, no 201) con el contrato exacto del ALS', () => {
    expect(source).toMatch(/requires_confirmation/)
    expect(source).toMatch(/overlapDetected:\s*true/)
    expect(source).toMatch(/requiresConfirmation:\s*true/)
    expect(source).toMatch(/existingZones:\s*resultado\.existingZones/)
  })

  it('cuando crea, responde 201', () => {
    expect(source).toMatch(/201/)
  })

  it('el usuarioId sale de la sesión autenticada, nunca del body', () => {
    expect(source).toMatch(/authResult\.user/)
    expect(source).not.toMatch(/body\.usuarioId|data\.usuarioId/)
  })

  it('maneja Zona/Barrio no encontrados (404) y P2002 de duplicado en la misma zona (409)', () => {
    expect(source).toMatch(/ZonaNoEncontradaError/)
    expect(source).toMatch(/BarrioNoEncontradoError/)
    expect(source).toMatch(/404/)
    expect(source).toMatch(/P2002/)
    expect(source).toMatch(/409/)
  })
})
