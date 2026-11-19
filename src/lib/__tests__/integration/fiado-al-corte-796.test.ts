// @tests #796 fase 2 — fiado a la fecha de corte reconstruido desde movimientos (PostgreSQL real, datos sintéticos)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { leerFiadoAlCorte } from '@/lib/fiado-al-corte-db'
import { corteFinDelDiaBogota } from '@/lib/fiado-al-corte'
import { leerExigibles } from '@/lib/entregas-exigibles-db'

const d = (iso: string): Date => new Date(iso)
// Corte = fin del 4-nov en Bogotá. Los hechos viven el 4-nov (antes) y del 5 al 10-nov (después).
const CORTE = corteFinDelDiaBogota('2026-11-04')
let adminId = ''

async function pedido(o: { total?: number; estado?: string; creado?: string; entregado?: string | null }) {
  const c = await db.cliente.create({ data: { nombre: 'Corte 796', telefono: randomUUID() } })
  const total = o.total ?? 23000
  const estado = (o.estado ?? 'ENTREGADO') as never
  // La base exige que un pedido anulado o cancelado tenga estadoPago ANULADO y saldo 0 (chk_pedido_estadopago_proyectado).
  const cerrado = ['ANULADO', 'CANCELADO'].includes(o.estado ?? '')
  return db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado, estadoEntrega: estado, estadoPago: cerrado ? 'ANULADO' : 'PENDIENTE',
    total, saldo: cerrado ? 0 : total, totalPagado: 0, fecha: d(o.creado ?? '2026-11-04T14:00:00Z'), createdAt: d(o.creado ?? '2026-11-04T14:00:00Z'),
    entregadoAt: o.entregado === null ? null : d(o.entregado ?? '2026-11-04T15:00:00Z') } })
}
const pago = (pedidoId: string, monto: number, cuando: string, ocurrido?: string) =>
  db.pago.create({ data: { pedidoId, metodo: 'EFECTIVO', monto, createdAt: d(cuando), ...(ocurrido ? { ocurridoAt: d(ocurrido) } : {}) } })
const fiado = async (id: string, corte: Date = CORTE) => (await leerFiadoAlCorte(db, corte, { id })).at(0)

