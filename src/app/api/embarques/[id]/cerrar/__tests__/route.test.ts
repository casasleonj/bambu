// @tests embarques/[id]/cerrar route — PR3 auto-deuda por faltante de caja
// Verifica que el endpoint expone caja y deudaCreada en la respuesta legacy.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/embarques/[id]/cerrar/route.ts')
const routeSource = readFileSync(routePath, 'utf-8')
// ADR-CIERRE-002: el mapeo del body al use case vive en `cierre-http.ts`, compartido
// con el preview (que debe mapear EXACTAMENTE igual). La ruta lo usa vía `toCerrarInput`.
const httpSource = readFileSync(join(process.cwd(), 'src/modules/embarques/presentation/cierre-http.ts'), 'utf-8')
const source = routeSource + '\n' + httpSource

describe('PR3: endpoint de cierre expone resumen de caja y deuda', () => {
  it('FIX: la ruta extrae justificacionFaltante del body', () => {
    expect(source).toMatch(/justificacionFaltante/)
  })

  it('FIX: pasa justificacionFaltante al use case', () => {
    expect(routeSource).toMatch(/toCerrarInput\(/)
    expect(httpSource).toMatch(/justificacionFaltante,/)
  })
})

describe('PR3: presenter legacy incluye caja y deudaCreada', () => {
  const presenterPath = join(process.cwd(), 'src/modules/embarques/presentation/CierrePresenter.ts')
  const presenterSource = readFileSync(presenterPath, 'utf-8')

  it('FIX: CierreLegacyResponse incluye caja', () => {
    expect(presenterSource).toMatch(/caja:/)
    expect(presenterSource).toMatch(/sobranteFaltante:/)
  })

  it('FIX: CierreLegacyResponse incluye deudaCreada (null, sin cargo automático)', () => {
    expect(presenterSource).toMatch(/deudaCreada:/)
  })

  it('FIX: toLegacyResponse expone responsibilityCases (FASE 6 §13)', () => {
    expect(presenterSource).toMatch(/caja:\s*result\.caja/)
    expect(presenterSource).toMatch(/responsibilityCases:\s*result\.responsibilityCases/)
    expect(presenterSource).toMatch(/deudaCreada:\s*null/)
  })
})
