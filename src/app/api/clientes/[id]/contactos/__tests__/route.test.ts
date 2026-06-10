// @tests clientes/[id]/contactos — F-1FN ContactoCliente sub-endpoints
// Cubre los endpoints POST y DELETE que cierran el gap del CRUD UI
// después de la migración 1FN (Fase 3, donde `Cliente.contactos Json?`
// fue dropeada).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/[id]/contactos/route.ts')
const deletePath = join(process.cwd(), 'src/app/api/clientes/[id]/contactos/[contactoId]/route.ts')
const routeSource = readFileSync(routePath, 'utf-8')
const deleteSource = readFileSync(deletePath, 'utf-8')

describe('POST /api/clientes/[id]/contactos — estructura', () => {
  it('exporta una función POST', () => {
    expect(routeSource).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('requiere autenticación', () => {
    expect(routeSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(routeSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('usa el ContactoAlternativoSchema para validar el body', () => {
    expect(routeSource).toMatch(/ContactoAlternativoSchema\.parse\s*\(/)
  })

  it('verifica que el cliente existe y está activo antes de crear', () => {
    // El check es: prisma.cliente.findUnique con where: { id, activo: true }
    expect(routeSource).toMatch(/prisma\.cliente\.findUnique\s*\(\s*\{[\s\S]*?where:\s*\{\s*id,\s*activo:\s*true\s*\}/)
  })

  it('crea el contacto con prisma.contactoCliente.create', () => {
    expect(routeSource).toMatch(/prisma\.contactoCliente\.create\s*\(\s*\{/)
  })

  it('mapea clienteId del param (no del body)', () => {
    // Seguridad: el clienteId viene de params.id, no del body
    expect(routeSource).toMatch(/clienteId:\s*id/)
  })

  it('maneja P2002 (unique constraint violation) → 409', () => {
    expect(routeSource).toMatch(/P2002/)
    expect(routeSource).toMatch(/Ya existe un contacto con ese tel[eé]fono/)
  })

  it('maneja P2003 (FK violation) → 404', () => {
    expect(routeSource).toMatch(/P2003/)
  })

  it('loggea la creación via logAudit', () => {
    expect(routeSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]ContactoCliente['"]/)
  })

  it('devuelve 201 con el contacto creado', () => {
    expect(routeSource).toMatch(/apiSuccess\s*\(\s*\{\s*contacto\s*\}\s*,\s*201\s*\)/)
  })
})

describe('DELETE /api/clientes/[id]/contactos/[contactoId] — estructura', () => {
  it('exporta una función DELETE', () => {
    expect(deleteSource).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
  })

  it('requiere autenticación', () => {
    expect(deleteSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(deleteSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('verifica que el contacto pertenece al cliente antes de borrar', () => {
    // Seguridad: no permite borrar un contacto de otro cliente
    expect(deleteSource).toMatch(/contacto\.clienteId\s*!==\s*id/)
  })

  it('devuelve 404 si el contacto no existe O pertenece a otro cliente', () => {
    // No leak info: ambos casos devuelven el mismo 404
    const notFoundCount = (deleteSource.match(/apiError\s*\(\s*['"]Contacto no encontrado['"]\s*,\s*404\s*\)/g) || []).length
    expect(notFoundCount).toBeGreaterThanOrEqual(2)
  })

  it('borra con prisma.contactoCliente.delete (no deleteMany)', () => {
    expect(deleteSource).toMatch(/prisma\.contactoCliente\.delete\s*\(\s*\{/)
  })

  it('loggea el borrado via logAudit', () => {
    expect(deleteSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]ContactoCliente['"]/)
  })
})

describe('POST/DELETE comparten el patrón de Auth.js v5', () => {
  it('ambos verifican auth antes de role (orden recomendado)', () => {
    // requireAuth se llama antes que requireRole en ambos
    const authPos = routeSource.indexOf('requireAuth')
    const rolePos = routeSource.indexOf('requireRole')
    expect(authPos).toBeGreaterThan(-1)
    expect(rolePos).toBeGreaterThan(authPos)

    const authPosD = deleteSource.indexOf('requireAuth')
    const rolePosD = deleteSource.indexOf('requireRole')
    expect(authPosD).toBeGreaterThan(-1)
    expect(rolePosD).toBeGreaterThan(authPosD)
  })
})
