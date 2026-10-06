// @tests /api/zonas/[id] — F3 Zona territorial (GET detalle, PATCH rename/archivo/reactivación)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/zonas/[id]/route.ts')
const source = readFileSync(routePath, 'utf-8')

const getStart = source.indexOf('export async function GET')
const patchStart = source.indexOf('export async function PATCH')
const getSource = source.substring(getStart, patchStart)
const patchSource = source.substring(patchStart)

describe('GET /api/zonas/[id] — estructura', () => {
  it('exporta una función GET, gateada por view:configuracion', () => {
    expect(getSource).toMatch(/export\s+async\s+function\s+GET\s*\(/)
    expect(getSource).toMatch(/requirePermission\s*\(\s*['"]view:configuracion['"]\s*\)/)
  })

  it('devuelve 404 si la zona no existe', () => {
    expect(getSource).toMatch(/404/)
  })

  it('delega a obtenerZonaConBarrios (incluye la vista inversa Barrio->Zonas)', () => {
    expect(getSource).toMatch(/obtenerZonaConBarrios\s*\(/)
  })
})

describe('PATCH /api/zonas/[id] — estructura', () => {
  it('exporta una función PATCH, restringida a ADMIN', () => {
    expect(patchSource).toMatch(/export\s+async\s+function\s+PATCH\s*\(/)
    expect(patchSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('usa ZonaUpdateSchema para validar el body', () => {
    expect(patchSource).toMatch(/ZonaUpdateSchema\.parse\s*\(/)
  })

  it('cubre rename y archivo/reactivación por separado, vía el servicio (no update directo de Prisma)', () => {
    expect(patchSource).toMatch(/renombrarZona\s*\(/)
    expect(patchSource).toMatch(/archivarZona\s*\(/)
    expect(patchSource).toMatch(/reactivarZona\s*\(/)
  })

  it('maneja ZonaNoEncontradaError → 404 y P2002 → 409', () => {
    expect(patchSource).toMatch(/ZonaNoEncontradaError/)
    expect(patchSource).toMatch(/404/)
    expect(patchSource).toMatch(/P2002/)
    expect(patchSource).toMatch(/409/)
  })
})
