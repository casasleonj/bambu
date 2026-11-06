// #668 — cierres capturados tarde y corrección de producción con PostgreSQL real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const auth = vi.hoisted(() => ({ id: '' }))
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: auth.id, role: 'ADMIN' } }) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

import { GET as preview } from '@/app/api/produccion/preview/route'
import { GET as listar } from '@/app/api/produccion/route'
import { PUT as corregir } from '@/app/api/produccion/[id]/route'
import { GET as cierre } from '@/app/api/cierre/route'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

const hoy = todayInBogota()
const inicio = startOfDayInBogota(hoy)

async function escenario() {
  const trabajador = await testPrisma.trabajador.create({ data: {
    nombre: `Sintético 668 ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION',
    comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330,
  } })
  const produccion = await testPrisma.produccion.create({ data: {
    fecha: inicio, turno: 'JORNADA', trabajadorId: trabajador.id, comSellTotal: 182160,
    obs: 'Registro con inicial anterior a completar los cierres',
    items: { create: [
      { producto: 'PACA_AGUA', conteoA: 500, conteoB: 500, producido: 500, stockIni: 223, ventas: 0, stockFinFisico: 250, comSellador: 165000 },
      { producto: 'PACA_HIELO', conteoA: 50, conteoB: 50, producido: 50, stockIni: 12, ventas: 0, stockFinFisico: 20, comSellador: 16500 },
      { producto: 'BOTELLON', conteoA: 2, conteoB: 2, producido: 2, stockIni: 0, stockFinFisico: 0, comSellador: 660 },
    ] },
  } })
  // El cierre se captura después de la producción, pero corresponde al día anterior.
  await testPrisma.cierreDia.create({ data: {
    fecha: new Date(inicio.getTime() - 86_400_000), stockFinAgua: 138, stockFinHielo: 3, stockFinBotellon: 0, cerradoPor: auth.id,
  } })
  return { trabajador, produccion }
}
const put = (id: string, body: unknown) => corregir(new NextRequest(`http://localhost/api/produccion/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) })

describe('#668 — corregir el registro original sin crear producción ni borrar pagos', () => {
  beforeAll(async () => { await resetAndSeed(); auth.id = (await getAdminUser()).id })
  beforeEach(async () => {
    await testPrisma.pagoComisionRepartidor.deleteMany({})
    await testPrisma.produccion.deleteMany({})
    await testPrisma.cierreDia.deleteMany({})
    await testPrisma.pedido.deleteMany({})
  })
  afterAll(disconnect)

  it('preview, listado editable y cierre toman 138/3/0 sin reutilizar el inicial antiguo', async () => {
    const { produccion } = await escenario()
    const pv = await preview(new NextRequest(`http://localhost/api/produccion/preview?fecha=${hoy}`))
    expect(pv.status).toBe(200)
    expect((await pv.json()).stockInicialDia).toEqual({ stockIniAgua: 138, stockIniHielo: 3, stockIniBotellon: 0 })
    const listado = await listar(new NextRequest(`http://localhost/api/produccion?fecha=${hoy}`))
    const l = await listado.json()
    expect(l.editable).toBe(true)
    expect(l.produccion[0].items.find((i: { producto: string }) => i.producto === 'PACA_AGUA').stockIni).toBe(138)
    const resumen = await cierre(new NextRequest(`http://localhost/api/cierre?fecha=${hoy}`))
    const c = (await resumen.json()).cierre
    expect(c.produccion.stockIniAgua).toBe(138)
    expect(c.produccion.stockIniHielo).toBe(3)
    // GET no altera el registro original: no se escriben correcciones durante una consulta.
    const original = await testPrisma.produccionItem.findFirstOrThrow({ where: { produccionId: produccion.id, producto: 'PACA_AGUA' } })
    expect(original.stockIni).toBe(223)
  })

  it('corrige 500 a 400 usando la tarifa original, actualiza inicial y conserva pagos', async () => {
    const { trabajador, produccion } = await escenario()
    const pago = await testPrisma.pagoComisionRepartidor.create({ data: {
      trabajadorId: trabajador.id, fecha: inicio, monto: 182160, metodo: 'EFECTIVO', concepto: 'PRODUCCION', offlineId: randomUUID(),
    } })
    await testPrisma.trabajador.update({ where: { id: trabajador.id }, data: { comPacaAgua: 350 } })
    const res = await put(produccion.id, { obs: 'Corrección: se digitó una cantidad equivocada', items: [
      { producto: 'PACA_AGUA', conteoA: 400, conteoB: 400 }, { producto: 'PACA_HIELO' },
    ] })
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
    const p = await testPrisma.produccion.findUniqueOrThrow({ where: { id: produccion.id }, include: { items: true } })
    expect(p.items.find(i => i.producto === 'PACA_AGUA')).toMatchObject({ producido: 400, stockIni: 138, stockFinFisico: 250 })
    expect(Number(p.items.find(i => i.producto === 'PACA_AGUA')?.comSellador)).toBe(132000)
    expect(Number(p.comSellTotal)).toBe(149160)
    expect(Number((await testPrisma.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: pago.id } })).monto)).toBe(182160)
    expect(await testPrisma.produccion.count()).toBe(1)
    const historial = await testPrisma.historial.findFirst({ where: { entidad: 'Produccion', registroId: produccion.id, accion: 'UPDATE' } })
    expect(historial).not.toBeNull()
  })

  it('editar una observación conserva comisión aunque cambie la tarifa', async () => {
    const { trabajador, produccion } = await escenario()
    await testPrisma.trabajador.update({ where: { id: trabajador.id }, data: { comPacaAgua: 350, comPacaHielo: 350 } })
    expect((await put(produccion.id, { obs: 'Solo una aclaración del conteo' })).status).toBe(200)
    const p = await testPrisma.produccion.findUniqueOrThrow({ where: { id: produccion.id } })
    expect(Number(p.comSellTotal)).toBe(182160)
  })

  it('un día cerrado permite consulta pero rechaza editar sin modificar la producción', async () => {
    const { produccion } = await escenario()
    await testPrisma.cierreDia.create({ data: { fecha: inicio, stockFinAgua: 250, stockFinHielo: 20, stockFinBotellon: 0, cerradoPor: auth.id } })
    const l = await (await listar(new NextRequest(`http://localhost/api/produccion?fecha=${hoy}`))).json()
    expect(l.editable).toBe(false)
    expect(l.diaCerrado).toBe(true)
    expect((await put(produccion.id, { obs: 'No debe guardar' })).status).toBe(409)
    expect(Number((await testPrisma.produccion.findUniqueOrThrow({ where: { id: produccion.id } })).comSellTotal)).toBe(182160)
  })
})
