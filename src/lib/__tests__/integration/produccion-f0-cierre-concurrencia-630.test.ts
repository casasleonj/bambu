// @tests #630 F0 — carrera Producción ↔ Cierre del día.
// PostgreSQL real: la transacción del cierre simulado sostiene CIERRE:fecha
// mientras POST/PUT intentan registrar datos; al confirmar cierre no pueden guardar.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as crearProduccion } from '@/app/api/produccion/route'
import { PUT as corregirProduccion } from '@/app/api/produccion/[id]/route'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'
import { acquireAdvisoryLockTx } from '@/lib/locks'

let adminId: string
const dia = (dias: number) => dayInBogota(new Date(Date.now() - dias * 86_400_000))
const post = (body: unknown) => new NextRequest('http://localhost/api/produccion', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const put = (id: string, body: unknown) => corregirProduccion(
  new NextRequest(`http://localhost/api/produccion/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id }) },
)
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador cierre ${randomUUID()}`, rol: 'SELLADOR',
    tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const payload = (trabajadorId: string, fecha: string) => ({
  trabajadorId, fecha, turno: 'MANANA', obs: 'Prueba sintética de concurrencia',
  items: [
    { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, stockFinFisico: 10 },
    { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0, stockFinFisico: 0 },
  ],
})

/** Simula la fase comprometida de Cierre: lock oficial, luego inserción y commit. */
async function cerrarMientras(op: () => Promise<Response>, fecha: string) {
  const inicio = startOfDayInBogota(fecha)
  let liberar: () => void = () => undefined
  let avisarLock: () => void = () => undefined
  const cuandoBloqueado = new Promise<void>(resolve => { avisarLock = resolve })
  const cuandoLiberado = new Promise<void>(resolve => { liberar = resolve })
  const cierre = testPrisma.$transaction(async tx => {
    await acquireAdvisoryLockTx(tx, 'CIERRE', inicio.toISOString())
    avisarLock()
    await cuandoLiberado
    await tx.cierreDia.create({ data: { fecha: inicio, cerradoPor: adminId } })
  }, { timeout: 10000 })

  await cuandoBloqueado
  let pendiente: Promise<Response> | null = null
  try {
    pendiente = op()
    // Esperar a que la operación llegue al lock del servidor.
    await new Promise<void>(resolve => setTimeout(resolve, 300))
  } finally {
    liberar()
  }
  await cierre
  if (!pendiente) throw new Error('La operación no empezó')
  return pendiente
}

describe('#630 F0 — no registrar Producción luego de confirmar Cierre', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('POST concurrente: al cerrar antes de confirmar, no crea producción tardía', async () => {
    const s = await sellador()
    const fecha = dia(9)
    const res = await cerrarMientras(() => crearProduccion(post(payload(s.id, fecha))), fecha)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('DIA_CERRADO')
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(0)
  })

  it('PUT concurrente: no aplica la corrección después de confirmar cierre', async () => {
    const s = await sellador()
    const fecha = dia(8)
    expect((await crearProduccion(post(payload(s.id, fecha)))).status).toBe(201)
    const existente = await testPrisma.produccion.findFirstOrThrow({
      where: { trabajadorId: s.id }, include: { items: true },
    })
    const original = existente.items.find(i => i.producto === 'PACA_AGUA')?.producido
    const res = await cerrarMientras(() => put(existente.id, {
      obs: 'Intento concurrente que debe rechazarse',
      items: [{ producto: 'PACA_AGUA', conteoA: 20, conteoB: 20 }, { producto: 'PACA_HIELO' }],
    }), fecha)
    expect(res.status).toBe(409)
    expect(await testPrisma.produccionItem.findFirstOrThrow({
      where: { produccionId: existente.id, producto: 'PACA_AGUA' },
    })).toMatchObject({ producido: original })
  })
})
