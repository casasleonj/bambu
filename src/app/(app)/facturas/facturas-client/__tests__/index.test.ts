// @tests facturas-client/index.tsx — inspección de código fuente
// Verifica que la página de facturas corrija los bugs visibles sin depender
// de renderizado del componente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const pagePath = join(process.cwd(), 'src/app/(app)/facturas/facturas-client/index.tsx')
const source = readFileSync(pagePath, 'utf-8')

describe('FIX: lectura correcta de /api/config', () => {
  it('lee data directamente (apiSuccess hace spread, no envuelve en data)', () => {
    expect(source).not.toMatch(/const configs = data\.data \|\| \{\}/)
    expect(source).toMatch(/const configs = data/)
  })
})

describe('FIX: nombre completo del cliente', () => {
  it('define helper formatClienteNombre que concatena apellido y negocio', () => {
    expect(source).toMatch(/const formatClienteNombre = /)
    expect(source).toMatch(/cliente\.apellido/)
    expect(source).toMatch(/cliente\.nombreNegocio/)
  })

  it('usa formatClienteNombre en lugar de cliente\.nombre directo', () => {
    const matches = source.match(/\{formatClienteNombre\(factura\.cliente\)\}/g)
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('FIX: loading state visible', () => {
  it('tiene estado loading y renderiza SkeletonPage durante carga inicial', () => {
    expect(source).toMatch(/const \[loading, setLoading\] = useState\(true\)/)
    expect(source).toMatch(/setLoading\(true\)/)
    expect(source).toMatch(/<SkeletonPage/)
  })
})

describe('FIX: paginación UI', () => {
  it('tiene estados page, total y totalPages', () => {
    expect(source).toMatch(/const \[page, setPage\] = useState\(/)
    expect(source).toMatch(/const \[total, setTotal\] = useState\(/)
    expect(source).toMatch(/const \[totalPages, setTotalPages\] = useState\(/)
  })

  it('renderiza controles de paginación cuando hay más de una página', () => {
    expect(source).toMatch(/\{totalPages > 1 && \(/)
    expect(source).toMatch(/Página \{page\} de \{totalPages\}/)
    expect(source).toMatch(/Anterior/)
    expect(source).toMatch(/Siguiente/)
  })
})

describe('FIX: saldo no muestra ✓ en facturas ANULADAS', () => {
  it('celda desktop de saldo renderiza "Anulada" en gris cuando ANULADA', () => {
    expect(source).toMatch(/factura\.estado === 'ANULADA' \?\s*\(\s*<span className="text-xs text-gray-500 font-medium">Anulada<\/span>/s)
  })

  it('celda mobile de saldo no muestra "Pagada" cuando ANULADA', () => {
    expect(source).toMatch(/factura\.estado === 'ANULADA' \?\s*\(\s*<p className="text-xs text-gray-500 font-medium">Anulada<\/p>/s)
  })

  it('barra de progreso no se renderiza cuando ANULADA', () => {
    expect(source).toMatch(/factura\.estado !== 'ANULADA' && \(/s)
  })
})
