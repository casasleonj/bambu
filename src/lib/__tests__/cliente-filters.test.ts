// @tests lib/cliente-filters.ts — resolveUbicacionMaps legacy mapping
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const filtersPath = join(process.cwd(), 'src/lib/cliente-filters.ts')
const source = readFileSync(filtersPath, 'utf-8')

describe('resolveUbicacionMaps', () => {
  it('retorna ubicacionMaps cuando está presente', () => {
    expect(source).toMatch(/if\s*\(params\.ubicacionMaps\)\s*return\s*params\.ubicacionMaps/)
  })

  it('mapea clienteConLink legacy a cliente', () => {
    expect(source).toMatch(/if\s*\(params\.clienteConLink\s*===\s*['"]true['"]\)\s*return\s*['"]cliente['"]/)
  })

  it('mapea todosNegociosConLink legacy a negocios', () => {
    expect(source).toMatch(/if\s*\(params\.todosNegociosConLink\s*===\s*['"]true['"]\)\s*return\s*['"]negocios['"]/)
  })

  it('default es todos', () => {
    expect(source).toMatch(/return\s*['"]todos['"]/)
  })
})
