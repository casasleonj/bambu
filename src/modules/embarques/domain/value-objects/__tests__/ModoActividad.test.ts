// @tests ModoActividadVO — N2 (AGUA_BAMBU_N2_ALS_v2.0.md §2.1)
import { describe, it, expect } from 'vitest'
import { ModoActividadVO } from '../ModoActividad'

describe('ModoActividadVO', () => {
  it('acepta PUNTO y DOMICILIO', () => {
    expect(ModoActividadVO.from('PUNTO').get()).toBe('PUNTO')
    expect(ModoActividadVO.from('DOMICILIO').get()).toBe('DOMICILIO')
  })

  it('rechaza valores inválidos', () => {
    expect(() => ModoActividadVO.from('ENVIO')).toThrow('ModoActividad inválido: ENVIO')
    expect(() => ModoActividadVO.from('')).toThrow()
  })

  it('isDelivery/isPoint son mutuamente excluyentes', () => {
    const punto = ModoActividadVO.from('PUNTO')
    const domicilio = ModoActividadVO.from('DOMICILIO')
    expect(punto.isPoint()).toBe(true)
    expect(punto.isDelivery()).toBe(false)
    expect(domicilio.isDelivery()).toBe(true)
    expect(domicilio.isPoint()).toBe(false)
  })

  it('equals compara por valor', () => {
    expect(ModoActividadVO.from('PUNTO').equals(ModoActividadVO.from('PUNTO'))).toBe(true)
    expect(ModoActividadVO.from('PUNTO').equals(ModoActividadVO.from('DOMICILIO'))).toBe(false)
  })

  it('toString devuelve el valor crudo', () => {
    expect(ModoActividadVO.from('DOMICILIO').toString()).toBe('DOMICILIO')
  })
})
