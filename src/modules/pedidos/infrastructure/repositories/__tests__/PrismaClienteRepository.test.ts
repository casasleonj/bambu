/**
 * Source-level tests for PrismaClienteRepository.updateDireccion.
 *
 * FIX: updateDireccion() tenía cero registro de auditoría — un UPDATE
 * directo sin ningún rastro de "antes/después". Verifica que ahora captura
 * el valor previo y llama logAudit con el diff real.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoPath = join(process.cwd(), 'src/modules/pedidos/infrastructure/repositories/PrismaClienteRepository.ts')
const source = readFileSync(repoPath, 'utf-8')

describe('PrismaClienteRepository.updateDireccion: auditoría', () => {
  const methodSection = source.split('async updateDireccion(')[1]?.split('async incrementarSaldoFavor')[0] || ''

  it('lee el valor previo antes de sobreescribir', () => {
    expect(methodSection).toMatch(/findUnique[\s\S]*select:\s*\{\s*direccion:\s*true,\s*barrio:\s*true/)
  })

  it('llama logAudit después del update con entidad Cliente', () => {
    expect(methodSection).toMatch(/logAudit\(\{/)
    expect(methodSection).toMatch(/entidad:\s*['"]Cliente['"]/)
    expect(methodSection).toMatch(/accion:\s*['"]UPDATE['"]/)
  })

  it('el audit incluye direccionAnterior/barrioAnterior (diff real, no solo el valor nuevo)', () => {
    expect(methodSection).toMatch(/direccionAnterior/)
    expect(methodSection).toMatch(/barrioAnterior/)
  })

  it('acepta meta opcional con usuarioId y pedidoId', () => {
    const signature = source.match(/async updateDireccion\(([\s\S]*?)\):\s*Promise<void>/)?.[1] || ''
    expect(signature).toMatch(/meta\?:\s*\{\s*usuarioId\?:\s*string\s*\|\s*null;\s*pedidoId\?:\s*string\s*\}/)
  })
})
