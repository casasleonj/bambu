import { describe, it, expect } from 'vitest'
import {
  puedeCrearPedido,
  getEstadoFiados,
  puedeFiar,
  getAlertaPedidoDia,
  resolverLimiteFiados,
} from '@/lib/pedido-utils'

describe('puedeCrearPedido', () => {
  const pedidosPendientes = [
    { id: '1', numero: 1, saldo: 5000 },
    { id: '2', numero: 2, saldo: 3000 },
  ]

  it('retorna null para CONSUMIDOR_FINAL sin importar deudas', () => {
    const cliente = { id: 'CONSUMIDOR_FINAL', bloqueado: false }
    expect(puedeCrearPedido(cliente, pedidosPendientes, 3)).toBeNull()
  })

  it('retorna error cuando cliente está bloqueado', () => {
    const cliente = { id: 'cli-123', bloqueado: true }
    const result = puedeCrearPedido(cliente, [], 3)
    expect(result).toContain('Cliente bloqueado por deuda vencida')
  })

  it('retorna error cuando count >= limite', () => {
    const cliente = { id: 'cli-123', bloqueado: false }
    const muchosPedidos = [
      { id: '1', numero: 1, saldo: 5000 },
      { id: '2', numero: 2, saldo: 3000 },
      { id: '3', numero: 3, saldo: 2000 },
    ]
    const result = puedeCrearPedido(cliente, muchosPedidos, 3)
    expect(result).toContain('3 pedidos fiados')
    expect(result).toContain('límite: 3')
  })

  it('retorna null cuando count < limite', () => {
    const cliente = { id: 'cli-123', bloqueado: false }
    const result = puedeCrearPedido(cliente, pedidosPendientes, 3)
    expect(result).toBeNull()
  })

  it('respeta limite personalizado', () => {
    const cliente = { id: 'cli-123', bloqueado: false }
    const result = puedeCrearPedido(cliente, pedidosPendientes, 2)
    expect(result).toContain('2 pedidos fiados')
    expect(result).toContain('límite: 2')
  })

  it('bloqueado tiene prioridad sobre limite de fiados', () => {
    const cliente = { id: 'cli-123', bloqueado: true }
    const result = puedeCrearPedido(cliente, [], 3)
    expect(result).toContain('bloqueado por deuda vencida')
  })
})

describe('getEstadoFiados', () => {
  it('nivel ok cuando count = 0', () => {
    const result = getEstadoFiados([], 3)
    expect(result).toEqual({ count: 0, limite: 3, porcentaje: 0, nivel: 'ok' })
  })

  it('nivel ok cuando bajo porcentaje (< 60%)', () => {
    const pedidos = [{ id: '1', numero: 1, saldo: 5000 }]
    const result = getEstadoFiados(pedidos, 3)
    expect(result.nivel).toBe('ok')
    expect(result.porcentaje).toBeCloseTo(33.33, 1)
  })

  it('nivel cerca cuando >= 60%', () => {
    const pedidos = [
      { id: '1', numero: 1, saldo: 5000 },
      { id: '2', numero: 2, saldo: 3000 },
    ]
    const result = getEstadoFiados(pedidos, 3)
    expect(result.nivel).toBe('cerca')
    expect(result.count).toBe(2)
    expect(result.limite).toBe(3)
  })

  it('nivel limite cuando count >= limite', () => {
    const pedidos = [
      { id: '1', numero: 1, saldo: 5000 },
      { id: '2', numero: 2, saldo: 3000 },
      { id: '3', numero: 3, saldo: 2000 },
    ]
    const result = getEstadoFiados(pedidos, 3)
    expect(result.nivel).toBe('limite')
    expect(result.count).toBe(3)
    expect(result.limite).toBe(3)
  })

  it('porcentaje = 100 cuando limite = 0', () => {
    const result = getEstadoFiados([], 0)
    expect(result.porcentaje).toBe(100)
    expect(result.nivel).toBe('limite')
  })
})

