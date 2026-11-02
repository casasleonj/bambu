// @tests #407 — POST /api/pedidos/recurrentes informa `deduped` correctamente.
// Antes, toda generación con `offlineId` salía como duplicada: la ruta contaba
// los pedidos con `recurrenteBatchId = offlineId` y los recién creados también
// lo llevan (200 en vez de 201, sin evento `pedido.created`). Y un reintento
// real ni siquiera llegaba a la detección: las plantillas ya habían avanzado su
// calendario y la ruta respondía 409. Contra Postgres real:
//   1. una generación nueva responde 201, sin `deduped`, y emite el evento;
//   2. un reintento con el mismo offlineId responde 200 con `deduped: true`,
//      devuelve los mismos pedidos, no crea otros y no emite eventos.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.hoisted(() => ({ user: { id: '', role: 'ADMIN' } }))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: auth.user })),
  requireRole: vi.fn(async () => ({ user: auth.user })),
}))
const realtime = vi.hoisted(() => ({ publish: vi.fn(async () => ({})) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: realtime.publish }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, uniqueId } from './setup'
import { POST } from '@/app/api/pedidos/recurrentes/route'

/** Ayer a mediodía UTC, saltando el domingo (el domingo se reprograma). */
function ayerHabil(): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - 1)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1)
  return d
}

async function crearPlantilla(tag: string, proxGeneracion = new Date('2026-09-01T12:00:00Z') /* martes */) {
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: `Rec Hub ${tag}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: 'Calle 1',
      limitePedidosFiados: 999,
      activo: true,
    },
  })
  const plantilla = await testPrisma.plantillaRecurrente.create({
    data: {
      clienteId: cliente.id,
      activo: true,
      cadaNDias: 7,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      proxGeneracion,
      ultimaGeneracion: null,
      productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] },
    },
  })
  return plantilla.id
}

async function generar(plantillaId: string, offlineId: string) {
  const req = new NextRequest('http://localhost/api/pedidos/recurrentes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisiones: [{ recurrenteId: plantillaId, decision: 'NORMAL' }], offlineId }),
  })
  const res = await POST(req)
  const json = await res.json()
  return { status: res.status, data: (json.data ?? json) as { generados: number; pedidos: Array<{ id: string }>; deduped?: boolean } }
}

describe('#407 — generación de recurrentes desde el Hub: deduped solo en reintentos', () => {
  beforeAll(async () => {
    await resetAndSeed()
    auth.user.id = (await getAdminUser()).id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('generación nueva: 201, sin deduped, con evento; reintento: 200, deduped, mismos pedidos, sin evento', async () => {
    const plantillaId = await crearPlantilla('a')
    const lote = uniqueId('lote')

    realtime.publish.mockClear()
    const primero = await generar(plantillaId, lote)
    expect(primero.status, JSON.stringify(primero.data)).toBe(201)
    expect(primero.data.deduped).toBeUndefined()
    expect(primero.data.generados).toBe(1)
    const ids = primero.data.pedidos.map((p) => p.id)
    expect(realtime.publish.mock.calls).toEqual(ids.map((id) => ['pedido.created', id]))

    realtime.publish.mockClear()
    const reintento = await generar(plantillaId, lote)
    expect(reintento.status, JSON.stringify(reintento.data)).toBe(200)
    expect(reintento.data.deduped).toBe(true)
    expect(reintento.data.pedidos.map((p) => p.id)).toEqual(ids)
    expect(realtime.publish).not.toHaveBeenCalled()
    expect(await testPrisma.pedido.count({ where: { idOrigen: plantillaId } })).toBe(1)
  })

  it('un offlineId nuevo sobre una plantilla ya generada sigue respondiendo 409', async () => {
    // Con la próxima fecha en el pasado reciente, tras generar la siguiente
    // queda en el futuro: la plantilla ya no está pendiente.
    const plantillaId = await crearPlantilla('b', ayerHabil())
    expect((await generar(plantillaId, uniqueId('lote'))).status).toBe(201)
    expect((await generar(plantillaId, uniqueId('otro-lote'))).status).toBe(409)
  })
})
