// @tests #645 — comisión del sellador: botellón LLENADO (se digita; llenados ≠ vendidos) a $330, se paga con «Pagar» y su medio, el cierre solo resta
// lo pagado en efectivo (ya no la resta sola) y la nómina no la paga dos veces. Handlers y PostgreSQL reales; datos sintéticos.
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
import { POST as pagarComision } from '@/app/api/nomina/dia/pagar/route'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { GET as resumenCierre } from '@/app/api/cierre/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { todayStringBogota } from '@/lib/dates'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

const HOY = todayStringBogota()
let adminId: string
let selladorDelDia: { id: string }
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const item = (producto: 'PACA_AGUA' | 'PACA_HIELO', n: number) => ({ producto, conteoA: n, conteoB: n, stockFinFisico: 0 })
const produccion = (trabajadorId: string, turno: 'MANANA' | 'TARDE' | 'NOCHE', botellonesLlenados = 8) => crearProduccion(post('/api/produccion', {
  turno, trabajadorId, items: [item('PACA_AGUA', 20), item('PACA_HIELO', 10)], botellonesLlenados, obs: 'Prueba sintética',
}))
const cierre = async () => (await (await resumenCierre(new NextRequest(`http://localhost/api/cierre?fecha=${HOY}`))).json()).cierre

async function ventaDelDia(agua: number, botellon: number) {
  const c = await testPrisma.cliente.create({ data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true } })
  await testPrisma.pedido.create({ data: {
    clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: new Date(), estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
    estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0, cPacaAguaEnt: agua, cBotellonFabEnt: botellon,
  } })
}

