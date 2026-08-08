import { describe, it, expect } from 'vitest'
import { EmbarqueValidationService, MAX_UNIDADES } from '../embarque-validation.service'
import { Carga } from '../../value-objects/Carga'

describe('EmbarqueValidationService.validarMaxUnidades', () => {
  const service = new EmbarqueValidationService()

  it('usa el default MAX_UNIDADES cuando no se pasa override', () => {
    const carga = new Carga({ PACA_AGUA: MAX_UNIDADES, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    expect(service.validarMaxUnidades(carga).valid).toBe(true)

    const cargaExcedida = new Carga({ PACA_AGUA: MAX_UNIDADES + 1, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const result = service.validarMaxUnidades(cargaExcedida)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain(String(MAX_UNIDADES))
  })

  it('respeta un límite configurable menor al default', () => {
    const carga = new Carga({ PACA_AGUA: 50, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const result = service.validarMaxUnidades(carga, 40)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('40')
  })

  it('respeta un límite configurable mayor al default', () => {
    const carga = new Carga({ PACA_AGUA: MAX_UNIDADES + 20, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })
    const result = service.validarMaxUnidades(carga, MAX_UNIDADES + 30)
    expect(result.valid).toBe(true)
  })
})
