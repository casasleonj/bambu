// Contract test del thin controller (guardrail ESTÁTICO auxiliar): rol,
// delegación, mapeo de errores, y la garantía read-only por inspección del
// fuente. La prueba PRIMARIA de read-only es comportamental — vive en
// src/lib/__tests__/integration/preview-pedido-integridad.test.ts.
// Mismo patrón que src/app/api/pedidos/[id]/gestionar-pendiente/__tests__/route.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/preview/route.ts'),
  'utf-8',
)

describe('POST /api/pedidos/preview — contract (guardrail estático)', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en previewPedidoUseCase (no reimplementa lógica)', () => {
    expect(routeSource).toMatch(/previewPedidoUseCase\.execute\(/)
  })

  it('valida con PreviewPedidoSchema antes de delegar', () => {
    expect(routeSource).toMatch(/PreviewPedidoSchema\.safeParse/)
  })

  it('inyecta actorId desde la sesión, no desde el body', () => {
    expect(routeSource).toMatch(/actorId\s*=\s*role\.user\?\.id/)
    expect(routeSource).toMatch(/\.\.\.parsed\.data,\s*actorId/)
  })

  it('mapea CLIENTE_NOT_FOUND y PEDIDO_ORIGEN_NOT_FOUND a 404', () => {
    expect(routeSource).toMatch(/CLIENTE_NOT_FOUND[\s\S]{0,160}404/)
    expect(routeSource).toMatch(/PEDIDO_ORIGEN_NOT_FOUND[\s\S]{0,160}404/)
  })

  it('READ-ONLY: no importa repos de escritura, TransactionManager, lock ni $transaction', () => {
    expect(routeSource).not.toMatch(/TransactionManager/)
    expect(routeSource).not.toMatch(/withAdvisoryLock|withLock|SECUENCIA:|CARTERA:|PEDIDO:/)
    expect(routeSource).not.toMatch(/\$transaction/)
    expect(routeSource).not.toMatch(/crearPedidoUseCase|actualizarPedidoUseCase|Repository\b/)
  })
})
