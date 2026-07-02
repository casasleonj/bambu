// @tests CancelarPedidoUseCase — F-N8 + cancelar-dedup fix verification
// Hallazgo 1: `facturaRepo.anularByPedidoId()` se llamaba SIN `tx`,
// anulando la factura en una transacción separada de la outer.
// Hallazgo 2: el dedup por estado CANCELADO estaba ausente; dos requests
// idénticas podían generar doble NC/factura.

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
    expect(callLine).toMatch(/pedido\.id\.get\(\)/)
    expect(callLine).toMatch(/,\s*tx\)/)
  })

  it('FIX: la llamada está DENTRO del callback de txManager.executeWithLock', () => {
    const lockOpen = source.indexOf("executeWithLock('NC'")
    const lockClose = source.lastIndexOf('})')
    const callIdx = source.indexOf('anularByPedidoId(')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(lockOpen)
    expect(callIdx).toBeLessThan(lockClose)
  })

  it('FIX: hay un comentario F-N8 explicando el fix', () => {
    expect(source).toMatch(/FIX F-N8/)
    expect(source).toMatch(/rollback|inconsistente/)
  })
})

describe('Cancelar dedup: el use case retorna idempotente cuando ya está CANCELADO', () => {
  it('FIX: verifica estadoEntrega === CANCELADO DENTRO del lock NC', () => {
    const lockOpen = source.indexOf("executeWithLock('NC'")
    const checkIdx = source.indexOf("estadoEntrega.get() === 'CANCELADO'")
    const lockClose = source.lastIndexOf('})')

    expect(lockOpen).toBeGreaterThan(-1)
    expect(checkIdx).toBeGreaterThan(lockOpen)
    expect(checkIdx).toBeLessThan(lockClose)
  })

  it('FIX: cuando está CANCELADO, retorna { pedido, deduped: true }', () => {
    expect(source).toMatch(/estadoEntrega\.get\(\)\s*===\s*['"]CANCELADO['"][\s\S]{0,300}return\s*\{[\s\S]+?deduped:\s*true/)
  })

  it('FIX: el motivo de la NC usa input.motivo o default CANCELADO', () => {
    expect(source).toMatch(/motivo:\s*input\.motivo\s*\|\|\s*['"]CANCELADO['"]/)
  })
})

describe('F-N8: la signature del repo acepta tx', () => {
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

describe('Paridad con AnularPedidoUseCase', () => {
  it('FIX: AnularPedidoUseCase ya usa executeWithLock y dedup (patrón canónico)', () => {
    const path = join(
      process.cwd(),
      'src/modules/pedidos/application/use-cases/AnularPedidoUseCase.ts'
    )
    const anularSource = readFileSync(path, 'utf-8')
    expect(anularSource).toMatch(/executeWithLock\(['"]NC['"]/)
    expect(anularSource).toMatch(/estadoEntrega\.get\(\)\s*===\s*['"]ANULADO['"]/)
    expect(anularSource).toMatch(/deduped:\s*true/)
  })
})
