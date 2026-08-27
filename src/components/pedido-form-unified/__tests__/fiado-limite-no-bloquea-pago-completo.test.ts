import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Anti-regresión: el botón de submit no debe deshabilitarse por límite de
 * fiados (fiadosStatus.nivel === 'limite') cuando el pedido que se está
 * creando se paga completo (saldoPendiente === 0) — ej. Venta Rápida
 * cobrada en el momento a un cliente que ya tiene deuda histórica al
 * límite. El límite existe para frenar más deuda, no para bloquear ventas
 * ya pagadas. Ver CrearPedidoUseCase (mismo criterio en el servidor).
 */
describe('pedido-form-unified: límite de fiados no bloquea pago completo', () => {
  const sourcePath = resolve(__dirname, '../index.tsx')
  const source = readFileSync(sourcePath, 'utf-8')

  it('el disabled del submit combina nivel === limite con saldoPendiente > 0', () => {
    const idx = source.indexOf('data-testid="submit-pedido"')
    expect(idx).toBeGreaterThan(-1)
    const block = source.slice(idx, idx + 400)
    expect(block).toMatch(/fiadosStatus\?\.nivel === 'limite' && saldoPendiente > 0/)
  })
})
