// @tests #645 — producción de un día atrasado (cierre que se hace al día siguiente), jornada completa y varias producciones
// el mismo día. Handlers y PostgreSQL reales; datos sintéticos.
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
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

const dia = (atras: number) => dayInBogota(new Date(Date.now() - atras * 86_400_000))
let adminId: string
const post = (body: unknown) => new NextRequest('http://localhost/api/produccion', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const item = (producto: 'PACA_AGUA' | 'PACA_HIELO', n: number, extra: Record<string, number> = {}) =>
  ({ producto, conteoA: n, conteoB: n, stockFinFisico: 0, ...extra })
const cuerpo = (trabajadorId: string, turno: string, extra: Record<string, unknown> = {}) => ({
  turno, trabajadorId, items: [item('PACA_AGUA', 20), item('PACA_HIELO', 10)], obs: 'Prueba sintética', ...extra,
})

async function ventaDe(diaStr: string, agua: number) {
  const c = await testPrisma.cliente.create({ data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true } })
  await testPrisma.pedido.create({ data: {
    clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: new Date(`${diaStr}T12:00:00-05:00`), estado: 'ENTREGADO',
    estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0, cPacaAguaEnt: agua,
  } })
}

describe('#645 — producción de un día atrasado, jornada completa y varias producciones', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('con `fecha` de ayer: se registra en ayer con las ventas de ayer', async () => {
    const ayer = dia(1)
    await ventaDe(ayer, 7)
    const s = await sellador()
    const res = await crearProduccion(post(cuerpo(s.id, 'MANANA', { fecha: ayer, botellonesLlenados: 2 })))
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id }, include: { items: true } })
    expect(p.fecha.getTime()).toBe(startOfDayInBogota(ayer).getTime())
    expect(p.items.find((i) => i.producto === 'PACA_AGUA')?.ventas).toBe(7)
  })

  it('rechaza fechas futuras, de más de 7 días y de un día ya cerrado', async () => {
    const s = await sellador()
    const futuro = await crearProduccion(post(cuerpo(s.id, 'TARDE', { fecha: dia(-1) })))
    expect(futuro.status).toBe(422)
    expect((await futuro.json()).error.code).toBe('FECHA_FUTURA')
    const antigua = await crearProduccion(post(cuerpo(s.id, 'TARDE', { fecha: dia(8) })))
    expect(antigua.status).toBe(422)
    expect((await antigua.json()).error.code).toBe('FECHA_MUY_ANTIGUA')

    const cerrado = dia(3)
    await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(cerrado), cerradoPor: adminId } })
    const r = await crearProduccion(post(cuerpo(s.id, 'TARDE', { fecha: cerrado })))
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('DIA_CERRADO')
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(0)
  })

  it('la jornada completa no convive con otro turno del mismo sellador; otro sellador sí puede trabajar ese día', async () => {
    const dia2 = dia(2)
    const a = await sellador()
    const b = await sellador()
    expect((await crearProduccion(post(cuerpo(a.id, 'JORNADA', { fecha: dia2 })))).status).toBe(201)
    const choque = await crearProduccion(post(cuerpo(a.id, 'MANANA', { fecha: dia2 })))
    expect(choque.status).toBe(409)
    expect((await choque.json()).error.code).toBe('JORNADA_CON_OTRO_TURNO')
    expect((await crearProduccion(post(cuerpo(b.id, 'MANANA', { fecha: dia2 })))).status).toBe(201)

    const c = await sellador()
    const dia4 = dia(4)
    expect((await crearProduccion(post(cuerpo(c.id, 'MANANA', { fecha: dia4 })))).status).toBe(201)
    const inversa = await crearProduccion(post(cuerpo(c.id, 'JORNADA', { fecha: dia4 })))
    expect(inversa.status).toBe(409)
  })

  it('la segunda producción del día cuenta lo ya producido en su stock inicial (el cuadre es del día)', async () => {
    const dia5 = dia(5)
    const a = await sellador()
    const b = await sellador()
    // primera: produce 20 agua, pierde 2 → aporta 18 al stock del día
    expect((await crearProduccion(post(cuerpo(a.id, 'MANANA', { fecha: dia5, items: [item('PACA_AGUA', 20, { rotas: 2 }), item('PACA_HIELO', 10)] })))).status).toBe(201)
    const antes = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: a.id }, include: { items: true } })
    const iniPrimera = antes.items.find((i) => i.producto === 'PACA_AGUA')!.stockIni
    // segunda: producción de otro sellador el mismo día; su stock inicial incluye las 18 netas de la primera
    const res = await crearProduccion(post(cuerpo(b.id, 'TARDE', { fecha: dia5, obs: 'Prueba sintética' })))
    expect(res.status).toBe(201)
    const despues = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: b.id }, include: { items: true } })
    expect(despues.items.find((i) => i.producto === 'PACA_AGUA')!.stockIni).toBe(iniPrimera + 18)
  })

  it('corregir la producción de un día atrasado (sin cerrar) funciona; la de hace más de 7 días no', async () => {
    const s = await sellador()
    const dia6 = dia(6)
    expect((await crearProduccion(post(cuerpo(s.id, 'MANANA', { fecha: dia6 })))).status).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id } })
    const put = (id: string, body: unknown) => corregirProduccion(
      new NextRequest(`http://localhost/api/produccion/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    )
    const ok = await put(p.id, { botellonesLlenados: 3, obs: 'Corrección sintética' })
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200)

    const vieja = await testPrisma.produccion.create({ data: {
      fecha: startOfDayInBogota(dia(10)), turno: 'TARDE', trabajadorId: s.id, comSellTotal: 0,
      items: { create: [{ producto: 'PACA_AGUA' }, { producto: 'PACA_HIELO' }] },
    } })
    expect((await put(vieja.id, { obs: 'No debe poder' })).status).toBe(400)
    expect(todayInBogota()).toBeTruthy()
  })
})
