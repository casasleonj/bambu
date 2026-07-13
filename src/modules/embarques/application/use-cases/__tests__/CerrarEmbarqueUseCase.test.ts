// @tests CerrarEmbarqueUseCase — F4.10-c fix verification
// Hallazgo: el use case duplicaba la lógica de CierreEmbarqueService.
// Fix: inyectar el service y delegar la conciliación.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useCasePath = join(process.cwd(), 'src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts')
const source = readFileSync(useCasePath, 'utf-8')

describe('F4.10-c: delegación a CierreEmbarqueService', () => {
  it('FIX: el use case importa CierreEmbarqueService', () => {
    expect(source).toMatch(/import\s*\{\s*CierreEmbarqueService\s*\}\s*from\s*['"]\.\.\/\.\.\/domain\/services\/cierre-embarque\.service['"]/)
  })

  it('FIX: el use case importa Carga VO', () => {
    expect(source).toMatch(/import\s*\{\s*Carga[^}]*\}\s*from\s*['"]\.\.\/\.\.\/domain\/value-objects\/Carga['"]/)
  })

  it('FIX: el constructor acepta CierreEmbarqueService como último parámetro', () => {
    // El parámetro debe estar después de userRole y tener default
    expect(source).toMatch(/private readonly cierreService:\s*CierreEmbarqueService\s*=\s*new CierreEmbarqueService\(\)/)
  })
})

describe('F4.10-c: lógica de conciliación delegada', () => {
  it('FIX: el método conciliarProductos delega al service.conciliarProductos', () => {
    // El método del use case ahora llama this.cierreService.conciliarProductos
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)
    expect(conciliarMethod).not.toBeNull()
    expect(conciliarMethod![0]).toMatch(/this\.cierreService\.conciliarProductos/)
  })

  it('FIX: también delega al service.calcularDiscrepancia', () => {
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)
    expect(conciliarMethod![0]).toMatch(/this\.cierreService\.calcularDiscrepancia/)
  })

  it('FIX: construye una Carga VO desde embarque.productos', () => {
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)
    expect(conciliarMethod![0]).toMatch(/new Carga\(/)
  })
})

describe('F4.10-c: shape backward-compatible', () => {
  it('FIX: retorna el mismo shape que el call site espera', () => {
    // El call site (execute método) desestructura { totalDiscrepancia, discrepanciasPorProducto }
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)
    expect(conciliarMethod![0]).toMatch(/return\s*\{/)
    expect(conciliarMethod![0]).toMatch(/totalDiscrepancia:/)
    expect(conciliarMethod![0]).toMatch(/discrepanciasPorProducto:/)
  })

  it('FIX: proyecta ProductoConciliacion[] a { producto, discrepancia }', () => {
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)
    expect(conciliarMethod![0]).toMatch(/result\.discrepanciasPorProducto\.map\(/)
    expect(conciliarMethod![0]).toMatch(/producto: d\.producto/)
    expect(conciliarMethod![0]).toMatch(/discrepancia: d\.discrepancia/)
  })
})

describe('F4.10-c: reducción de código', () => {
  it('FIX: el adaptador llama al service (no reimplementa la lógica)', () => {
    // El test principal es que el método DEJA de tener la lógica inline
    // y pasa a ser un adaptador. Verificamos que el service se invoca.
    const conciliarMethod = source.match(/private conciliarProductos\([\s\S]*?\n  \}/)![0]
    expect(conciliarMethod).toMatch(/this\.cierreService\.conciliarProductos/)
    expect(conciliarMethod).toMatch(/this\.cierreService\.calcularDiscrepancia/)
  })

  it('FIX: ya NO tiene el bucle inline de conciliación con Record<string, number>', () => {
    // El código duplicado fue removido
    expect(source).not.toMatch(/const totalCargado:\s*Record<string,\s*number>/)
    expect(source).not.toMatch(/const totalEntregado:\s*Record<string,\s*number>/)
  })
})

// PR3: auto-deuda por faltante de caja al cerrar embarque
describe('PR3: integración de CrearDeudaFaltanteCajaService', () => {
  it('FIX: el use case importa CrearDeudaFaltanteCajaService', () => {
    expect(source).toMatch(/import\s*\{\s*CrearDeudaFaltanteCajaService\s*\}\s*from\s*['"]\.\.\/\.\.\/domain\/services\/crear-deuda-faltante-caja\.service['"]/)
  })

  it('FIX: el constructor acepta CrearDeudaFaltanteCajaService con default', () => {
    expect(source).toMatch(/private readonly crearDeudaFaltanteService:\s*CrearDeudaFaltanteCajaService\s*=\s*new CrearDeudaFaltanteCajaService\(\)/)
  })

  it('FIX: calcula caja (sobranteFaltante) antes de cerrar', () => {
    expect(source).toMatch(/sobranteFaltante/)
    expect(source).toMatch(/calcularCajaFinal\(/)
  })

  it('FIX: llama al servicio con justificacionFaltante del input', () => {
    expect(source).toMatch(/this\.crearDeudaFaltanteService\.execute\(/)
    expect(source).toMatch(/input\.justificacionFaltante/)
  })

  it('FIX: retorna deudaCreada en el DTO', () => {
    expect(source).toMatch(/deudaCreada,/)
  })
})