describe('resolverLimiteFiados', () => {
  it('usa el límite personal del cliente cuando está definido', () => {
    expect(resolverLimiteFiados({ limitePedidosFiados: 5 }, '10')).toBe(5)
  })

  it('usa la config global cuando no hay límite personal', () => {
    expect(resolverLimiteFiados({}, '10')).toBe(10)
    expect(resolverLimiteFiados({ limitePedidosFiados: null }, '7')).toBe(7)
  })

  it('usa el default cuando no hay ni personal ni global', () => {
    expect(resolverLimiteFiados({}, null)).toBe(2)
    expect(resolverLimiteFiados({ limitePedidosFiados: null }, null)).toBe(2)
  })

  it('ignora límite personal inválido (0 o negativo)', () => {
    expect(resolverLimiteFiados({ limitePedidosFiados: 0 }, '4')).toBe(4)
    expect(resolverLimiteFiados({ limitePedidosFiados: -1 }, '4')).toBe(4)
  })

  it('ignora config global inválida (NaN o <= 0)', () => {
    expect(resolverLimiteFiados({}, 'foo')).toBe(2)
    expect(resolverLimiteFiados({}, '0')).toBe(2)
    expect(resolverLimiteFiados({}, '-2')).toBe(2)
  })
})

describe('puedeFiar', () => {
  it('retorna false para anónimo', () => {
    const cliente = { id: 'CONSUMIDOR_FINAL', verificado: false, creadoPorRol: 'ASISTENTE' }
    expect(puedeFiar(cliente, true)).toBe(false)
  })

  it('retorna true para cliente verificado', () => {
    const cliente = { id: 'cli-123', verificado: true, creadoPorRol: 'REPARTIDOR' }
    expect(puedeFiar(cliente, false)).toBe(true)
  })

  it('retorna true para cliente creado por ADMIN no verificado', () => {
    const cliente = { id: 'cli-123', verificado: false, creadoPorRol: 'ADMIN' }
    expect(puedeFiar(cliente, false)).toBe(true)
  })

  it('retorna true para cliente creado por ASISTENTE no verificado', () => {
    const cliente = { id: 'cli-123', verificado: false, creadoPorRol: 'ASISTENTE' }
    expect(puedeFiar(cliente, false)).toBe(true)
  })

  it('retorna false para cliente creado por REPARTIDOR no verificado', () => {
    const cliente = { id: 'cli-123', verificado: false, creadoPorRol: 'REPARTIDOR' }
    expect(puedeFiar(cliente, false)).toBe(false)
  })

  it('verificado tiene prioridad sobre creadoPorRol', () => {
    const cliente = { id: 'cli-123', verificado: true, creadoPorRol: 'REPARTIDOR' }
    expect(puedeFiar(cliente, false)).toBe(true)
  })
})

describe('getAlertaPedidoDia', () => {
  it('ninguna cuando 0 pedidos', () => {
    const result = getAlertaPedidoDia(0)
    expect(result.tipo).toBe('ninguna')
  })

  it('ninguna cuando 1 pedido', () => {
    const result = getAlertaPedidoDia(1)
    expect(result.tipo).toBe('ninguna')
  })

  it('amarilla cuando 2 pedidos', () => {
    const result = getAlertaPedidoDia(2)
    expect(result.tipo).toBe('amarilla')
    expect(result.mensaje).toBe('2do pedido hoy')
  })

  it('roja cuando 3+ pedidos', () => {
    const result = getAlertaPedidoDia(3)
    expect(result.tipo).toBe('roja')
    expect(result.mensaje).toBe('3 pedidos hoy')
  })

  it('roja cuando 5 pedidos', () => {
    const result = getAlertaPedidoDia(5)
    expect(result.tipo).toBe('roja')
    expect(result.mensaje).toBe('5 pedidos hoy')
  })
})
