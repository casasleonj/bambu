// @tests PR-1B — quién entregó, resuelto sin preguntar cuando se puede.
import { describe, it, expect } from 'vitest'
import { resolverEntrega } from '../entrega-quien'

describe('resolverEntrega', () => {
  it('sin embarque (mostrador): entrega normal, sin retiro ni salida del vehículo, con GPS', () => {
    expect(resolverEntrega({ quien: 'REPARTIDOR' })).toEqual({ clienteRetiro: false, embarqueEntregaId: undefined, tomarGps: true })
  })

  it('sin embarque + "cliente retiró": no hay de dónde soltarlo, así que no marca retiro', () => {
    const r = resolverEntrega({ quien: 'CLIENTE_RETIRO' })
    expect(r.clienteRetiro).toBe(false)
    expect(r.embarqueEntregaId).toBeUndefined()
    expect(r.tomarGps).toBe(false)
  })

  it('embarque ABIERTO (aún no sale): es un retiro aunque no se elija nada', () => {
    expect(resolverEntrega({ embarqueId: 'e1', embarqueEstado: 'ABIERTO', quien: 'REPARTIDOR' }))
      .toEqual({ clienteRetiro: true, embarqueEntregaId: undefined, tomarGps: false })
  })

  it('embarque EN_RUTA + "Entregó el repartidor": salida del vehículo, con GPS', () => {
    expect(resolverEntrega({ embarqueId: 'e1', embarqueEstado: 'EN_RUTA', quien: 'REPARTIDOR' }))
      .toEqual({ clienteRetiro: false, embarqueEntregaId: 'e1', tomarGps: true })
  })

  it('embarque EN_RUTA + "Cliente retiró": retiro, sin salida del vehículo ni GPS', () => {
    expect(resolverEntrega({ embarqueId: 'e1', embarqueEstado: 'EN_RUTA', quien: 'CLIENTE_RETIRO' }))
      .toEqual({ clienteRetiro: true, embarqueEntregaId: undefined, tomarGps: false })
  })

  it('embarque no cargado en la lista (estado desconocido): no inventa contexto físico', () => {
    expect(resolverEntrega({ embarqueId: 'e1', embarqueEstado: undefined, quien: 'REPARTIDOR' }))
      .toEqual({ clienteRetiro: false, embarqueEntregaId: undefined, tomarGps: true })
  })
})
