// @tests api/precios/resolver/route.ts — negocio-aware price resolution
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/precios/resolver/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('resolver route: negocio-aware overrides', () => {
  it('acepta negocioId en el schema de Zod', () => {
    const schemaMatch = source.match(/const PrecioResolverSchema[\s\S]+?\.refine/)
    expect(schemaMatch).not.toBeNull()
    expect(schemaMatch![0]).toMatch(/negocioId:\s*z\.string\(\)\.min\(1\)\.optional\(\)/)
  })

  it('busca negocio.preciosEspeciales con clienteId guard', () => {
    expect(source).toMatch(/negocio\.findUnique\(/)
    expect(source).toMatch(/preciosEspeciales:\s*true,\s*clienteId:\s*true/)
  })

  it('ignora precios del negocio si no pertenece al cliente', () => {
    expect(source).toMatch(/negocio\?\.clienteId\s*===\s*clienteId/)
  })

  it('prioridad negocio → cliente: negocio primero, cliente como fallback', () => {
    const negocioBlock = source.match(/if\s*\(negocioId\)\s*\{[\s\S]+?\n\s*\}/)?.[0] || ''
    const clienteBlock = source.substring(source.indexOf('if (!clienteOverrides)'))
    expect(negocioBlock).toMatch(/negocio\.findUnique/)
    expect(clienteBlock).toMatch(/cliente\.findUnique/)
  })

  it('pasa negocioId al resolver en modo batch', () => {
    // La variable negocioId debe venir del destructuring del body
    expect(source).toMatch(/const\s*\{\s*canal,\s*clienteId,\s*negocioId\s*\}/)
  })
})