describe('#645 — comisión del sellador con botellón llenado', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('Producción guarda los botellones LLENADOS (no los vendidos) y la comisión suma 330 por cada unidad producida', async () => {
    await ventaDelDia(5, 3)
    const s = await sellador()
    const res = await produccion(s.id, 'MANANA')
    expect(res.status).toBe(201)
    selladorDelDia = s
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id }, include: { items: true } })
    const bot = p.items.find((i) => i.producto === 'BOTELLON')
    expect(bot).toMatchObject({ producido: 8, ventas: 3 }) // llenados 8, vendidos 3 (solo referencia)
    expect(Number(bot?.comSellador)).toBe(2640)
    expect(Number(p.comSellTotal)).toBe(330 * 20 + 330 * 10 + 330 * 8) // 12.540
  })

  it('el cierre ya no resta la comisión sola: la lista como pendiente y solo baja la caja lo pagado en efectivo', async () => {
    const s = selladorDelDia
    const antes = await cierre()
    const fila = antes.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === s.id)
    expect(fila).toMatchObject({ total: 12540, pagado: 0, pendiente: 12540 })
    expect(fila.detalle.find((d: { producto: string }) => d.producto === 'BOTELLON')).toMatchObject({ unidades: 8, comision: 2640 })
    expect(antes.comisionesAuto.total).toBe(0)

    const pago = await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: s.id, fecha: HOY, offlineId: `pc-${randomUUID()}`, montoEsperado: 12540 }))
    expect(pago.status).toBe(201)
    const despues = await cierre()
    expect(despues.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === s.id)).toMatchObject({ pagado: 12540, pendiente: 0 })
    expect(despues.comisionesAuto.total).toBe(12540)
    // el pago del sellador no se cuela en el bloque de repartidores ni se guarda como pago de reparto
    expect(despues.comisionesAuto.repartidores.find((x: { trabajadorId: string }) => x.trabajadorId === s.id)).toBeUndefined()
    expect(await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: s.id } })).toMatchObject({ concepto: 'PRODUCCION' })

    // pagar otra vez no hay nada pendiente
    const otra = await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: s.id, fecha: HOY, offlineId: `pc-${randomUUID()}` }))
    expect(otra.status).toBe(409)
  })

  it('pagada por Nequi no baja el efectivo de la caja', async () => {
    const otro = await sellador()
    expect((await produccion(otro.id, 'TARDE')).status).toBe(201)
    const antes = (await cierre()).comisionesAuto.total
    const pago = await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: otro.id, fecha: HOY, offlineId: `pc-${randomUUID()}`, metodo: 'NEQUI' }))
    expect(pago.status).toBe(201)
    const c = await cierre()
    expect(c.comisionesAuto.total).toBe(antes)
    expect(c.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === otro.id)).toMatchObject({ pendiente: 0 })
  })

  it('un sellador con moto cobra las dos comisiones y cada pago se ve solo en su bloque', async () => {
    await testPrisma.cierreDia.deleteMany({})
    const dual = await testPrisma.trabajador.create({
      data: { nombre: `Dual ${randomUUID()}`, rol: 'SELLADOR', usaMoto: true, tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330, comRepartAgua: 400, comRepartHielo: 400 },
    })
    const cliente = await testPrisma.cliente.create({ data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true } })
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: `dual-${randomUUID()}`,
    })
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: 2, entregadoAt: new Date(), entregadoPorId: dual.id } })
    expect((await produccion(dual.id, 'MANANA', 0)).status).toBe(201) // 30 unidades × 330 = 9.900

    const antes = await cierre()
    expect(antes.comisionesAuto.repartidores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ total: 800, pagado: 0 })
    expect(antes.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ total: 9900, pagado: 0 })

    expect((await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: dual.id, fecha: HOY, offlineId: `pc-${randomUUID()}`, concepto: 'PRODUCCION' }))).status).toBe(201)
    const medio = await cierre()
    expect(medio.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ pagado: 9900, pendiente: 0 })
    expect(medio.comisionesAuto.repartidores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ pagado: 0, pendiente: 800 })

    expect((await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: dual.id, fecha: HOY, offlineId: `pc-${randomUUID()}`, concepto: 'REPARTO' }))).status).toBe(201)
    const fin = await cierre()
    expect(fin.comisionesAuto.repartidores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ pagado: 800, pendiente: 0 })
    expect(fin.comisionesAuto.selladores.find((x: { trabajadorId: string }) => x.trabajadorId === dual.id)).toMatchObject({ pagado: 9900 })
    const pagos = await testPrisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: dual.id }, orderBy: { createdAt: 'asc' } })
    expect(pagos.map((x) => [x.concepto, Number(x.monto)])).toEqual([['PRODUCCION', 9900], ['REPARTO', 800]])
  })

  it('la nómina del sellador no vuelve a pagar la comisión ya pagada', async () => {
    const s = await sellador()
    await testPrisma.cierreDia.deleteMany({})
    expect((await produccion(s.id, 'NOCHE')).status).toBe(201)
    await pagarComision(post('/api/nomina/dia/pagar', { trabajadorId: s.id, fecha: HOY, offlineId: `pc-${randomUUID()}` }))
    const res = await crearNomina(post('/api/nomina', { trabajadorId: s.id, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(res.status).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: s.id } })
    expect(Number(n.totalComisiones)).toBe(12540)
    expect(Number(n.comisionPagadaCaja)).toBe(12540)
    expect(Number(n.total)).toBe(0)
  })

  it('corregir una Producción anterior (sin ítem de botellón) lo agrega con los llenados que se digitan', async () => {
    const s = await sellador()
    const vieja = await testPrisma.produccion.create({ data: {
      fecha: startOfDayInBogota(todayInBogota()), turno: 'MANANA', trabajadorId: s.id, comSellTotal: 6600,
      items: { create: [
        { producto: 'PACA_AGUA', conteoA: 20, conteoB: 20, producido: 20, comSellador: 6600 },
        { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0, producido: 0, comSellador: 0 },
      ] },
    } })
    const res = await corregirProduccion(
      new NextRequest(`http://localhost/api/produccion/${vieja.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botellonesLlenados: 4, obs: 'Corrección sintética' }) }),
      { params: Promise.resolve({ id: vieja.id }) },
    )
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
    const p = await testPrisma.produccion.findUniqueOrThrow({ where: { id: vieja.id }, include: { items: true } })
    expect(p.items.map((i) => i.producto).sort()).toEqual(['BOTELLON', 'PACA_AGUA', 'PACA_HIELO'])
    expect(Number(p.comSellTotal)).toBe(6600 + 4 * 330)
  })
})
