import { describe, expect, it } from 'vitest'
import type { ActoresFiado } from '@/lib/fiados-actores'
import { filasFiados, resumenFiados } from '../fiados-table'
import { ENTREGO_SIN_IDENTIFICAR, coincideEntregadoPor, opcionesEntregadoPor, totalesEntregados } from '../fiados-actores-vista'
import type { Pedido } from '../types'

// #614 · caso del PO: un cliente, A $30.000, B $20.000, A $40.000.
const A = { id: 'tA', nombre: 'Pedro Gómez' }, B = { id: 'tB', nombre: 'Ana Soto' }
const actores = (resp: Array<{ id: string; nombre: string }>, cantidades: Array<{ producto: string; cantidad: number }> | null = [{ producto: 'PACA_AGUA', cantidad: 5 }]): ActoresFiado => ({
  creadoPor: 'Lilia', createdAt: '2026-11-03T13:05:00.000Z', entregasSinDetalle: !cantidades || resp.length === 0, pagos: [],
  responsablesEntrega: resp,
  entregas: resp.length ? resp.map((r, i) => ({ id: `e${i}`, fecha: '2026-11-03T15:40:00.000Z', soloDia: false, responsable: r, cantidades })) : [],
})
const ped = (id: string, n: number, monto: number, a: ActoresFiado | null): Pedido => ({
  id, numero: n, clienteId: 'c1', nombreCli: 'Tienda', telefonoCli: '1', estadoEntrega: 'ENTREGADO', saldo: monto, exigible: monto,
  total: monto, totalPagado: 0, fecha: '2026-11-03T12:00:00.000Z', actores: a,
} as unknown as Pedido)
const universo = [ped('p1', 1, 30000, actores([A])), ped('p2', 2, 20000, actores([B])), ped('p3', 3, 40000, actores([A]))]

describe('filtro «Entregado por» (#614)', () => {
  it('A: 1 cliente, 2 pedidos, $70.000; B: 1/1/$20.000; Todos: 1/3/$90.000', () => {
    expect(resumenFiados(filasFiados(universo, 'todos', 'tA'))).toEqual({ total: 70000, clientes: 1, pedidos: 2 })
    expect(resumenFiados(filasFiados(universo, 'todos', 'tB'))).toEqual({ total: 20000, clientes: 1, pedidos: 1 })
    expect(resumenFiados(filasFiados(universo, 'todos', ''))).toEqual({ total: 90000, clientes: 1, pedidos: 3 })
  })
  it('pedido compartido sale en cada persona una sola vez y no se suma entre filtros', () => {
    const u = [ped('p1', 1, 30000, actores([A, B]))]
    expect(resumenFiados(filasFiados(u, 'todos', 'tA')).pedidos).toBe(1)
    expect(resumenFiados(filasFiados(u, 'todos', 'tB')).total).toBe(30000)
    expect(resumenFiados(filasFiados(u, 'todos', '')).total).toBe(30000)
  })
  it('sin identificar y sin datos: no se atribuye a nadie', () => {
    const u = [ped('p1', 1, 10000, actores([])), ped('p2', 2, 5000, null)]
    expect(resumenFiados(filasFiados(u, 'todos', ENTREGO_SIN_IDENTIFICAR)).pedidos).toBe(1)
    expect(coincideEntregadoPor(u[1], 'tA')).toBe(false)
    expect(coincideEntregadoPor(u[1], ENTREGO_SIN_IDENTIFICAR)).toBe(false)
  })
  it('opciones por ID, ordenadas, con «sin identificar» solo si existe', () => {
    expect(opcionesEntregadoPor(universo)).toEqual({ personas: [B, A], haySinIdentificar: false })
    expect(opcionesEntregadoPor([...universo, ped('p9', 9, 1, actores([]))]).haySinIdentificar).toBe(true)
  })
  it('totales físicos: suma por producto; con evento sin cantidades se marca incompleto', () => {
    const a = actores([A, B]); a.entregas[1].cantidades = null
    const t = totalesEntregados(a)
    expect(t).toEqual({ porProducto: [{ producto: 'PACA_AGUA', cantidad: 5 }], total: 5, completo: false })
    expect(totalesEntregados(actores([A])).completo).toBe(true)
  })
})
