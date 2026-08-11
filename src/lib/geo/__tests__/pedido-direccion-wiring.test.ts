// @tests Step 7c — los 5 consumidores de dirección efectiva pasan
// direccionEntrega/barrioEntrega como override a pickDireccionTexto.
// embarques y repartidor tienen su propia suite (direccion-negocio.test.ts,
// direccion-repartidor.test.ts); acá se cubren los 3 restantes: SSR
// /pedidos, GET /api/pedidos, GET /api/pedidos/[id].

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function readSrc(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8')
}

describe('SSR /pedidos (page.tsx) pasa el snapshot como override', () => {
  const src = readSrc('src/app/(app)/pedidos/page.tsx')

  it('importa pickDireccionTexto', () => {
    expect(src).toMatch(/import \{ pickDireccionTexto \} from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('overrideDireccion/overrideBarrio vienen de p.direccionEntrega/p.barrioEntrega', () => {
    const idx = src.indexOf('const direccionEfectiva = pickDireccionTexto({')
    const block = src.slice(idx, src.indexOf('})', idx))
    expect(block).toMatch(/overrideDireccion:\s*p\.direccionEntrega/)
    expect(block).toMatch(/overrideBarrio:\s*p\.barrioEntrega/)
  })

  it('zonaCli/barrioCli usan la resolución (ya no el inline negocio??cliente)', () => {
    expect(src).toMatch(/zonaCli:\s*direccionEfectiva\.direccion/)
    expect(src).toMatch(/barrioCli:\s*direccionEfectiva\.barrio/)
  })
})

describe('GET /api/pedidos pasa el snapshot como override', () => {
  const src = readSrc('src/app/api/pedidos/route.ts')

  it('importa pickDireccionTexto', () => {
    expect(src).toMatch(/import \{ pickDireccionTexto \} from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('overrideDireccion/overrideBarrio vienen de p.direccionEntrega/p.barrioEntrega', () => {
    const idx = src.indexOf('const direccionEfectiva = pickDireccionTexto({')
    const block = src.slice(idx, src.indexOf('})', idx))
    expect(block).toMatch(/overrideDireccion:\s*p\.direccionEntrega/)
    expect(block).toMatch(/overrideBarrio:\s*p\.barrioEntrega/)
  })

  it('zonaCli/barrioCli usan la resolución', () => {
    expect(src).toMatch(/zonaCli:\s*direccionEfectiva\.direccion/)
    expect(src).toMatch(/barrioCli:\s*direccionEfectiva\.barrio/)
  })
})

describe('GET /api/pedidos/[id] pasa el snapshot como override', () => {
  const src = readSrc('src/app/api/pedidos/[id]/route.ts')

  it('importa pickDireccionTexto', () => {
    expect(src).toMatch(/import \{ pickDireccionTexto \} from '@\/lib\/geo\/pedido-direccion'/)
  })

  it('overrideDireccion/overrideBarrio vienen del dto (dto.direccionEntrega/dto.barrioEntrega)', () => {
    const idx = src.indexOf('const direccionEfectiva = pickDireccionTexto({')
    const block = src.slice(idx, src.indexOf('})', idx))
    expect(block).toMatch(/overrideDireccion:\s*dto\.direccionEntrega/)
    expect(block).toMatch(/overrideBarrio:\s*dto\.barrioEntrega/)
  })

  it('zonaCli/barrioCli usan la resolución', () => {
    expect(src).toMatch(/zonaCli:\s*direccionEfectiva\.direccion/)
    expect(src).toMatch(/barrioCli:\s*direccionEfectiva\.barrio/)
  })
})
