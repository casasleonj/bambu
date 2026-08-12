import { describe, it, expect } from 'vitest'
import { getDiasAtraso } from '../pedido-table'

describe('getDiasAtraso', () => {
  it('null si el pedido no está PENDIENTE', () => {
    expect(getDiasAtraso('2020-01-01T00:00:00-05:00', 'ENTREGADO')).toBeNull()
  })

  it('null si la fecha es de hoy', () => {
    const hoy = new Date().toISOString()
    expect(getDiasAtraso(hoy, 'PENDIENTE')).toBeNull()
  })

  it('null si la fecha es futura', () => {
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString()
    expect(getDiasAtraso(manana, 'PENDIENTE')).toBeNull()
  })

  it('calcula días de atraso para un PENDIENTE de días anteriores', () => {
    const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const hoy = new Date(`${hoyStr}T00:00:00-05:00`)
    const hace3Dias = new Date(hoy.getTime() - 3 * 86_400_000)
    expect(getDiasAtraso(hace3Dias.toISOString(), 'PENDIENTE')).toBe(3)
  })

  it('null si la fecha es inválida', () => {
    expect(getDiasAtraso('no-es-fecha', 'PENDIENTE')).toBeNull()
  })
})
