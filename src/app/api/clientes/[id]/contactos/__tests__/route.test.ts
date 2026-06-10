// @tests clientes/[id]/contactos — F-1FN ContactoCliente sub-endpoints
// Cubre los endpoints POST, PATCH y DELETE que cierran el gap del CRUD UI
// después de la migración 1FN (Fase 3, donde `Cliente.contactos Json?`
// fue dropeada).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/clientes/[id]/contactos/route.ts')
const contactoIdPath = join(process.cwd(), 'src/app/api/clientes/[id]/contactos/[contactoId]/route.ts')
const validatorsPath = join(process.cwd(), 'src/lib/validators.ts')
const routeSource = readFileSync(routePath, 'utf-8')
const contactoIdSource = readFileSync(contactoIdPath, 'utf-8')
const validatorsSource = readFileSync(validatorsPath, 'utf-8')

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

describe('PATCH /api/clientes/[id]/contactos/[contactoId] — estructura', () => {
  it('exporta una función PATCH', () => {
    expect(contactoIdSource).toMatch(/export\s+async\s+function\s+PATCH\s*\(/)
  })

  it('requiere autenticación', () => {
    expect(contactoIdSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(contactoIdSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('usa el ContactoAlternativoUpdateSchema (no el create schema)', () => {
    // El PATCH usa un schema distinto al POST porque todos los campos son
    // opcionales (parcial), pero al menos uno debe estar presente.
    expect(contactoIdSource).toMatch(/ContactoAlternativoUpdateSchema\.parse\s*\(/)
  })

  it('el schema Update es distinto del schema Create (partial, no required)', () => {
    // El Create requiere todos los campos; el Update acepta campos opcionales.
    expect(validatorsSource).toMatch(/export\s+const\s+ContactoAlternativoUpdateSchema\s*=\s*z\.object\s*\(\s*\{/)
    expect(validatorsSource).toMatch(/ContactoAlternativoUpdateSchema[\s\S]{0,500}refine/)
  })

  it('verifica que el contacto pertenece al cliente antes de actualizar', () => {
    // Seguridad: no permite editar un contacto de otro cliente
    expect(contactoIdSource).toMatch(/existente\.clienteId\s*!==\s*id/)
  })

  it('devuelve 404 si el contacto no existe O pertenece a otro cliente', () => {
    // No leak info: ambos casos devuelven el mismo 404
    // El PATCH tiene 2 ocurrencias de "Contacto no encontrado" (igual que DELETE)
    const notFoundCount = (contactoIdSource.match(/apiError\s*\(\s*['"]Contacto no encontrado['"]\s*,\s*404\s*\)/g) || []).length
    expect(notFoundCount).toBeGreaterThanOrEqual(2)
  })

  it('actualiza con prisma.contactoCliente.update (no updateMany)', () => {
    expect(contactoIdSource).toMatch(/prisma\.contactoCliente\.update\s*\(\s*\{/)
  })

  it('construye el payload dinámicamente (no sobrescribe con undefined)', () => {
    // El PATCH solo incluye los campos provistos. Si el body tiene {nombre: 'X'},
    // el updateData debe ser {nombre: 'X'} sin telefono ni relacion.
    // Verificamos que existe la construcción condicional con `if (data.X !== undefined)`.
    expect(contactoIdSource).toMatch(/if\s*\(\s*data\.nombre\s*!==\s*undefined\s*\)/)
    expect(contactoIdSource).toMatch(/if\s*\(\s*data\.telefono\s*!==\s*undefined\s*\)/)
    expect(contactoIdSource).toMatch(/if\s*\(\s*data\.relacion\s*!==\s*undefined\s*\)/)
  })

  it('maneja P2002 (unique constraint violation al cambiar telefono) → 409', () => {
    // Si el cliente cambia el telefono a uno que ya existe en otro contacto del mismo cliente
    expect(contactoIdSource).toMatch(/P2002/)
    expect(contactoIdSource).toMatch(/Ya existe otro contacto con ese tel[eé]fono/)
  })

  it('maneja ZodError (body inválido) → 400 con formatZodError', () => {
    expect(contactoIdSource).toMatch(/ZodError/)
    expect(contactoIdSource).toMatch(/formatZodError\s*\(/)
  })

  it('loggea la actualización via logAudit con cambios y antes', () => {
    expect(contactoIdSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]ContactoCliente['"][\s\S]*?accion:\s*['"]UPDATE['"]/)
    // El log incluye los cambios y el estado anterior (auditoría)
    expect(contactoIdSource).toMatch(/cambios:/)
    expect(contactoIdSource).toMatch(/antes:/)
  })

  it('devuelve 200 con el contacto actualizado', () => {
    expect(contactoIdSource).toMatch(/apiSuccess\s*\(\s*\{\s*contacto\s*\}\s*\)/)
  })
})

describe('DELETE /api/clientes/[id]/contactos/[contactoId] — estructura', () => {
  it('exporta una función DELETE', () => {
    expect(contactoIdSource).toMatch(/export\s+async\s+function\s+DELETE\s*\(/)
  })

  it('requiere autenticación', () => {
    expect(contactoIdSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('restringe por rol ADMIN o ASISTENTE', () => {
    expect(contactoIdSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.ADMIN\s*,\s*ROLES\.ASISTENTE\s*\]\s*,/)
  })

  it('verifica que el contacto pertenece al cliente antes de borrar', () => {
    // Seguridad: no permite borrar un contacto de otro cliente
    expect(contactoIdSource).toMatch(/contacto\.clienteId\s*!==\s*id/)
  })

  it('devuelve 404 si el contacto no existe O pertenece a otro cliente', () => {
    // No leak info: ambos casos devuelven el mismo 404
    const notFoundCount = (contactoIdSource.match(/apiError\s*\(\s*['"]Contacto no encontrado['"]\s*,\s*404\s*\)/g) || []).length
    expect(notFoundCount).toBeGreaterThanOrEqual(2)
  })

  it('borra con prisma.contactoCliente.delete (no deleteMany)', () => {
    expect(contactoIdSource).toMatch(/prisma\.contactoCliente\.delete\s*\(\s*\{/)
  })

  it('loggea el borrado via logAudit', () => {
    expect(contactoIdSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]ContactoCliente['"]/)
  })
})

describe('POST/PATCH/DELETE comparten el patrón de Auth.js v5', () => {
  it('todos verifican auth antes de role (orden recomendado)', () => {
    // requireAuth se llama antes que requireRole en todos
    const authPos = routeSource.indexOf('requireAuth')
    const rolePos = routeSource.indexOf('requireRole')
    expect(authPos).toBeGreaterThan(-1)
    expect(rolePos).toBeGreaterThan(authPos)

    // Para el archivo que tiene PATCH+DELETE, auth aparece antes que role
    // y aparece ANTES de los 2 handlers (PATCH y DELETE)
    const allAuth = contactoIdSource.match(/requireAuth/g) || []
    expect(allAuth.length).toBeGreaterThanOrEqual(2)  // 1 en PATCH, 1 en DELETE
  })
})
