// @tests #473 — un pedido de CONSUMIDOR_FINAL (cliente sin nombre) nunca puede quedar
// ENTREGADO con saldo, sin importar quién entrega (oficina, repartidor) ni por qué
// camino (entrega normal, retiro del cliente, última entrega parcial). Postgres real,
// handler REAL; cada prueba mira la base de datos.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as entrega } from '@/app/api/pedidos/[id]/entrega/route'
import { crearPedidoUseCase } from '@/modules/pedidos'

let adminId: string
const unico = () => `an-${randomUUID()}`

function sesion(role: 'ADMIN' | 'ASISTENTE') {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}

/** Pedido de 5 pacas en EN_RUTA, debido por completo, a nombre de `anonimo` o de un cliente real. */
async function pedidoEnRuta(anonimo: boolean) {
  await testPrisma.cliente.upsert({
    where: { id: 'CONSUMIDOR_FINAL' }, update: {},
    create: { id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', telefono: '', direccion: '', activo: false },
  })
  const c = await testPrisma.cliente.create({
    data: { nombre: 'Tmp', telefono: `34${Math.floor(Math.random() * 1e8)}`, direccion: 'x', barrio: 'y', limitePedidosFiados: 20, activo: true },
  })
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 5 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  // Dato heredado / editado después: el pedido queda a nombre del anónimo con saldo.
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: { clienteId: anonimo ? 'CONSUMIDOR_FINAL' : c.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' },
  })
  await testPrisma.factura.updateMany({ where: { pedidoId: pedido.id }, data: { clienteId: anonimo ? 'CONSUMIDOR_FINAL' : c.id } })
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  return { id: pedido.id, total: Number(fila.total) }
}

async function entregar(id: string, cuerpo: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/pedidos/${id}/entrega`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offlineId: unico(), ...cuerpo }),
  })
  const res = await entrega(req, { params: Promise.resolve({ id }) })
  return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

const completo = { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }] }
const fila = (id: string) => testPrisma.pedido.findUniqueOrThrow({ where: { id } })

describe('#473 — entrega a un cliente sin nombre: nunca con saldo (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => sesion('ADMIN'))

  for (const rol of ['ADMIN', 'ASISTENTE'] as const) {
    it(`${rol} no puede entregar un anónimo dejando saldo: 422 y no cambia nada`, async () => {
      sesion(rol)
      const p = await pedidoEnRuta(true)
      const r = await entregar(p.id, completo)
      expect(r.status).toBe(422)
      expect(JSON.stringify(r.body)).toContain('DEUDOR_REQUERIDO')
      const f = await fila(p.id)
      expect(f.estadoEntrega).toBe('EN_RUTA')
      expect(Number(f.saldo)).toBe(p.total)
    })
  }

  it('el retiro del cliente tampoco deja saldo a un anónimo', async () => {
    const p = await pedidoEnRuta(true)
    const r = await entregar(p.id, { ...completo, clienteRetiro: true })
    expect(r.status).toBe(422)
    expect((await fila(p.id)).estadoEntrega).not.toBe('ENTREGADO')
  })

  it('un cobro parcial a un anónimo se rechaza y no deja pago a medias', async () => {
    const p = await pedidoEnRuta(true)
    const r = await entregar(p.id, { ...completo, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect((await fila(p.id)).estadoEntrega).not.toBe('ENTREGADO')
    expect(await testPrisma.pago.count({ where: { pedidoId: p.id } })).toBe(0)
  })

  it('un anónimo que paga todo se entrega bien', async () => {
    const p = await pedidoEnRuta(true)
    const trab = await testPrisma.trabajador.create({ data: { nombre: `AN ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true } })
    const emb = await testPrisma.embarque.create({ data: { trabajadorId: trab.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 } })
    const r = await entregar(p.id, { ...completo, pagos: [{ metodo: 'EFECTIVO', monto: p.total }], embarqueId: emb.id })
    expect(r.status).toBe(200)
    const f = await fila(p.id)
    expect(f.estadoEntrega).toBe('ENTREGADO')
    expect(Number(f.saldo)).toBe(0)
  })

  it('una entrega parcial a un anónimo (sigue abierta) no se bloquea', async () => {
    const p = await pedidoEnRuta(true)
    const r = await entregar(p.id, { itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }] })
    expect(r.status).toBe(200)
    expect((await fila(p.id)).estadoEntrega).not.toBe('ENTREGADO')
  })

  it('un cliente real puede quedar con saldo (la regla es solo del anónimo)', async () => {
    const p = await pedidoEnRuta(false)
    const r = await entregar(p.id, completo)
    expect(r.status).toBe(200)
    const f = await fila(p.id)
    expect(f.estadoEntrega).toBe('ENTREGADO')
    expect(Number(f.saldo)).toBe(p.total)
  })

  it('reintentar con la misma clave después de entregar no vuelve a evaluar ni duplica', async () => {
    const p = await pedidoEnRuta(false)
    const clave = unico()
    expect((await entregar(p.id, { ...completo, offlineId: clave })).status).toBe(200)
    const otra = await entregar(p.id, { ...completo, offlineId: clave })
    expect(otra.status).toBe(200)
    expect(otra.body.deduped).toBe(true)
  })
})
