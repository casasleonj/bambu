// @tests /api/barrios — F1 Barrio canónico (GET búsqueda, POST creación)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/barrios/route.ts')
const source = readFileSync(routePath, 'utf-8')

const getStart = source.indexOf('export async function GET')
const postStart = source.indexOf('export async function POST')
const getSource = source.substring(getStart, postStart)
const postSource = source.substring(postStart)

describe('GET /api/barrios — estructura', () => {
  it('exporta una función GET', () => {
    expect(getSource).toMatch(/export\s+async\s+function\s+GET\s*\(/)
  })

  it('requiere autenticación (cualquier rol puede buscar barrios)', () => {
    expect(getSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('delega la búsqueda a buscarBarrios (sin fuzzy matching propio)', () => {
    expect(getSource).toMatch(/buscarBarrios\s*\(/)
  })

  it('por defecto no incluye inactivos salvo incluirInactivos=1', () => {
    expect(getSource).toMatch(/incluirInactivos.*===\s*['"]1['"]/)
  })
})

describe('POST /api/barrios — estructura', () => {
  it('exporta una función POST', () => {
    expect(postSource).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(postSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('usa BarrioCreateSchema para validar el body', () => {
    expect(postSource).toMatch(/BarrioCreateSchema\.parse\s*\(/)
  })

  it('crea vía crearBarrio (no hace su propio pre-check de unicidad)', () => {
    expect(postSource).toMatch(/crearBarrio\s*\(/)
    expect(postSource).not.toMatch(/buscarBarrioExacto/)
  })

  it('maneja P2002 (unique constraint violation) → 409', () => {
    expect(postSource).toMatch(/P2002/)
    expect(postSource).toMatch(/Ya existe un barrio con ese nombre/)
    expect(postSource).toMatch(/409/)
  })

  it('loggea la creación via logAudit con entidad Barrio', () => {
    expect(postSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]Barrio['"]/)
    expect(postSource).toMatch(/accion:\s*['"]CREATE['"]/)
  })

  it('devuelve 201 con el barrio creado', () => {
    expect(postSource).toMatch(/apiSuccess\s*\(\s*\{\s*barrio\s*\}\s*,\s*201\s*\)/)
  })
})