describe('#796 fase 2 · leerFiadoAlCorte con PostgreSQL', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(disconnect)

  it('pagos: el de después del corte no baja el fiado del día; el de antes sí; el de oficina cuenta en su fecha de ocurrencia', async () => {
    const a = await pedido({})
    await pago(a.id, 23000, '2026-11-06T15:00:00Z')
    expect((await fiado(a.id))?.exigibleCentavos).toBe(2_300_000)
    const b = await pedido({})
    await pago(b.id, 10000, '2026-11-04T20:00:00Z')
    expect((await fiado(b.id))?.exigibleCentavos).toBe(1_300_000)
    const c = await pedido({})
    await pago(c.id, 23000, '2026-11-09T12:00:00Z', '2026-11-04T19:00:00Z') // registrado el 9-nov pero ocurrido el 4-nov
    expect((await fiado(c.id))?.exigibleCentavos).toBe(0)
  })

  it('una rebaja comercial aplicada después del corte se deshace: el pedido valía su total anterior', async () => {
    const p = await pedido({ total: 18400 })
    await db.pedidoReduccionComercial.create({ data: { pedidoId: p.id, producto: 'PACA_AGUA', cantidadReducida: 2, cantPedidoAntes: 10, cantPedidoDespues: 8,
      precio: 2300, monto: 4600, motivo: 'sintético', aceptadoPor: 'cliente', medio: 'PRESENCIAL', estado: 'APLICADA',
      solicitadoPorId: adminId, resueltoPorId: adminId, resueltoAt: d('2026-11-07T03:00:00Z'), totalAntes: 23000, totalDespues: 18400 } })
    expect(await fiado(p.id)).toMatchObject({ totalAlCorteCentavos: 2_300_000, exigibleCentavos: 2_300_000 })
    expect((await fiado(p.id, corteFinDelDiaBogota('2026-11-10')))?.exigibleCentavos).toBe(1_840_000)
  })

  it('una corrección de precio aplicada después del corte también se deshace', async () => {
    const p = await pedido({ total: 20000 })
    await db.pedidoCorreccionPrecio.create({ data: { pedidoId: p.id, producto: 'PACA_AGUA', cantidad: 10, precioAnterior: 2300, precioNuevo: 2000,
      delta: -3000, motivo: 'sintético', estado: 'APLICADA', solicitadoPorId: adminId, resueltoPorId: adminId, resueltoAt: d('2026-11-08T12:00:00Z'),
      totalAntes: 23000, totalDespues: 20000 } })
    expect((await fiado(p.id))?.totalAlCorteCentavos).toBe(2_300_000)
  })

  it('entregado después del corte: todavía no era fiado; entregado antes: sí', async () => {
    const tarde = await pedido({ entregado: '2026-11-06T22:00:00Z' })
    expect((await fiado(tarde.id))?.exigibleCentavos).toBe(0)
    const temprano = await pedido({ entregado: '2026-11-04T10:00:00Z' })
    expect((await fiado(temprano.id))?.exigibleCentavos).toBe(2_300_000)
  })

  it('una reversión (ReceivableEntry) de después del corte no cambia el día; la de antes devuelve la deuda', async () => {
    const p = await pedido({})
    await pago(p.id, 23000, '2026-11-04T16:00:00Z')
    await db.receivableEntry.create({ data: { pedidoId: p.id, clienteId: p.clienteId, tipo: 'REVERSION', monto: 23000, saldoResultante: 23000, totalPagadoResultante: 0, createdAt: d('2026-11-06T16:00:00Z') } })
    expect((await fiado(p.id))?.exigibleCentavos).toBe(0)
    const q = await pedido({})
    await pago(q.id, 23000, '2026-11-04T16:00:00Z')
    await db.receivableEntry.create({ data: { pedidoId: q.id, clienteId: q.clienteId, tipo: 'REVERSION', monto: 8000, saldoResultante: 8000, totalPagadoResultante: 15000, createdAt: d('2026-11-04T17:00:00Z') } })
    expect((await fiado(q.id))?.exigibleCentavos).toBe(800_000)
  })

  it('anulado después del corte existía; anulado antes no; sin registro de la anulación se declara aproximado', async () => {
    const despues = await pedido({ estado: 'ANULADO' })
    await db.historial.create({ data: { entidad: 'Pedido', registroId: despues.id, accion: 'UPDATE', datos: JSON.stringify({ estado: 'ANULADO', motivo: 'x', hijosAnulados: 0 }), fecha: d('2026-11-06T15:00:00Z') } })
    expect(await fiado(despues.id)).toMatchObject({ existia: true, exigibleCentavos: 2_300_000, aproximado: false })
    const antes = await pedido({ estado: 'CANCELADO' })
    await db.historial.create({ data: { entidad: 'Pedido', registroId: antes.id, accion: 'UPDATE', datos: JSON.stringify({ estado: 'CANCELADO', motivo: 'x' }), fecha: d('2026-11-04T18:00:00Z') } })
    expect(await fiado(antes.id)).toMatchObject({ existia: false, exigibleCentavos: 0 })
    const sin = await pedido({ estado: 'ANULADO' })
    expect(await fiado(sin.id)).toMatchObject({ existia: false, aproximado: true, motivosAproximado: ['SIN_FECHA_DE_ANULACION'] })
  })

  it('entregas por evento (EntregaExigible): solo cuentan las anteriores al corte', async () => {
    const p = await pedido({ estado: 'EN_RUTA', entregado: null })
    await db.entregaExigible.createMany({ data: [
      { pedidoId: p.id, eventoId: randomUUID(), entregadoAt: d('2026-11-04T16:00:00Z'), valorEntregado: 10000, lineas: [] },
      { pedidoId: p.id, eventoId: randomUUID(), entregadoAt: d('2026-11-05T16:00:00Z'), valorEntregado: 13000, lineas: [] },
    ] })
    expect((await fiado(p.id))?.exigibleCentavos).toBe(1_000_000)
    expect((await fiado(p.id, corteFinDelDiaBogota('2026-11-05')))?.exigibleCentavos).toBe(2_300_000)
  })

  it('un pedido creado después del corte no existía', async () => {
    const p = await pedido({ creado: '2026-11-06T12:00:00Z', entregado: '2026-11-06T13:00:00Z' })
    expect(await fiado(p.id)).toMatchObject({ existia: false, exigibleCentavos: 0 })
  })

  it('consistencia: con un corte en el futuro, el fiado reconstruido de un pedido entregado es su saldo actual', async () => {
    const p = await pedido({ total: 30000 })
    await pago(p.id, 12000, '2026-11-05T12:00:00Z')
    await db.pedido.update({ where: { id: p.id }, data: { totalPagado: 12000, saldo: 18000, estadoPago: 'PARCIAL' } })
    const actual = (await leerExigibles(db, { id: p.id })).get(p.id) ?? -1
    expect(Math.round(actual * 100)).toBe(1_800_000)
    expect((await fiado(p.id, d('2030-01-01T00:00:00Z')))?.exigibleCentavos).toBe(1_800_000)
  })
})
