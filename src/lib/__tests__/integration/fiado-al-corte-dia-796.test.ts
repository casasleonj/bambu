// @tests #796 fase 2 — bloque `fiadoAlCorte` del Cierre de un día pasado (PostgreSQL real, datos sintéticos)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed, disconnect } from './setup'
import { resumirFiadoDeDiaPasado } from '@/lib/fiado-al-corte-dia'

const d = (iso: string): Date => new Date(iso)
const DIA = '2026-11-04'
const HOY = '2026-11-10'

async function pedido(o: { total?: number; estado?: string; entregado?: string }) {
  const c = await db.cliente.create({ data: { nombre: 'Día pasado 796', telefono: randomUUID() } })
  const cerrado = ['ANULADO', 'CANCELADO'].includes(o.estado ?? '')
  const estado = (o.estado ?? 'ENTREGADO') as never
  const total = o.total ?? 23000
  return db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado, estadoEntrega: estado,
    estadoPago: cerrado ? 'ANULADO' : 'PENDIENTE', total, saldo: cerrado ? 0 : total, totalPagado: 0,
    fecha: d('2026-11-04T14:00:00Z'), createdAt: d('2026-11-04T14:00:00Z'), entregadoAt: d(o.entregado ?? '2026-11-04T15:00:00Z') } })
}
/** Pago posterior al corte: baja el saldo de hoy pero no el fiado de ese día. */
async function pagarDespues(p: { id: string }, monto: number) {
  await db.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto, createdAt: d('2026-11-07T15:00:00Z') } })
  const actual = await db.pedido.findUniqueOrThrow({ where: { id: p.id } })
  const saldo = Number(actual.total) - monto // la base exige estadoPago coherente con el saldo (chk_pedido_estadopago_proyectado)
  await db.pedido.update({ where: { id: p.id }, data: { totalPagado: monto, saldo, estadoPago: saldo <= 0 ? 'PAGADO' : 'PARCIAL' } })
}

describe('#796 fase 2 · resumirFiadoDeDiaPasado', () => {
  beforeAll(async () => { await resetAndSeed() })
  afterAll(disconnect)

  it('un día de hoy o futuro no lleva bloque (sigue en vivo)', async () => {
    expect(await resumirFiadoDeDiaPasado(db, HOY, { guardado: false }, HOY)).toBeUndefined()
    expect(await resumirFiadoDeDiaPasado(db, '2026-11-11', { guardado: false }, HOY)).toBeUndefined()
  })

  it('día pasado: el fiado al corte no baja por un pago posterior y «pendiente hoy» sí', async () => {
    const a = await pedido({ total: 23000 })
    await pagarDespues(a, 23000)
    const b = await pedido({ total: 10000 })
    const r = await resumirFiadoDeDiaPasado(db, DIA, { guardado: false }, HOY)
    expect(r).toMatchObject({ estado: 'AL_CORTE', diaCorte: DIA, corteAt: '2026-11-05T05:00:00.000Z', total: 33000, pendienteHoy: 10000, aproximados: [] })
    expect(b.id).toBeTruthy()
  })

  it('un pedido anulado sin fecha de anulación se deja fuera y se declara aproximado con su número', async () => {
    const sin = await pedido({ estado: 'ANULADO' })
    const r = await resumirFiadoDeDiaPasado(db, DIA, { guardado: false }, HOY)
    expect(r?.aproximados).toEqual([{ numero: sin.numero, motivos: ['SIN_FECHA_DE_ANULACION'] }])
    expect(r?.total).toBe(33000) // el aproximado no suma
  })

  it('con cierre guardado no recalcula la cifra: solo informa lo pendiente hoy', async () => {
    const r = await resumirFiadoDeDiaPasado(db, DIA, { guardado: true }, HOY)
    expect(r).toEqual({ estado: 'GUARDADO', diaCorte: DIA, pendienteHoy: 10000 })
    expect(r).not.toHaveProperty('total')
  })

  it('si el cálculo falla devuelve ERROR en vez de lanzar (el Cierre sigue funcionando)', async () => {
    const roto = { pedido: { findMany: async () => { throw new Error('boom') } }, receivableEntry: db.receivableEntry, historial: db.historial } as never
    expect(await resumirFiadoDeDiaPasado(roto, DIA, { guardado: false }, HOY)).toEqual({ estado: 'ERROR', diaCorte: DIA })
  })
})
