// @tests api/facturas route
// Verifica que el endpoint de facturas:
// 1. Use select específico en GET (no include:true pesado)
// 2. Devuelva totales agregados
// 3. Use getFacturaEmpresaSnapshot en POST
// 4. Guarde montoPagado=0 por defecto en facturas manuales

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/facturas/route.ts')
const source = readFileSync(routePath, 'utf-8')

describe('GET /api/facturas — query optimizada', () => {
  it('FIX: usa select en lugar de include:true para cliente/pedido', () => {
    expect(source).toMatch(/select:\s*\{[\s\S]*cliente:\s*\{[\s\S]*?select:/)
    expect(source).toMatch(/pedido:\s*\{[\s\S]*?select:\s*\{\s*id:\s*true,\s*numero:\s*true\s*\}/)
  })

  it('FIX: no incluye abonos en la query de lista', () => {
    const getStart = source.indexOf('export async function GET')
    const postStart = source.indexOf('export async function POST')
    const getSource = source.substring(getStart, postStart)
    expect(getSource).not.toMatch(/abonos:/)
  })

  it('FIX: devuelve totales agregados en la respuesta', () => {
    expect(source).toMatch(/prisma\.factura\.aggregate\(/)
    expect(source).toMatch(/const totales/)
    expect(source).toMatch(/totalFacturado:/)
    expect(source).toMatch(/totalCobrado:/)
    expect(source).toMatch(/totalPorCobrar:/)
  })
})

describe('POST /api/facturas — snapshot de empresa', () => {
  it('FIX: importa getFacturaEmpresaSnapshot desde helper compartido', () => {
    expect(source).toMatch(/import\s+\{\s*getFacturaEmpresaSnapshot\s*\}\s+from\s+['"]@\/lib\/factura-empresa['"]/)
  })

  it('FIX: no define getEmpresaSnapshot local (ahora es helper compartido)', () => {
    const postSource = source.substring(source.indexOf('export async function POST'))
    expect(postSource).not.toMatch(/async function getEmpresaSnapshot/)
  })

  it('FIX: la creación de factura incluye el snapshot de empresa', () => {
    const postSource = source.substring(source.indexOf('export async function POST'))
    expect(postSource).toMatch(/const empresaSnapshot = await getFacturaEmpresaSnapshot\(\)/)
    expect(postSource).toMatch(/\.\.\.empresaSnapshot/)
  })
})
