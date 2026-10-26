// @tests #499 — reglas puras de tarifas del repartidor
import { describe, it, expect } from 'vitest'
import { tarifasRepartidor } from '../comision-repartidor'

describe('tarifasRepartidor', () => {
  it('usa la tarifa del trabajador cuando existe', () => {
    expect(tarifasRepartidor({ comRepartAgua: 400, comRepartHielo: 250, comRepartBotellon: 500 }, 300))
      .toEqual({ agua: 400, hielo: 250, botellon: 500 })
  })

  it('sin tarifa propia (null) usa COM_REPARTIDOR para agua y hielo, y 200 para botellón', () => {
    expect(tarifasRepartidor({ comRepartAgua: null, comRepartHielo: null, comRepartBotellon: null }, 300))
      .toEqual({ agua: 300, hielo: 300, botellon: 200 })
  })

  it('sin tarifa propia ni COM_REPARTIDOR usa 200', () => {
    expect(tarifasRepartidor({ comRepartAgua: null, comRepartHielo: null, comRepartBotellon: null }))
      .toEqual({ agua: 200, hielo: 200, botellon: 200 })
  })
})
