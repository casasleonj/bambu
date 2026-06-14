// @tests pedidos resolver-disputa — commit 3.1 plan antifraude
// Hallazgo 2: el REPARTIDOR podia cerrar su propia disputa via
// PATCH /api/pedidos/[id] con disputaAbierta=false (vector de fraude).
// Este endpoint dedicado requiere ADMIN/ASISTENTE y registra audit.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(
  process.cwd(),
  'src/app/api/pedidos/[id]/resolver-disputa/route.ts',
)

const routeSource = readFileSync(routePath, 'utf-8')

describe('resolver-disputa: SEGURIDAD (commit 3.1)', () => {
  it('FIX: la route llama requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('FIX: la route usa POST (no PATCH) para que el REPARTIDOR no pueda usar el endpoint generico', () => {
    expect(routeSource).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('FIX: la route registra audit con casoId (commit 0e)', () => {
    // El logAudit debe incluir casoId para vincular la timeline del caso
    expect(routeSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?casoId[\s\S]*?\}\s*\)/)
  })

  it('FIX: el cambio registra valorAnterior=true, valorNuevo=false (forense)', () => {
    expect(routeSource).toMatch(/valorAnterior:\s*true/)
    expect(routeSource).toMatch(/valorNuevo:\s*false/)
  })

  it('FIX: la route es idempotente (si ya estaba cerrada, retorna 200 sin cambios)', () => {
    expect(routeSource).toMatch(/yaCerrada/)
  })
})

describe('resolver-disputa: schema del generic PATCH (backward safety)', () => {
  // Confirmamos que el PATCH generico NO acepta disputaAbierta (asi
  // no hay forma de cerrar disputa via PATCH, solo via el nuevo endpoint
  // con role check).
  const validatorsPath = join(process.cwd(), 'src/lib/validators.ts')
  const validatorsSource = readFileSync(validatorsPath, 'utf-8')

  it('FIX: PedidoUpdateSchema NO incluye disputaAbierta (Zod lo strippea)', () => {
    // Extraemos el bloque PedidoUpdateSchema
    const match = validatorsSource.match(/export const PedidoUpdateSchema[\s\S]*?\}\s*\n/)
    expect(match).not.toBeNull()
    // El schema NO debe mencionar disputaAbierta
    expect(match![0]).not.toMatch(/disputaAbierta/)
  })
})
