// @tests CancelarPedidoUseCase — F-N8 fix verification
// Hallazgo: `facturaRepo.anularByPedidoId()` se llamaba SIN `tx`,
// anulando la factura en una transacción separada de la outer.
// Si la tx outer hacia rollback, la factura quedaba anulada pero el
// pedido NO → estado inconsistente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useCasePath = join(
  process.cwd(),
  'src/modules/pedidos/application/use-cases/CancelarPedidoUseCase.ts'
)
const source = readFileSync(useCasePath, 'utf-8')

describe('F-N8: anularByPedidoId se llama DENTRO de la tx', () => {
  it('FIX: la llamada a anularByPedidoId incluye `tx` como segundo argumento', () => {
    // Extraer substring desde "anularByPedidoId(" y contar paréntesis
    // balanceados para encontrar el cierre real de la función.
    const startIdx = source.indexOf('anularByPedidoId(')
    expect(startIdx).toBeGreaterThan(-1)

    let depth = 0
    let endIdx = startIdx
    for (let i = startIdx; i < source.length; i++) {
      if (source[i] === '(') depth++
      if (source[i] === ')') {
        depth--
        if (depth === 0) {
          endIdx = i
          break
        }
      }
    }
    const callLine = source.substring(startIdx, endIdx + 1)
    // Debe pasar `tx` además de `pedido.id.get()`
    expect(callLine).toMatch(/pedido\.id\.get\(\)/)
    expect(callLine).toMatch(/,\s*tx\)/)
  })

  it('FIX: la llamada está DENTRO del callback de txManager.execute', () => {
    // Encontrar el bloque de la tx
    const txOpen = source.indexOf('this.txManager.execute(')
    const txClose = source.lastIndexOf('})')  // cierre del callback

    // Encontrar la llamada a anularByPedidoId
    const callIdx = source.indexOf('anularByPedidoId(')

    expect(txOpen).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(txOpen)
    expect(callIdx).toBeLessThan(txClose)
  })

  it('FIX: hay un comentario F-N8 explicando el fix', () => {
    expect(source).toMatch(/FIX F-N8/)
    // El comentario debe mencionar rollback + estado inconsistente
    expect(source).toMatch(/rollback|inconsistente/)
  })
})

describe('F-N8: la signature del repo acepta tx', () => {
  // Esto es un test de contrato: la firma del método DEBE aceptar tx
  // para que el fix sea posible. Si cambia la firma, este test falla.
  it('FIX: IFacturaRepository.anularByPedidoId acepta tx como 2do arg', () => {
    const repoPath = join(
      process.cwd(),
      'src/modules/pedidos/domain/repositories/IFacturaRepository.ts'
    )
    const repoSource = readFileSync(repoPath, 'utf-8')
    expect(repoSource).toMatch(
      /anularByPedidoId\([^)]*pedidoId:\s*string\s*,\s*tx\??:\s*TransactionClient\)/
    )
  })
})

describe('F-N8: comparación con AnularPedidoUseCase (mismo fix aplicado)', () => {
  it('FIX: AnularPedidoUseCase ya pasa `tx` (F-N8 sigue el mismo patrón)', () => {
    const path = join(
      process.cwd(),
      'src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts'
    )
    const source = readFileSync(path, 'utf-8')
    const startIdx = source.indexOf('anularByPedidoId(')
    let depth = 0
    let endIdx = startIdx
    for (let i = startIdx; i < source.length; i++) {
      if (source[i] === '(') depth++
      if (source[i] === ')') {
        depth--
        if (depth === 0) {
          endIdx = i
          break
        }
      }
    }
    const callLine = source.substring(startIdx, endIdx + 1)
    expect(callLine).toMatch(/,\s*tx\)/)
  })
})
