// @tests #618 — inventario de botellones llenos: Inicial + Llenados − Vendidos = Esperado contra el conteo final. El inicial sale del
// último cierre (o de Config mientras no haya uno con botellones); varias producciones el mismo día suman lo ya llenado; el cierre
// guarda el stock. Handlers y PostgreSQL reales; datos sintéticos.
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
import { GET as previewProduccion } from '@/app/api/produccion/preview/route'
import { GET as resumenCierre, POST as cerrarDia } from '@/app/api/cierre/route'
import { resolverStockInicial } from '@/lib/stock-inicial'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

const HOY = todayInBogota()
const dia = (atras: number) => dayInBogota(new Date(Date.now() - atras * 86_400_000))
let adminId: string
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const item = (producto: 'PACA_AGUA' | 'PACA_HIELO', n: number) => ({ producto, conteoA: n, conteoB: n, stockFinFisico: n })
const produccion = (trabajadorId: string, extra: Record<string, unknown> = {}) => crearProduccion(post('/api/produccion', {
  turno: 'MANANA', trabajadorId, items: [item('PACA_AGUA', 0), item('PACA_HIELO', 0)], ...extra,
}))
async function ventaBotellones(fabrica: number, domicilio: number, diaStr = HOY) {
  const c = await testPrisma.cliente.create({ data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true } })
  await testPrisma.pedido.create({ data: {
    clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: new Date(`${diaStr}T12:00:00-05:00`), estado: 'ENTREGADO',
    estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
    cBotellonFabEnt: fabrica, cBotellonDomEnt: domicilio,
  } })
}

