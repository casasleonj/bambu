// @tests CrearDescuentoDiscrepanciaService + CerrarEmbarqueSideEffectsService — F4.10-c-d
// FIX: extrae los side effects finales del cierre:
// - crearDescuento (35 líneas) → CrearDescuentoDiscrepanciaService
// - crearGastos (23 líneas) + actualizarProductosRetorno (18 líneas)
//   → CerrarEmbarqueSideEffectsService (agrupados por ser simples)

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const descuentoPath = join(
  process.cwd(),
  'src/modules/embarques/domain/services/crear-descuento-discrepancia.service.ts'
)
const sideEffectsPath = join(
  process.cwd(),
  'src/modules/embarques/domain/services/cerrar-embarque-side-effects.service.ts'
)
const useCasePath = join(
  process.cwd(),
  'src/modules/embarques/application/use-cases/CerrarEmbarqueUseCase.ts'
)

const descuentoSource = readFileSync(descuentoPath, 'utf-8')
const sideEffectsSource = readFileSync(sideEffectsPath, 'utf-8')
const useCaseSource = readFileSync(useCasePath, 'utf-8')

describe('F4.10-c: CrearDescuentoDiscrepanciaService existe y es responsable', () => {
  it('FIX: el service existe con la firma esperada', () => {
    expect(descuentoSource).toMatch(/export\s+class\s+CrearDescuentoDiscrepanciaService/)
  })

  it('FIX: el service tiene un método execute() público', () => {
    expect(descuentoSource).toMatch(/async\s+execute\s*\([\s\S]+?Promise<\{\s*id:\s*string;\s*monto:\s*number\s*\}\s*\|\s*undefined>/)
  })

  it('FIX: hay un comentario F4.10-c explicando el refactor', () => {
    expect(descuentoSource).toMatch(/FIX F4\.10-c/)
  })

  it('FIX: el service crea el descuento con embarqueId, trabajdorId, monto, motivo, justificado=false', () => {
    expect(descuentoSource).toMatch(/embarqueId,/)
    expect(descuentoSource).toMatch(/trabajadorId,/)
    expect(descuentoSource).toMatch(/monto:\s*montoTotal/)
    expect(descuentoSource).toMatch(/motivo:\s*`Discrepancia conciliacion/)
    expect(descuentoSource).toMatch(/justificado:\s*false/)
  })
})

describe('F4.10-d: CerrarEmbarqueSideEffectsService existe y es responsable', () => {
  it('FIX: el service existe con la firma esperada', () => {
    expect(sideEffectsSource).toMatch(/export\s+class\s+CerrarEmbarqueSideEffectsService/)
  })

  it('FIX: el service tiene métodos crearGastos y actualizarProductosRetorno', () => {
    expect(sideEffectsSource).toMatch(/async\s+crearGastos\s*\(/)
    expect(sideEffectsSource).toMatch(/async\s+actualizarProductosRetorno\s*\(/)
  })

  it('FIX: hay un comentario F4.10-d explicando el refactor', () => {
    expect(sideEffectsSource).toMatch(/FIX F4\.10-d/)
  })
})

describe('F4.10-c-d: el use case delega a los services', () => {
  it('FIX: el use case inyecta CrearDescuentoDiscrepanciaService', () => {
    expect(useCaseSource).toMatch(/private\s+readonly\s+crearDescuentoService:\s*CrearDescuentoDiscrepanciaService/)
    expect(useCaseSource).toMatch(/crearDescuentoService:\s*CrearDescuentoDiscrepanciaService\s*=\s*new\s+CrearDescuentoDiscrepanciaService\(\)/)
  })

  it('FIX: el use case inyecta CerrarEmbarqueSideEffectsService', () => {
    expect(useCaseSource).toMatch(/private\s+readonly\s+sideEffectsService:\s*CerrarEmbarqueSideEffectsService/)
    expect(useCaseSource).toMatch(/sideEffectsService:\s*CerrarEmbarqueSideEffectsService\s*=\s*new\s+CerrarEmbarqueSideEffectsService\(\)/)
  })

  it('FIX: el use case llama a crearDescuentoService.execute()', () => {
    expect(useCaseSource).toMatch(/this\.crearDescuentoService\.execute\(/)
  })

  it('FIX: el use case llama a sideEffectsService.crearGastos() y actualizarProductosRetorno()', () => {
    expect(useCaseSource).toMatch(/this\.sideEffectsService\.crearGastos\(/)
    expect(useCaseSource).toMatch(/this\.sideEffectsService\.actualizarProductosRetorno\(/)
  })

  it('FIX: el use case ya NO tiene los métodos privados', () => {
    expect(useCaseSource).not.toMatch(/private\s+async\s+crearDescuento\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+crearGastos\(/)
    expect(useCaseSource).not.toMatch(/private\s+async\s+actualizarProductosRetorno\(/)
  })
})

describe('F4.10-c-d: imports correctos en el use case', () => {
  it('FIX: importa CrearDescuentoDiscrepanciaService', () => {
    expect(useCaseSource).toMatch(
      /import\s+\{\s*CrearDescuentoDiscrepanciaService\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/crear-descuento-discrepancia\.service['"]/
    )
  })

  it('FIX: importa CerrarEmbarqueSideEffectsService', () => {
    expect(useCaseSource).toMatch(
      /import\s+\{\s*CerrarEmbarqueSideEffectsService\s*\}\s+from\s+['"]\.\.\/\.\.\/domain\/services\/cerrar-embarque-side-effects\.service['"]/
    )
  })

  it('FIX: ya no importa resolverPrecio (lo usan los services)', () => {
    expect(useCaseSource).not.toMatch(/import\s+\{\s*resolverPrecio\s*\}/)
  })
})

describe('F4.10-c-d: el use case se simplificó (398 → ~335 líneas)', () => {
  it('FIX: el archivo final tiene menos de 350 líneas (era 398)', () => {
    const lines = useCaseSource.split('\n').length
    expect(lines).toBeLessThan(350)
  })

  it('FIX: el archivo final tiene más de 320 líneas (sanity check)', () => {
    const lines = useCaseSource.split('\n').length
    expect(lines).toBeGreaterThan(320)
  })
})
