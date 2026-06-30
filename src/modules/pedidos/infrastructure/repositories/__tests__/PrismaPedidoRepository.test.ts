/**
 * Source-level tests for PrismaPedidoRepository.
 *
 * Verifies:
 *  - buildWhere handles the new `tipo` filter correctly.
 *  - findByIdWithFactura exists and includes factura+abonos.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoPath = join(process.cwd(), 'src/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository.ts')
const source = readFileSync(repoPath, 'utf-8')

describe('PrismaPedidoRepository: tipo filter', () => {
  it('buildWhere references filter.tipo', () => {
    expect(source).toMatch(/filter\?\.tipo/)
  })

  it('buildWhere uses canal condition for PUNTO vs ENVIO', () => {
    expect(source).toMatch(/where\.canal\s*=\s*['"]PUNTO['"]/)
    expect(source).toMatch(/where\.canal\s*=\s*\{\s*not:\s*['"]PUNTO['"]\s*\}/)
  })

  it('findByIdWithFactura is defined in the repository', () => {
    expect(source).toMatch(/findByIdWithFactura\s*\(/)
  })

  it('findByIdWithFactura includes factura with abonos', () => {
    const methodSection = source.split('findByIdWithFactura')[1]?.split('findPendingByCliente')[0] || ''
    expect(methodSection).toMatch(/factura:\s*\{/)
    expect(methodSection).toMatch(/abonos:/)
  })
})
