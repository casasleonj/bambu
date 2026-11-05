// #650: «Entregas de hoy» cuenta los pedidos cerrados como ENTREGADO en el día,
// sean del mismo día o de días anteriores (p. ej. una parcial completada hoy).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed, disconnect } from './setup'
import { contarEntregasDelDia } from '@/lib/entregas-hoy'

const start = new Date('2031-03-10T00:00:00-05:00')
const rango = { start, end: new Date(+start + 86_400_000) }
const H = 3600_000
const en = (horas: number) => new Date(+start + horas * H)

describe('contarEntregasDelDia (#650)', () => {
  let clienteId: string
  const pedido = (o: {
    fecha: Date
    entregadoAt: Date | null
    estadoEntrega?: 'ENTREGADO' | 'PENDIENTE' | 'ANULADO' | 'CANCELADO'
  }) =>
    db.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        estado: 'ENTREGADO',
        estadoEntrega: o.estadoEntrega ?? 'ENTREGADO',
        estadoPago:
          o.estadoEntrega === 'ANULADO' || o.estadoEntrega === 'CANCELADO'
            ? 'ANULADO'
            : 'PENDIENTE',
        total: 1000,
        saldo: 1000,
        totalPagado: 0,
        fecha: o.fecha,
        entregadoAt: o.entregadoAt,
      },
    })

  beforeAll(async () => {
    await resetAndSeed()
    clienteId = (
      await db.cliente.create({
        data: { nombre: 'Entregas hoy sintético', telefono: randomUUID() },
      })
    ).id
    // creado y entregado hoy
    await pedido({ fecha: en(8), entregadoAt: en(9) })
    // creado ayer, completado hoy (el caso del bug)
    await pedido({ fecha: en(-20), entregadoAt: en(10) })
    // sin entregadoAt, creado hoy: cuenta por su fecha
    await pedido({ fecha: en(11), entregadoAt: null })
    // sin entregadoAt, creado ayer: no cuenta hoy
    await pedido({ fecha: en(-5), entregadoAt: null })
    // entregado ayer, creado hoy-1: no cuenta
    await pedido({ fecha: en(-30), entregadoAt: en(-2) })
    // creado hoy pero aún pendiente: no cuenta
    await pedido({ fecha: en(12), entregadoAt: null, estadoEntrega: 'PENDIENTE' })
    // anulado hoy: no cuenta
    await pedido({ fecha: en(7), entregadoAt: en(7), estadoEntrega: 'ANULADO' })
    // límite exclusivo: medianoche siguiente no cuenta
    await pedido({ fecha: en(-3), entregadoAt: rango.end })
  })
  afterAll(disconnect)

  it('separa entregas de pedidos de hoy y de días anteriores', async () => {
    expect(await contarEntregasDelDia(rango)).toEqual({
      total: 3,
      deHoy: 2,
      deDiasAnteriores: 1,
    })
  })
})
