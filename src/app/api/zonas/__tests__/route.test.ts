// @tests /api/zonas — F3 Zona territorial (GET búsqueda, POST creación)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/zonas/route.ts')
const source = readFileSync(routePath, 'utf-8')

const getStart = source.indexOf('export async function GET')
const postStart = source.indexOf('export async function POST')
const getSource = source.substring(getStart, postStart)
const postSource = source.substring(postStart)

describe('GET /api/zonas — estructura', () => {
  it('exporta una función GET', () => {
    expect(getSource).toMatch(/export\s+async\s+function\s+GET\s*\(/)
  })

  it('gatea por el permiso view:configuracion (reutiliza la matriz existente, no un rol nuevo)', () => {
    expect(getSource).toMatch(/requirePermission\s*\(\s*['"]view:configuracion['"]\s*\)/)
  })

  it('delega la búsqueda a buscarZonas', () => {
    expect(getSource).toMatch(/buscarZonas\s*\(/)
  })
})

describe('POST /api/zonas — estructura', () => {
  it('exporta una función POST', () => {
    expect(postSource).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('restringe a ADMIN únicamente (más estricto que Barrio, decisión explícita)', () => {
    expect(postSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
    expect(postSource).not.toMatch(/ROLES\.ASISTENTE/)
  })

  it('usa ZonaCreateSchema para validar el body', () => {
    expect(postSource).toMatch(/ZonaCreateSchema\.parse\s*\(/)
  })

  it('crea vía crearZona (no hace su propio pre-check de unicidad)', () => {
    expect(postSource).toMatch(/crearZona\s*\(/)
  })

  it('maneja P2002 (unique constraint violation) → 409', () => {
    expect(postSource).toMatch(/P2002/)
    expect(postSource).toMatch(/409/)
  })

  it('el usuarioId de la auditoría sale de la sesión, nunca del body', () => {
    expect(postSource).not.toMatch(/body\.usuarioId|data\.usuarioId|body\.createdBy|data\.createdBy/)
    expect(postSource).toMatch(/authResult\.user/)
  })

  it('devuelve 201 con la zona creada', () => {
    expect(postSource).toMatch(/apiSuccess\s*\(\s*\{\s*zona\s*\}\s*,\s*201\s*\)/)
  })
})
