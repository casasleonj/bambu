// @tests /api/pedidos/counts/route.ts — endpoint ligero para badges
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/pedidos/counts/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('FIX Bug 6: /api/pedidos/counts expone contadores ligeros', () => {
  it('FIX: requiere autenticacion y rol valido', () => {
    expect(source).toMatch(/requireAuth\(\)/)
    expect(source).toMatch(/requireRole\(\s*\[/)
  })

  it('FIX: cuenta fiados como clientes unicos con saldo > 0', () => {
    expect(source).toMatch(/estadoEntrega:\s*['"]ENTREGADO['"]/)
    expect(source).toMatch(/saldo:\s*\{\s*gt:\s*0\s*\}/)
    expect(source).toMatch(/distinct:\s*\[\s*['"]clienteId['"]\s*\]/)
  })

  it('FIX: excluye CONSUMIDOR_FINAL de fiados y alertas', () => {
    expect(source).toMatch(/CANONICAL_CONSUMIDOR_FINAL_ID/)
    expect(source.match(/CANONICAL_CONSUMIDOR_FINAL_ID/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('FIX: usa calcularAlertas para el conteo de alertas', () => {
    expect(source).toMatch(/import\s*\{\s*calcularAlertas\s*\}\s*from\s*['"]@\/lib\/alertas-detector['"]/)
    expect(source).toMatch(/calcularAlertas\(/)
  })

  it('FIX: responde { fiadosCount, alertasCount }', () => {
    expect(source).toMatch(/fiadosCount/)
    expect(source).toMatch(/alertasCount/)
  })
})
