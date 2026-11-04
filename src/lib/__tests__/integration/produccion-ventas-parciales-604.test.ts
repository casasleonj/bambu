// @tests #604 — Producción cuenta las entregas parciales en lo vendido del día, con la misma regla
// que el cierre de caja y el dashboard (#599/#600). Handlers/consultas y PostgreSQL reales; datos sintéticos.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
  requirePermission: vi.fn(async () => ({ user: actor })),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

import { getVentasDelDia } from '@/lib/ventas'
import { GET as cierre } from '@/app/api/cierre/route'
import { GET as previewProduccion } from '@/app/api/produccion/preview/route'

const dia = '2026-03-24'
const mediodia = new Date(`${dia}T12:00:00-05:00`)

async function pedido(estadoEntrega: 'ENTREGADO' | 'EN_RUTA' | 'PENDIENTE' | 'ANULADO' | 'CANCELADO', ent: { agua?: number; hielo?: number; botellon?: number }) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true },
  })
  const anulado = estadoEntrega === 'ANULADO' || estadoEntrega === 'CANCELADO'
  return testPrisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: mediodia,
    estado: estadoEntrega, estadoEntrega, estadoPago: anulado ? 'ANULADO' : 'PENDIENTE',
    total: 10000, saldo: anulado ? 0 : 10000, totalPagado: 0,
    cPacaAguaEnt: ent.agua ?? 0, cPacaHieloEnt: ent.hielo ?? 0, cBotellonFabEnt: ent.botellon ?? 0,
  } })
}

describe('#604 — lo vendido del día en Producción cuenta las entregas parciales', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  beforeEach(async () => { await testPrisma.pedido.deleteMany({}) })
  afterAll(disconnect)

  it('suma entregados + parciales; ignora pendientes sin entrega, anulados y cancelados', async () => {
    await pedido('ENTREGADO', { agua: 10, hielo: 4, botellon: 1 })
    await pedido('EN_RUTA', { agua: 15, hielo: 5 })      // entrega parcial: sigue en ruta con unidades ya entregadas
    await pedido('PENDIENTE', {})                          // sin nada entregado: no es venta
    await pedido('ANULADO', { agua: 99 })                  // nunca cuenta
    await pedido('CANCELADO', { hielo: 99 })               // nunca cuenta
    const v = await getVentasDelDia(mediodia)
    expect(v.aguaVendida).toBe(25)
    expect(v.hieloVendido).toBe(9)
    expect(v.botellonVendido).toBe(1)
  })

  it('Producción y el cierre de caja devuelven el mismo vendido para la misma fecha', async () => {
    await pedido('ENTREGADO', { agua: 10, hielo: 4 })
    await pedido('EN_RUTA', { agua: 15, hielo: 5 })
    const v = await getVentasDelDia(mediodia)
    const res = await cierre(new NextRequest(`http://localhost/api/cierre?fecha=${dia}`))
    expect(res.status).toBe(200)
    const c = (await res.json()).cierre
    expect(v.aguaVendida).toBe(c.aguaVendida)
    expect(v.hieloVendido).toBe(c.hieloVendido)
    expect(v.botellonVendido).toBe(c.botellonVendido)
    expect(c.aguaVendida).toBe(25)
  })

  it('la vista previa de Producción descuenta lo entregado parcialmente del stock esperado', async () => {
    await pedido('ENTREGADO', { agua: 10 })
    await pedido('PENDIENTE', { agua: 15 }) // entrega parcial de un pedido aún pendiente
    const res = await previewProduccion(new NextRequest(`http://localhost/api/produccion/preview?fecha=${dia}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ventasAgua).toBe(25) // 10 entregados + 15 de la entrega parcial
    expect(body.ventasHielo).toBe(0)
  })
})
