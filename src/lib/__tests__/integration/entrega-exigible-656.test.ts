// #656 (slice 2b): entregas parciales crean su EntregaExigible con valor real y el prepago se reparte FIFO.
import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed } from './setup'
import { registrarEntregaExigible } from '@/lib/entregas-exigibles-db'

const d3 = new Date('2031-05-03T14:00:00-05:00')
const d4 = new Date('2031-05-04T14:00:00-05:00')

describe('registrarEntregaExigible (#656 caso 693)', () => {
  let pedidoId: string

  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await db.cliente.create({ data: { nombre: 'Exigible 656', telefono: randomUUID() } })
    // Total 30.000, prepago 10.000 → saldo 20.000. Hielo a 1.500 la paca.
    const p = await db.pedido.create({
      data: {
        clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'PENDIENTE',
        estadoEntrega: 'PENDIENTE', estadoPago: 'PARCIAL', total: 30000, totalPagado: 10000, saldo: 20000,
        fecha: new Date('2031-05-03T08:00:00-05:00'),
      },
    })
    pedidoId = p.id
  })

  it('primera entrega (5 hielo, 7.500) absorbe el prepago y deja 0 exigible', async () => {
    await registrarEntregaExigible(db as never, {
      pedidoId, entregadoAt: d3,
      lineas: [{ producto: 'PACA_HIELO', cantidad: 5, precioCents: 150000 }],
      pedido: { total: 30000, totalPagado: 10000, saldo: 20000 },
    })
    const filas = await db.entregaExigible.findMany({ where: { pedidoId }, orderBy: { entregadoAt: 'asc' } })
    expect(filas).toHaveLength(1)
    expect(Number(filas[0].valorEntregado)).toBe(7500)
    expect(Number(filas[0].asignado)).toBe(7500)
  })

  it('segunda entrega (10 hielo, 15.000) queda con 2.500 asignados y 12.500 exigibles', async () => {
    await registrarEntregaExigible(db as never, {
      pedidoId, entregadoAt: d4,
      lineas: [{ producto: 'PACA_HIELO', cantidad: 10, precioCents: 150000 }],
      pedido: { total: 30000, totalPagado: 10000, saldo: 20000 },
    })
    const filas = await db.entregaExigible.findMany({ where: { pedidoId }, orderBy: { entregadoAt: 'asc' } })
    const exigible = filas.reduce((t, f) => t + Number(f.valorEntregado) - Number(f.asignado), 0)
    expect(filas).toHaveLength(2)
    expect(Number(filas[1].asignado)).toBe(2500)
    expect(exigible).toBe(12500)
  })

  it('una entrega sin valor no crea fila', async () => {
    const antes = await db.entregaExigible.count({ where: { pedidoId } })
    await registrarEntregaExigible(db as never, {
      pedidoId, entregadoAt: d4,
      lineas: [{ producto: 'PACA_HIELO', cantidad: 0, precioCents: 150000 }],
      pedido: { total: 30000, totalPagado: 10000, saldo: 20000 },
    })
    expect(await db.entregaExigible.count({ where: { pedidoId } })).toBe(antes)
  })
})
