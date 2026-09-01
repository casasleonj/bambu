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

describe('PrismaPedidoRepository: filtro de canal (G6)', () => {
  it('buildWhere usa filter.canal y traduce filter.tipo (legacy)', () => {
    expect(source).toMatch(/filter\?\.canal/)
    expect(source).toMatch(/filter\?\.tipo/)
    // legacy: PUNTO→PUNTO, resto→DOMICILIO
    expect(source).toMatch(/'PUNTO'\s*\?\s*'PUNTO'\s*:\s*'DOMICILIO'/)
  })

  it('buildWhere aplica where.canal (valor único o { in: [...] })', () => {
    expect(source).toMatch(/where\.canal\s*=\s*\[\.\.\.canalValues\]\[0\]/)
    expect(source).toMatch(/where\.canal\s*=\s*\{\s*in:\s*\[\.\.\.canalValues\]\s*\}/)
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
