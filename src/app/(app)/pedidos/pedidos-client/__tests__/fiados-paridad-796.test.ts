import { describe, it, expect } from 'vitest'
import { filasFiados } from '../fiados-table'
import type { Pedido } from '../types'

// #796: la lista de Fiados y el contador de la pestaña deben contar los mismos clientes:
// los que tienen fiado consolidado o deuda sin clasificar, nunca solo pendiente del día.
const pedido = (id: string, clienteId: string, corte: { fiado: number; pendiente: number; sinClasificar: number }): Pedido => ({
  id, clienteId, numero: 1, fecha: '2026-11-23T15:00:00-05:00', estadoEntrega: 'ENTREGADO',
  saldo: corte.fiado + corte.pendiente + corte.sinClasificar, exigible: corte.fiado + corte.pendiente + corte.sinClasificar,
  corteOperativo: { ...corte, exigible: corte.fiado + corte.pendiente + corte.sinClasificar },
} as unknown as Pedido)

describe('#796 paridad lista ↔ contador de Fiados', () => {
  it('excluye al cliente con solo pendiente del día, incluye fiado y sin clasificar', () => {
    const filas = filasFiados([
      pedido('a', 'c-pendiente', { fiado: 0, pendiente: 30000, sinClasificar: 0 }),
      pedido('b', 'c-fiado', { fiado: 20000, pendiente: 10000, sinClasificar: 0 }),
      pedido('c', 'c-legado', { fiado: 0, pendiente: 0, sinClasificar: 5000 }),
    ], 'todos')
    expect(filas.map(f => f.clienteId).sort()).toEqual(['c-fiado', 'c-legado'])
    expect(filas.find(f => f.clienteId === 'c-fiado')?.deuda).toBe(20000)
  })
})
