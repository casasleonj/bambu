// @tests Fase 4a del Pedido Hub — GET /api/pedidos/counts extendido con los
// conteos que faltan para los focos de la cabecera (blueprint §2.2).
// Contrato de campos. Los cálculos de clientes/pedidos/importe se verifican
// con handlers reales en integration/parciales-proyecciones-656.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/app/api/pedidos/counts/route.ts'), 'utf-8')

describe('GET /api/pedidos/counts — focos del Hub', () => {
  it('el response incluye los conteos nuevos y conserva los previos', () => {
    expect(src).toMatch(/porPlanificarCount/)
    expect(src).toMatch(/enRutaCount/)
    expect(src).toMatch(/esperandoPagoTotal/)
    expect(src).toMatch(/pendientesN2Count/)
    // previos intactos
    expect(src).toMatch(/fiadosCount/)
    expect(src).toMatch(/alertasCount/)
    expect(src).toMatch(/atrasadosCount/)
    expect(src).toMatch(/enRiesgoCount/)
  })

  it('enRuta se cuenta por estadoEntrega EN_RUTA', () => {
    expect(src).toMatch(/estadoEntrega:\s*['"]EN_RUTA['"]/)
  })

  it('pendientesN2 se cuenta sobre ObligacionPendiente ABIERTA', () => {
    expect(src).toMatch(/obligacionPendiente\.count/)
    expect(src).toMatch(/estado:\s*['"]ABIERTA['"]/)
  })
})
