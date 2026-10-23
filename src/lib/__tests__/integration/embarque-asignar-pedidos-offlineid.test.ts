// @tests #433 — "Nuevo Embarque": crear el embarque y asignar los pedidos elegidos
// (Postgres real, handlers reales de POST /api/embarques y PUT /api/embarques/[id]).
//
// El wizard crea con POST (guarda `Embarque.offlineId`) y asigna con PUT. Si el PUT
// reenvía ese mismo `offlineId`, el servidor lo toma por un reintento y responde
// `deduped: true` SIN asignar: el embarque queda vacío y la pantalla dice "éxito".
// La asignación no lleva `offlineId`; y debe ser idempotente.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST } from '@/app/api/embarques/route'
import { PUT } from '@/app/api/embarques/[id]/route'
import { crearPedidoUseCase } from '@/modules/pedidos'

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('#433 — crear embarque y asignar pedidos (wizard "Nuevo Embarque")', () => {
  let adminId: string
  let seq = 0

  /** Un trabajador por embarque: no puede tener dos abiertos a la vez. */
  async function crearEmbarque(offlineId: string) {
    seq += 1
    const trabajadorId = (await testPrisma.trabajador.create({
      data: { nombre: `Rep Asignar ${seq}`, rol: 'REPARTIDOR', usaMoto: true, capacidadKg: 500 },
    })).id
    const req = new NextRequest('http://localhost/api/embarques', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trabajadorId, horaSalida: '08:00', carga: [{ producto: 'PACA_AGUA', cargadas: 5 }], offlineId }),
    })
    const res = await POST(req)
    const body = (await res.json()) as Json
    return { status: res.status, id: body.embarque?.id as string }
  }

  async function asignar(embarqueId: string, body: Record<string, unknown>) {
    const req = new NextRequest(`http://localhost/api/embarques/${embarqueId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: embarqueId }) })
    return { status: res.status, body: (await res.json()) as Json }
  }

  async function pedidoNuevo() {
    seq += 1
    const clienteId = (await testPrisma.cliente.create({
      data: { nombre: `Cliente Asignar ${seq}`, telefono: `31${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`, direccion: 'Calle 1 # 2-3', barrio: 'Centro', activo: true },
    })).id
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }] as never,
      pagos: [], createdById: adminId, createdByRole: 'ADMIN',
      offlineId: `asig-${Date.now()}-${seq}`,
    })
    return pedido.id
  }

  const embarqueDe = async (pedidoId: string) =>
    (await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { embarqueId: true } })).embarqueId

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }) })

  it('PUT con el MISMO offlineId del POST es un reintento: no asigna (por eso el wizard no debe enviarlo)', async () => {
    const offlineId = `wiz-${Date.now()}-a`
    const e = await crearEmbarque(offlineId)
    expect(e.status).toBe(201)
    const pedidoId = await pedidoNuevo()

    const r = await asignar(e.id, { pedidoIds: [pedidoId], offlineId })
    expect(r.status).toBe(200)
    expect(r.body.deduped).toBe(true)
    expect(await embarqueDe(pedidoId)).toBeNull()
  })

  it('PUT de asignación SIN offlineId asigna el pedido al embarque creado con offlineId', async () => {
    const e = await crearEmbarque(`wiz-${Date.now()}-b`)
    const pedidoId = await pedidoNuevo()

    const r = await asignar(e.id, { pedidoIds: [pedidoId] })
    expect(r.status).toBe(200)
    expect(await embarqueDe(pedidoId)).toBe(e.id)
    const pedido = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    expect(pedido.estadoEntrega).toBe('EN_RUTA')
  })

  it('repetir la misma asignación es idempotente (200), no un 409 con lista vacía', async () => {
    const e = await crearEmbarque(`wiz-${Date.now()}-c`)
    const pedidoId = await pedidoNuevo()

    expect((await asignar(e.id, { pedidoIds: [pedidoId] })).status).toBe(200)
    const otraVez = await asignar(e.id, { pedidoIds: [pedidoId] })
    expect(otraVez.status).toBe(200)
    expect(await embarqueDe(pedidoId)).toBe(e.id)
  })

  it('un pedido que ya está en OTRO embarque sigue dando 409 y no se pisa', async () => {
    const dueno = await crearEmbarque(`wiz-${Date.now()}-d1`)
    const otro = await crearEmbarque(`wiz-${Date.now()}-d2`)
    const pedidoId = await pedidoNuevo()
    expect((await asignar(dueno.id, { pedidoIds: [pedidoId] })).status).toBe(200)

    const r = await asignar(otro.id, { pedidoIds: [pedidoId] })
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.body)).toContain(pedidoId)
    expect(await embarqueDe(pedidoId)).toBe(dueno.id)
  })

  it('mezcla: los libres se asignan y los de otro embarque se reportan (409), sin pisar', async () => {
    const dueno = await crearEmbarque(`wiz-${Date.now()}-e1`)
    const nuevo = await crearEmbarque(`wiz-${Date.now()}-e2`)
    const ajeno = await pedidoNuevo()
    const libre = await pedidoNuevo()
    await asignar(dueno.id, { pedidoIds: [ajeno] })

    const r = await asignar(nuevo.id, { pedidoIds: [ajeno, libre] })
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.body)).toContain(ajeno)
    expect(await embarqueDe(ajeno)).toBe(dueno.id)
  })
})
