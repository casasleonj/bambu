// @tests #696 — GET /api/clientes/[id]/historial incluye los movimientos del saldo a favor (Postgres real, handlers REALES).
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
import { GET as historial } from '@/app/api/clientes/[id]/historial/route'

let adminId: string
const sesion = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const leer = (id: string, query = '') =>
  historial(new NextRequest(`http://localhost/api/clientes/${id}/historial?pageSize=50${query}`), { params: Promise.resolve({ id }) })

async function clienteConIngreso(createdAt: Date) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Ana${randomUUID().slice(0, 4)}`, apellido: 'Ruiz', telefono: `35${Math.floor(Math.random() * 1e8)}`, direccion: 'Calle 1', barrio: 'Centro', activo: true },
  })
  await testPrisma.ingresoSaldoFavor.create({
    data: { clienteId: cliente.id, metodo: 'EFECTIVO', monto: 2500, origen: 'PAGAR_FIADO', offlineId: randomUUID(), createdById: adminId, createdAt },
  })
  return cliente.id
}

describe('#696 GET /api/clientes/[id]/historial — saldo a favor (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => sesion('ADMIN'))

  it('un ingreso por cobro sale como evento SALDO_FAVOR con signo, monto y origen', async () => {
    const id = await clienteConIngreso(new Date())
    const body = await (await leer(id)).json()
    expect(body.saldoFavorNoDisponible).toBe(false)
    const ev = body.events.find((e: { tipo: string }) => e.tipo === 'SALDO_FAVOR')
    expect(ev).toBeTruthy()
    expect(ev.monto).toBe(2500)
    expect(ev.metadata.movimiento).toMatchObject({ tipo: 'ENTRADA_COBRO', signo: 1, monto: 2500, metodo: 'EFECTIVO' })
  })

  it('respeta el rango de meses: un ingreso de hace 2 años no sale en 12 meses y sí en «todo»', async () => {
    const id = await clienteConIngreso(new Date(Date.now() - 800 * 24 * 3600 * 1000))
    const reciente = await (await leer(id, '&meses=12')).json()
    expect(reciente.events.some((e: { tipo: string }) => e.tipo === 'SALDO_FAVOR')).toBe(false)
    const todo = await (await leer(id, '&meses=todo')).json()
    expect(todo.events.some((e: { tipo: string }) => e.tipo === 'SALDO_FAVOR')).toBe(true)
  })

  it('el repartidor no ve el saldo a favor (el resto del historial sigue igual)', async () => {
    const id = await clienteConIngreso(new Date())
    sesion('REPARTIDOR')
    const res = await leer(id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events.some((e: { tipo: string }) => e.tipo === 'SALDO_FAVOR')).toBe(false)
  })
})
