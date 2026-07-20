// @tests use-pedidos.ts — race condition guard (Bug 6)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const hookPath = join(process.cwd(), 'src/hooks/use-pedidos.ts')
const source = readFileSync(hookPath, 'utf-8')

describe('FIX Bug 6: usePedidos ignora resultados de requests stale', () => {
  it('FIX: incrementa un requestId por fetch y lo compara con una ref actual', () => {
    expect(source).toMatch(/requestIdRef\.current/)
    expect(source).toMatch(/\+\+requestIdRef\.current/)
    expect(source).toMatch(/requestIdRef\.current\s*===\s*requestId/)
  })

  it('FIX: abandona si el request ya fue superado antes de empezar', () => {
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return/)
  })

  it('FIX: no aplica setError/setLoading/setPedidos si el request es stale', () => {
    // Cada estado mutante debe estar guardado por isCurrent()
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return[\s\S]*setPedidos/)
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return[\s\S]*setError/)
    expect(source).toMatch(/if\s*\(\s*isCurrent\(\)\)\s*setLoading\(\s*false\s*\)/)
  })

  it('FIX: limpia error explicitamente en el camino de exito', () => {
    expect(source).toMatch(/setError\(\s*null\s*\)/)
  })
})
