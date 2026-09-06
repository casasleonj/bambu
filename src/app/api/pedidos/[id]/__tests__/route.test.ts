// @tests hallazgo antifraude 2026-09-06 (revisión ALS/Plan Técnico UX de
// Pedidos): PUT /api/pedidos/[id] editaba items/precio/estado sin
// `requireRole` — el comentario de `requireOwnership` (auth-check.ts) ya
// documentaba "write operations are still blocked at the route handler
// level via requireRole([ADMIN, ASISTENTE])", pero esa llamada nunca
// existió en esta route. Mismo patrón de test que
// resolver-disputa/__tests__/route.test.ts (commit 3.1 plan antifraude):
// verificación estática sobre el código fuente, no ejecución del handler
// (evita el overhead de mockear next/server completo para un chequeo de
// forma).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/[id]/route.ts')
const routeSource = readFileSync(routePath, 'utf-8')

describe('PUT /api/pedidos/[id]: SEGURIDAD (hallazgo antifraude 2026-09-06)', () => {
  it('FIX: el PUT llama requireRole([ADMIN, ASISTENTE]) antes de mutar', () => {
    const putFn = routeSource.match(/export async function PUT[\s\S]*?\n}\n/)
    expect(putFn).not.toBeNull()
    expect(putFn![0]).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('FIX: el PUT mapea PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD a 409 (no 500 genérico)', () => {
    expect(routeSource).toMatch(/PEDIDO_CERRADO_USE_AJUSTAR_CANTIDAD/)
  })

  it('FIX: el PUT mapea CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD a 409 (no 500 genérico)', () => {
    expect(routeSource).toMatch(/CANTIDAD_YA_ENTREGADA_USE_AJUSTAR_CANTIDAD/)
  })
})

describe('requireOwnership("pedido", ...): ASISTENTE debe poder gestionar cualquier pedido', () => {
  // Sin esta línea, ASISTENTE recibía 403 de requireOwnership en CUALQUIER
  // GET/PUT /api/pedidos/[id] (fallback exige ser el Trabajador dueño del
  // embarque del pedido, nunca cierto para un ASISTENTE) pese a que la UI
  // de /pedidos permite editar pedidos para ese rol sin distinción.
  const authCheckPath = join(process.cwd(), 'src/lib/auth-check.ts')
  const authCheckSource = readFileSync(authCheckPath, 'utf-8')

  it("FIX: requireOwnership incluye el bypass ASISTENTE también para entity === 'pedido'", () => {
    const match = authCheckSource.match(/if \(user\.role === 'ASISTENTE'[\s\S]{0,120}\) return true;/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatch(/entity === 'pedido'/)
  })
})
