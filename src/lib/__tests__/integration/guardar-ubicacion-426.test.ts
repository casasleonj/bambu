// @tests #426 — guardar la ubicación de un pedido como ubicación de la tienda o del cliente.
// Postgres real, handler REAL de POST /api/pedidos; cada prueba mira la base de datos.
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
import { POST as crearPedido } from '@/app/api/pedidos/route'
import { guardarUbicacionDestino } from '@/lib/geo/guardar-ubicacion-destino'

let adminId: string
let n = 0
const unico = () => `ub-${randomUUID()}`
const NUEVA = { lat: 8.7479, lng: -75.8814 }
const OTRA = { lat: 8.7455, lng: -75.883 }

async function cliente(coords?: { lat: number; lng: number }) {
  n += 1
  return testPrisma.cliente.create({
    data: { nombre: `Cliente Ubicación ${n}`, telefono: `33100${String(n).padStart(5, '0')}`, direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true, ...(coords ? coords : {}) },
  })
}
async function negocio(clienteId: string, coords?: { lat: number; lng: number }) {
  return testPrisma.negocio.create({ data: { clienteId, nombre: `Tienda ${randomUUID().slice(0, 4)}`, direccion: 'Carrera 5 # 6-7', ...(coords ? coords : {}) } })
}
const pedir = (clienteId: string, extra: Record<string, unknown>) => crearPedido(new NextRequest('http://localhost/api/pedidos', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 2 }], offlineId: unico(), entregaLat: NUEVA.lat, entregaLng: NUEVA.lng, ...extra }),
}))
const num = (v: unknown) => (v == null ? null : Number(v))

describe('#426 — guardar la ubicación del pedido (Postgres real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }) })

  it('sin la casilla no se guarda nada en el cliente ni en la tienda', async () => {
    const c = await cliente()
    const t = await negocio(c.id)
    const res = await pedir(c.id, { negocioId: t.id })
    expect(res.status).toBe(201)
    expect((await res.json()).ubicacionGuardada).toBeUndefined()
    expect(num((await testPrisma.negocio.findUniqueOrThrow({ where: { id: t.id } })).lat)).toBeNull()
    expect(num((await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).lat)).toBeNull()
  })

  it('pedido de una tienda: la ubicación se guarda en la tienda, no en el cliente, y queda auditada', async () => {
    const c = await cliente()
    const t = await negocio(c.id)
    const res = await pedir(c.id, { negocioId: t.id, guardarUbicacion: {} })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.ubicacionGuardada).toMatchObject({ resultado: 'GUARDADA', destino: 'NEGOCIO' })
    const negocioBd = await testPrisma.negocio.findUniqueOrThrow({ where: { id: t.id } })
    expect([num(negocioBd.lat), num(negocioBd.lng)]).toEqual([NUEVA.lat, NUEVA.lng])
    expect(num((await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })).lat)).toBeNull()
    const h = await testPrisma.historial.findFirst({ where: { entidad: 'Negocio', registroId: t.id, datos: { contains: 'UBICACION_GUARDADA_DESDE_PEDIDO' } } })
    expect(h).not.toBeNull()
  })

  it('pedido sin tienda: se guarda en el cliente con origen MANUAL', async () => {
    const c = await cliente()
    const res = await pedir(c.id, { guardarUbicacion: {} })
    expect((await res.json()).ubicacionGuardada).toMatchObject({ resultado: 'GUARDADA', destino: 'CLIENTE' })
    const bd = await testPrisma.cliente.findUniqueOrThrow({ where: { id: c.id } })
    expect([num(bd.lat), num(bd.lng), bd.geocodeOrigen]).toEqual([NUEVA.lat, NUEVA.lng, 'MANUAL'])
  })

  it('si ya tenía otra ubicación NO la pisa en silencio; con «reemplazar» sí, y guarda lo anterior en el historial', async () => {
    const c = await cliente()
    const t = await negocio(c.id, OTRA)
    const sin = await pedir(c.id, { negocioId: t.id, guardarUbicacion: {} })
    expect((await sin.json()).ubicacionGuardada).toMatchObject({ resultado: 'CONSERVADA', destino: 'NEGOCIO', anterior: OTRA })
    expect(num((await testPrisma.negocio.findUniqueOrThrow({ where: { id: t.id } })).lat)).toBe(OTRA.lat)
    const con = await pedir(c.id, { negocioId: t.id, guardarUbicacion: { reemplazar: true } })
    expect((await con.json()).ubicacionGuardada).toMatchObject({ resultado: 'REEMPLAZADA' })
    expect(num((await testPrisma.negocio.findUniqueOrThrow({ where: { id: t.id } })).lat)).toBe(NUEVA.lat)
    const h = await testPrisma.historial.findFirst({ where: { entidad: 'Negocio', registroId: t.id, datos: { contains: 'REEMPLAZADA' } } })
    expect(JSON.parse(h!.datos).anterior).toEqual(OTRA)
  })

  it('la misma ubicación (diferencia de pocos metros) no cambia nada', async () => {
    const c = await cliente({ lat: NUEVA.lat + 0.00001, lng: NUEVA.lng })
    const res = await pedir(c.id, { guardarUbicacion: {} })
    expect((await res.json()).ubicacionGuardada).toMatchObject({ resultado: 'IGUAL' })
  })

  it('el cliente anónimo nunca recibe una ubicación', async () => {
    const r = await guardarUbicacionDestino({ clienteId: 'CONSUMIDOR_FINAL', lat: NUEVA.lat, lng: NUEVA.lng, pedidoId: 'x' })
    expect(r.resultado).toBe('SIN_DESTINO')
    const cf = await testPrisma.cliente.findUnique({ where: { id: 'CONSUMIDOR_FINAL' } })
    expect(num(cf?.lat)).toBeNull()
  })

  it('una tienda de OTRO cliente no se usa como destino', async () => {
    const dueno = await cliente()
    const ajeno = await cliente()
    const t = await negocio(dueno.id)
    const r = await guardarUbicacionDestino({ clienteId: ajeno.id, negocioId: t.id, lat: NUEVA.lat, lng: NUEVA.lng, pedidoId: 'x' })
    expect(r.resultado).toBe('SIN_DESTINO')
    expect(num((await testPrisma.negocio.findUniqueOrThrow({ where: { id: t.id } })).lat)).toBeNull()
  })

  it('un fallo al guardar la ubicación nunca pierde la venta', async () => {
    const c = await cliente()
    const lib = await import('@/lib/geo/guardar-ubicacion-destino')
    const falla = vi.spyOn(lib, 'guardarUbicacionDestino').mockRejectedValueOnce(new Error('boom'))
    const res = await pedir(c.id, { guardarUbicacion: {} })
    falla.mockRestore()
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.pedido.id).toBeTruthy()
    expect(json.ubicacionGuardada).toEqual({ resultado: 'ERROR' }) // el fallo se informa, no se oculta
    expect(await testPrisma.pedido.count({ where: { id: json.pedido.id } })).toBe(1)
  })
})
