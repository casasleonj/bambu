// @tests CrearDeudaFaltanteCajaService — PR3 auto-deuda en cierre
// Verifica que el servicio solo cree deudas cuando hay faltante de caja
// sin justificar y por encima del umbral operativo.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const servicePath = join(process.cwd(), 'src/modules/embarques/domain/services/crear-deuda-faltante-caja.service.ts')
const source = readFileSync(servicePath, 'utf-8')

describe('PR3: CrearDeudaFaltanteCajaService estructura', () => {
  it('FIX: el servicio importa las constantes de umbral y plan de pago', () => {
    expect(source).toMatch(/UMBRAL_MINIMO_FALTANTE_CAJA/)
    expect(source).toMatch(/DEUDA_FALTANTE_CAJA_PLAZO_NOMINAS_DEFAULT/)
    expect(source).toMatch(/DEUDA_FALTANTE_CAJA_PORCENTAJE_NOMINA_DEFAULT/)
  })

  it('FIX: crea DeudaTrabajador con tipo DEFICIT_EFECTIVO', () => {
    expect(source).toMatch(/tipo:\s*['"]DEFICIT_EFECTIVO['"]/)
  })

  it('FIX: no crea deuda si hay justificación de faltante', () => {
    expect(source).toMatch(/justificacionFaltante/)
    expect(source).toMatch(/return\s+undefined/)
  })

  it('FIX: no crea deuda si el faltante está bajo el umbral', () => {
    expect(source).toMatch(/UMBRAL_MINIMO_FALTANTE_CAJA/)
  })

  it('FIX: aplica plan de pago por defecto (plazo + porcentaje)', () => {
    expect(source).toMatch(/plazoNominas:/)
    expect(source).toMatch(/porcentajePorNomina:/)
  })
})
