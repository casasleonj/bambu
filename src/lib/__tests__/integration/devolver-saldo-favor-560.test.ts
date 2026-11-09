// @tests #560 — devolver el saldo a favor al cliente: solo ADMIN, tope = saldo, idempotente, y la caja del
// cierre de hoy resta SOLO la devolución en efectivo, una sola vez. Postgres real, handlers REALES.

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

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as devolver } from '@/app/api/clientes/[id]/saldo-favor/devolver/route'
import { GET as cierreGet } from '@/app/api/cierre/route'

let adminId: string
let n = 0
const unico = () => `dev-${randomUUID()}`

function sesion(role: 'ADMIN' | 'CONTADOR' | 'ASISTENTE') {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}
async function clienteConSaldo(saldo: number) {
  n += 1
  return testPrisma.cliente.create({
    data: { nombre: `Cliente Devolución ${n}`, telefono: `34000${String(n).padStart(5, '0')}`, direccion: 'Calle 1', barrio: 'Centro', saldoFavor: saldo, activo: true },
  })
}
const llamar = (id: string, body: unknown) =>
  devolver(new NextRequest(`http://localhost/api/clientes/${id}/saldo-favor/devolver`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) })
const saldoDe = async (id: string) => Number((await testPrisma.cliente.findUniqueOrThrow({ where: { id } })).saldoFavor)

async function cierreDeHoy() {
  await testPrisma.cierreDia.deleteMany({})
  const req = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest
  const body = await (await cierreGet(req)).json()
  const c = body.cierre ?? body
  return { ajustes: Number(c.ajustesDeCobros ?? c.abonos?.ajustesDeCobros ?? 0), cobroCartera: Number(c.cobroCartera), cobroCarteraEfectivo: Number(c.cobroCarteraEfectivo) }
}

describe('#560 — devolver el saldo a favor (Postgres real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  beforeEach(() => sesion('ADMIN'))

  it('el ADMIN devuelve en efectivo: baja el saldo, queda el registro y la auditoría', async () => {
    const c = await clienteConSaldo(10000)
    const res = await llamar(c.id, { monto: 4000, metodo: 'EFECTIVO', motivo: 'Pedido anulado', offlineId: unico() })
    expect(res.status).toBe(201)
    expect(await saldoDe(c.id)).toBe(6000)
    const filas = await testPrisma.devolucionSaldoFavor.findMany({ where: { clienteId: c.id } })
    expect(filas).toHaveLength(1)
    expect(Number(filas[0].monto)).toBe(4000)
    expect(filas[0].autorizadoPorId).toBe(adminId)
    const aud = await testPrisma.historial.findMany({ where: { registroId: c.id } })
    expect(aud.some((h) => String(h.datos).includes('DEVOLUCION_SALDO_FAVOR') && String(h.datos).includes('Pedido anulado'))).toBe(true)
  })

  it('no se puede devolver más que el saldo (409) y nada cambia', async () => {
    const c = await clienteConSaldo(1000)
    const res = await llamar(c.id, { monto: 1500, metodo: 'EFECTIVO', motivo: 'Prueba de tope', offlineId: unico() })
    expect(res.status).toBe(409)
    expect(await saldoDe(c.id)).toBe(1000)
    expect(await testPrisma.devolucionSaldoFavor.count({ where: { clienteId: c.id } })).toBe(0)
  })

  it('el reintento con la misma referencia no devuelve dos veces', async () => {
    const c = await clienteConSaldo(5000)
    const body = { monto: 2000, metodo: 'NEQUI', motivo: 'Reintento', offlineId: unico() }
    expect((await llamar(c.id, body)).status).toBe(201)
    const segunda = await llamar(c.id, body)
    expect(segunda.status).toBe(200)
    expect((await segunda.json()).deduped).toBe(true)
    expect(await saldoDe(c.id)).toBe(3000)
    expect(await testPrisma.devolucionSaldoFavor.count({ where: { clienteId: c.id } })).toBe(1)
  })

  it('dos devoluciones simultáneas por todo el saldo: una gana y la otra recibe 409 (saldo nunca negativo)', async () => {
    const c = await clienteConSaldo(3000)
    const [a, b] = await Promise.all([
      llamar(c.id, { monto: 3000, metodo: 'EFECTIVO', motivo: 'Simultánea A', offlineId: unico() }),
      llamar(c.id, { monto: 3000, metodo: 'EFECTIVO', motivo: 'Simultánea B', offlineId: unico() }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await saldoDe(c.id)).toBe(0)
  })

  it('solo el ADMIN: CONTADOR y ASISTENTE reciben 403 y nada cambia', async () => {
    const c = await clienteConSaldo(2000)
    for (const rol of ['CONTADOR', 'ASISTENTE'] as const) {
      sesion(rol)
      expect((await llamar(c.id, { monto: 500, metodo: 'EFECTIVO', motivo: 'Sin permiso', offlineId: unico() })).status).toBe(403)
    }
    expect(await saldoDe(c.id)).toBe(2000)
  })

  it('validaciones: BONO, monto 0 y sin motivo se rechazan; la venta anónima no tiene saldo', async () => {
    const c = await clienteConSaldo(2000)
    for (const malo of [
      { monto: 500, metodo: 'BONO', motivo: 'No se devuelve', offlineId: unico() },
      { monto: 0, metodo: 'EFECTIVO', motivo: 'Cero', offlineId: unico() },
      { monto: 500, metodo: 'EFECTIVO', motivo: '', offlineId: unico() },
    ]) expect((await llamar(c.id, malo)).status).toBe(400)
    expect((await llamar('CONSUMIDOR_FINAL', { monto: 500, metodo: 'EFECTIVO', motivo: 'Anónimo', offlineId: unico() })).status).toBe(422)
    expect(await saldoDe(c.id)).toBe(2000)
  })

  it('la base impide una devolución con monto ≤ 0 o en BONO (CHECK)', async () => {
    const c = await clienteConSaldo(100)
    await expect(testPrisma.$executeRawUnsafe(
      `INSERT INTO "DevolucionSaldoFavor"(id,"clienteId",metodo,monto,motivo,"offlineId","autorizadoPorId") VALUES ('x1','${c.id}','BONO',10,'m','${unico()}','${adminId}')`,
    )).rejects.toThrow()
  })

  it('el cierre de hoy resta SOLO la devolución en efectivo y la cuenta una vez', async () => {
    const c = await clienteConSaldo(9000)
    const antes = await cierreDeHoy()
    await llamar(c.id, { monto: 3000, metodo: 'EFECTIVO', motivo: 'Caja efectivo', offlineId: unico() })
    await llamar(c.id, { monto: 2000, metodo: 'NEQUI', motivo: 'Caja digital', offlineId: unico() })
    const despues = await cierreDeHoy()
    // El efectivo del cobro de cartera baja 3000 (solo la devolución en efectivo)…
    expect(despues.cobroCarteraEfectivo - antes.cobroCarteraEfectivo).toBe(-3000)
    // …y el total de cobros baja 5000 (la digital también es dinero que salió, pero no de la caja física).
    expect(despues.cobroCartera - antes.cobroCartera).toBe(-5000)
    // Releer el cierre no la cuenta otra vez.
    const otra = await cierreDeHoy()
    expect(otra.cobroCarteraEfectivo).toBe(despues.cobroCarteraEfectivo)
  })
})
