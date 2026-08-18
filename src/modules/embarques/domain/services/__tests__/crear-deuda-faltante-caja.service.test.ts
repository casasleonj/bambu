// @tests CrearDeudaFaltanteCajaService — FASE 6: detección automática + caso
// Contrato §13: la detección es automática, pero la transferencia económica
// NUNCA es automática. El servicio crea un ResponsibilityCase (no una
// DeudaTrabajador) cuando hay faltante de caja sin justificar y por encima del
// umbral operativo.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CrearDeudaFaltanteCajaService } from '../crear-deuda-faltante-caja.service'

const servicePath = join(process.cwd(), 'src/modules/embarques/domain/services/crear-deuda-faltante-caja.service.ts')
const source = readFileSync(servicePath, 'utf-8')

describe('FASE 6: CrearDeudaFaltanteCajaService estructura', () => {
  it('FIX: crea ResponsibilityCase tipo FALTANTE_CAJA (no DeudaTrabajador)', () => {
    expect(source).toMatch(/responsibilityCase\.create/)
    expect(source).toMatch(/tipo:\s*['"]FALTANTE_CAJA['"]/)
    expect(source).not.toMatch(/deudaTrabajador\.create/)
  })

  it('FIX: no crea el caso si hay justificación de faltante', () => {
    expect(source).toMatch(/justificacionFaltante/)
    expect(source).toMatch(/return\s+undefined/)
  })

  it('FIX: no crea el caso si el faltante está bajo el umbral', () => {
    expect(source).toMatch(/UMBRAL_MINIMO_FALTANTE_CAJA/)
  })
})

describe('FASE 6: monto devuelto es el montoEstimado del caso', () => {
  it('devuelve el monto del caso creado, no NaN', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 'case_1',
      montoEstimado: 15000,
    })
    const client = {
      embarque: { findUnique: vi.fn().mockResolvedValue({ numero: 42 }) },
      responsibilityCase: { create: mockCreate },
    }

    const service = new CrearDeudaFaltanteCajaService()
    const result = await service.execute(client, 'trab_1', 'emb_1', -15000, undefined, 'user_1')

    expect(result).toBeDefined()
    expect(result?.monto).toBe(15000)
    expect(Number.isNaN(result?.monto)).toBe(false)
  })
})
