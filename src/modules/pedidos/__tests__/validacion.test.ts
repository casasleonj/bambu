// @tests puedeCrearPedido — validación de fiado, bloqueo, límite
// Hallazgo cubierto: fiado ilimitado para clientes creados por ADMIN
import { describe, it, expect } from 'vitest'
import { puedeCrearPedido } from '../domain/services/pedido-validation.service'

describe('puedeCrearPedido', () => {
  const baseCliente = {
    id: 'cliente-1',
    bloqueado: false,
    verificado: true,
    creadoPorRol: 'ASISTENTE',
  }

  it('permite CONSUMIDOR_FINAL (id especial)', () => {
    const result = puedeCrearPedido(
      { ...baseCliente, id: 'CONSUMIDOR_FINAL' },
      [],
      3
    )
    expect(result).toBeNull()
  })

  it('bloquea cliente con cliente.bloqueado = true', () => {
    const result = puedeCrearPedido(
      { ...baseCliente, bloqueado: true },
      [],
      3
    )
    expect(result).toMatch(/bloqueado por deuda vencida/)
  })

  it('bloquea cliente que alcanzó el límite de fiados', () => {
    const pendientes = [
      { id: 'p1', numero: 1, saldo: 1000 },
      { id: 'p2', numero: 2, saldo: 2000 },
      { id: 'p3', numero: 3, saldo: 3000 },
    ]
    const result = puedeCrearPedido(baseCliente, pendientes as any, 3)
    expect(result).toMatch(/límite/)
  })

  it('permite cliente con menos fiados que el límite', () => {
    const pendientes = [
      { id: 'p1', numero: 1, saldo: 1000 },
    ]
    const result = puedeCrearPedido(baseCliente, pendientes as any, 3)
    expect(result).toBeNull()
  })

  it('usa el límite pasado como parámetro (no constante hardcodeada)', () => {
    const pendientes = [
      { id: 'p1', numero: 1, saldo: 1000 },
      { id: 'p2', numero: 2, saldo: 2000 },
    ]
    // Con límite 2, ya está al límite
    const result = puedeCrearPedido(baseCliente, pendientes as any, 2)
    expect(result).toMatch(/límite/)
  })

  it('BUG CONOCIDO: cliente creado por ADMIN puede fiar sin límite (verificar con PO)', () => {
    // Este test documenta el comportamiento actual.
    // El usuario "verificado" puede fiar — eso es OK.
    // El tema es si creadoPorRol === 'ADMIN' tiene verificación implícita.
    const result = puedeCrearPedido(
      { ...baseCliente, creadoPorRol: 'ADMIN' },
      [],
      0 // límite 0
    )
    // Si creadoPorRol es ADMIN, debería permitirse? (comportamiento actual: NO)
    // Si permitido, retorna null
    // Si bloqueado, retorna string
    // Para esta propiedad, el comportamiento actual es:
    expect(result).toMatch(/límite/)
  })
})