describe('#618 — inventario de botellones llenos', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await testPrisma.produccion.deleteMany({})
    await testPrisma.cierreDia.deleteMany({})
    await testPrisma.pedido.deleteMany({})
    await testPrisma.config.deleteMany({ where: { clave: 'STOCK_INI_BOTELLON' } })
  })
  afterAll(disconnect)

  it('el stock inicial: Config mientras no haya cierre con botellones; después, el conteo final del último cierre', async () => {
    expect((await resolverStockInicial(testPrisma)).stockIniBotellon).toBe(0)
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    expect((await resolverStockInicial(testPrisma)).stockIniBotellon).toBe(20)
    // un cierre anterior a registrar botellones (NULL) no trae su conteo: se sigue usando Config
    await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(3)), cerradoPor: adminId } })
    expect((await resolverStockInicial(testPrisma)).stockIniBotellon).toBe(20)
    // un cierre con conteo de botellones lo trae para el día siguiente
    await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(2)), cerradoPor: adminId, stockFinBotellon: 31 } })
    expect((await resolverStockInicial(testPrisma)).stockIniBotellon).toBe(31)
  })

  it('Producción guarda inicial, llenados, vendidos (fábrica + domicilio) y el conteo; cuadra cuando Inicial + Llenados − Vendidos = conteo', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    await ventaBotellones(3, 2) // vendidos 5
    const s = await sellador()
    const res = await produccion(s.id, { botellonesLlenados: 8, stockFinBotellones: 23 }) // 20 + 8 − 5
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id }, include: { items: true } })
    expect(p.items.find((i) => i.producto === 'BOTELLON')).toMatchObject({ stockIni: 20, producido: 8, ventas: 5, stockFinEsperado: 23, stockFinFisico: 23, diferencia: 0 })
  })

  it('una diferencia en los botellones obliga a explicar la causa (400 sin observación; 201 con ella)', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    await ventaBotellones(3, 2)
    const s = await sellador()
    const sin = await produccion(s.id, { botellonesLlenados: 8, stockFinBotellones: 21 }) // esperado 23
    expect(sin.status).toBe(400)
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(0)
    const con = await produccion(s.id, { botellonesLlenados: 8, stockFinBotellones: 21, obs: 'Se rompieron 2 al lavar' })
    expect(con.status).toBe(201)
    const it2 = (await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id }, include: { items: true } })).items.find((i) => i.producto === 'BOTELLON')
    expect(it2).toMatchObject({ stockFinEsperado: 23, stockFinFisico: 21, diferencia: 2 })
  })

  it('sin conteo de botellones (cliente anterior) se asume que cuadra y no pide observación', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    const s = await sellador()
    expect((await produccion(s.id, { botellonesLlenados: 4 })).status).toBe(201)
    expect((await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id }, include: { items: true } })).items.find((i) => i.producto === 'BOTELLON'))
      .toMatchObject({ stockIni: 20, stockFinEsperado: 24, stockFinFisico: 24, diferencia: 0 })
  })

  it('una segunda producción del mismo día suma lo ya llenado al stock inicial (el inventario es uno solo)', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    const a = await sellador()
    const b = await sellador()
    expect((await produccion(a.id, { botellonesLlenados: 8, stockFinBotellones: 28 })).status).toBe(201)
    const res = await produccion(b.id, { turno: 'TARDE', botellonesLlenados: 5, stockFinBotellones: 33 }) // 20 + 8 + 5
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
    const bot = (await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: b.id }, include: { items: true } })).items.find((i) => i.producto === 'BOTELLON')
    expect(bot).toMatchObject({ stockIni: 28, stockFinEsperado: 33, diferencia: 0 })

    const vista = await (await previewProduccion(new NextRequest('http://localhost/api/produccion/preview'))).json()
    expect(vista.stockIniBotellon).toBe(33) // la siguiente producción arrancaría con todo lo llenado hasta ahora
  })

  it('corregir la producción recalcula el inventario y vuelve a exigir explicación si descuadra', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    const s = await sellador()
    expect((await produccion(s.id, { botellonesLlenados: 8, stockFinBotellones: 28 })).status).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id } })
    const put = (body: unknown) => corregirProduccion(
      new NextRequest(`http://localhost/api/produccion/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: p.id }) },
    )
    expect((await put({ stockFinBotellones: 25 })).status).toBe(400) // esperado 28, descuadra y no hay observación
    const ok = await put({ stockFinBotellones: 25, obs: 'Conteo corregido: faltaron 3' })
    expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200)
    expect((await testPrisma.produccion.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } })).items.find((i) => i.producto === 'BOTELLON'))
      .toMatchObject({ stockFinFisico: 25, stockFinEsperado: 28, diferencia: 3 })
  })

  it('el resumen del cierre trae el inventario y el cierre guarda el stock de botellones para el día siguiente', async () => {
    await testPrisma.config.create({ data: { clave: 'STOCK_INI_BOTELLON', valor: '20' } })
    await ventaBotellones(3, 2)
    const s = await sellador()
    expect((await produccion(s.id, { botellonesLlenados: 8, stockFinBotellones: 23 })).status).toBe(201)
    const r = (await (await resumenCierre(new NextRequest(`http://localhost/api/cierre?fecha=${HOY}`))).json()).cierre
    expect(r.produccion).toMatchObject({ stockIniBotellon: 20, botellonesLlenados: 8, stockFinBotellon: 23 })
    expect(r.botellonVendido).toBe(5)

    const cierre = await cerrarDia(post('/api/cierre', {
      fecha: HOY, baseDia: 50000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
      stockIniBotellon: 20, prodBotellon: 8, stockFinBotellon: 23, reporte: JSON.stringify({ arqueo: { 50000: 1 } }),
    }))
    expect(cierre.status, JSON.stringify(await cierre.clone().json())).toBe(201)
    const guardado = await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(HOY) } })
    expect(guardado).toMatchObject({ stockIniBotellon: 20, prodBotellon: 8, stockFinBotellon: 23 })
    // al día siguiente el inicial es el conteo final de este cierre
    expect((await resolverStockInicial(testPrisma)).stockIniBotellon).toBe(23)
  })
})
