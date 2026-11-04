// @tests #641 — «Pagar» de nómina con medio de pago: solo el efectivo de la caja genera el egreso que resta del cierre;
// los gastos manuales de NÓMINA se rechazan. Handlers y PostgreSQL reales; trabajadores y montos sintéticos.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { PUT as accionNomina } from '@/app/api/nomina/[id]/route'
import { POST as crearGasto } from '@/app/api/gastos/route'

let adminId: string
const put = (id: string, body: unknown) => accionNomina(
  new NextRequest(`http://localhost/api/nomina/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id }) },
)

async function nominaPendiente(total = 120000) {
  const t = await testPrisma.trabajador.create({ data: { nombre: `Sintético ${Math.random()}`, rol: 'SELLADOR', tipoPago: 'FIJO', salarioFijo: total } })
  const n = await testPrisma.nomina.create({
    data: { trabajadorId: t.id, fechaInicio: new Date(), fechaFin: new Date(), salario: total, total, estado: 'PENDIENTE' },
  })
  return { t, n }
}
const gastosNomina = (trabajadorId: string) => testPrisma.gasto.findMany({ where: { categoria: 'NOMINA', trabajadorId } })

describe('#641 — pago de nómina con medio y gastos manuales NÓMINA', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('en efectivo de la caja: guarda el medio y crea UN egreso por el total', async () => {
    const { t, n } = await nominaPendiente(120000)
    const res = await put(n.id, { action: 'PAGAR' }) // sin medio = efectivo (clientes anteriores)
    expect(res.status).toBe(200)
    const g = await gastosNomina(t.id)
    expect(g).toHaveLength(1)
    expect(Number(g[0].monto)).toBe(120000)
    const guardada = await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })
    expect(guardada.estado).toBe('PAGADA')
    expect(guardada.metodoPago).toBe('EFECTIVO')
    expect(guardada.pagoFueraDeCaja).toBe(false)
  })

  it('por Nequi o por fuera de la caja: queda pagada pero NO crea egreso de caja', async () => {
    for (const body of [{ metodo: 'NEQUI' }, { metodo: 'EFECTIVO', fueraDeCaja: true }]) {
      const { t, n } = await nominaPendiente(90000)
      const res = await put(n.id, { action: 'PAGAR', ...body })
      expect(res.status).toBe(200)
      expect(await gastosNomina(t.id)).toHaveLength(0)
      const guardada = await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })
      expect(guardada.estado).toBe('PAGADA')
      expect(guardada.metodoPago).toBe(body.metodo as 'NEQUI' | 'EFECTIVO')
      expect(guardada.pagoFueraDeCaja).toBe('fueraDeCaja' in body)
    }
  })

  it('doble toque: no paga ni crea egreso dos veces', async () => {
    const { t, n } = await nominaPendiente()
    expect((await put(n.id, { action: 'PAGAR' })).status).toBe(200)
    expect((await put(n.id, { action: 'PAGAR' })).status).not.toBe(200)
    expect(await gastosNomina(t.id)).toHaveLength(1)
  })

  it('anular una nómina pagada en efectivo revierte el egreso; una pagada por Nequi no crea reversión', async () => {
    const efectivo = await nominaPendiente(50000)
    await put(efectivo.n.id, { action: 'PAGAR' })
    const nequi = await nominaPendiente(70000)
    await put(nequi.n.id, { action: 'PAGAR', metodo: 'NEQUI' })
    const reversiones = () => testPrisma.gasto.findMany({ where: { descripcion: { startsWith: 'Reversión nómina anulada' } } })
    const antes = (await reversiones()).length

    expect((await put(nequi.n.id, { action: 'ANULAR' })).status).toBe(200)
    expect((await reversiones()).length).toBe(antes)

    expect((await put(efectivo.n.id, { action: 'ANULAR' })).status).toBe(200)
    const despues = await reversiones()
    expect(despues.length).toBe(antes + 1)
    expect(despues.some((r) => Number(r.monto) === -50000)).toBe(true)
  })

  it('un medio inválido se rechaza sin pagar', async () => {
    const { n } = await nominaPendiente()
    expect((await put(n.id, { action: 'PAGAR', metodo: 'BONO' })).status).toBe(400)
    expect((await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })).estado).toBe('PENDIENTE')
  })

  it('un gasto manual de NÓMINA se rechaza (422); los demás siguen funcionando', async () => {
    const post = (categoria: string) => crearGasto(new NextRequest('http://localhost/api/gastos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, descripcion: 'Pago a Carlos', monto: 80000 }),
    }))
    const bloqueado = await post('NOMINA')
    expect(bloqueado.status).toBe(422)
    expect((await bloqueado.json()).error?.code ?? 'NOMINA_NO_ES_GASTO').toBe('NOMINA_NO_ES_GASTO')
    expect(await testPrisma.gasto.count({ where: { categoria: 'NOMINA', descripcion: 'Pago a Carlos' } })).toBe(0)
    expect((await post('OTRO')).status).toBe(201)
  })
})
