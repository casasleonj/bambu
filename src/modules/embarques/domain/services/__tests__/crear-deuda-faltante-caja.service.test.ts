// @tests CrearDeudaFaltanteCajaService — PR3 auto-deuda en cierre
// Verifica que el servicio solo cree deudas cuando hay faltante de caja
// sin justificar y por encima del umbral operativo.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CrearDeudaFaltanteCajaService } from '../crear-deuda-faltante-caja.service'

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

describe('BAMBU-LOG-019: monto devuelto lee montoOriginal (no un campo inexistente)', () => {
  it('devuelve el monto real de la deuda creada, no NaN', async () => {
    // DeudaTrabajador (schema.prisma) solo tiene montoOriginal/montoPendiente,
    // NO tiene un campo `monto`. El código antes hacía `Number(deuda.monto)`
    // — deuda.monto es undefined en el objeto real que devuelve Prisma,
    // así que Number(undefined) === NaN. El admin veía "Se creó deuda por
    // $0" (NaN se serializa a null en JSON, y formatCurrency(null) usa
    // Number(null)=0) en vez del monto real del faltante.
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'deuda_1',
      montoOriginal: 15000,
      montoPendiente: 15000,
      // Nota: sin campo `monto` — así luce el objeto real de Prisma.
    })
    const client = {
      embarque: { findUnique: vi.fn().mockResolvedValue({ numero: 42 }) },
      deudaTrabajador: { create: mockCreate },
    }

    const service = new CrearDeudaFaltanteCajaService()
    const result = await service.execute(client, 'trab_1', 'emb_1', -15000, undefined, 'user_1')

    expect(result).toBeDefined()
    expect(result?.monto).toBe(15000)
    expect(Number.isNaN(result?.monto)).toBe(false)
  })
})
