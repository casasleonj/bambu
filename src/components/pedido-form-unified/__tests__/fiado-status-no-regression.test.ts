import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Anti-regression static test for C-FIADOS-1.
 *
 * The form must not fetch `/api/pedidos?all=true&cliente=` to compute the
 * fiado limit, because the API reads `clienteId`, not `cliente`. That mismatch
 * caused the form to display the global pending-fiado count instead of the
 * per-client count. The fix delegates the calculation to
 * `/api/clientes/[id]/fiado-status`.
 */
describe('pedido-form-unified fiado status regression', () => {
  const sourcePath = resolve(__dirname, '../index.tsx')
  const source = readFileSync(sourcePath, 'utf-8')

  it('does not fetch /api/pedidos with the broken cliente query param', () => {
    const brokenPatterns = [
      '/api/pedidos?all=true&cliente=',
      '"/api/pedidos?all=true',
      "'/api/pedidos?all=true",
    ]

    for (const pattern of brokenPatterns) {
      expect(source).not.toContain(pattern)
    }
  })

  it('fetches the dedicated fiado-status endpoint', () => {
    expect(source).toContain('/api/clientes/${capturedId}/fiado-status')
  })
})
