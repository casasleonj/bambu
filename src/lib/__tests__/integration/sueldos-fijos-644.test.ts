// @tests #644 — sueldo fijo con frecuencia de pago: la nómina suma el monto por cada fecha de pago del período, «Sueldos que
// tocan» lista lo que falta, el pago usa el medio de #641, el cierre ya no recibe «Salarios» y Trabajadores valida el plan.
// Handlers y PostgreSQL reales; trabajadores y montos sintéticos.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { POST as pagarSueldo } from '@/app/api/nomina/sueldo/pagar/route'
import { POST as crearTrabajador } from '@/app/api/trabajadores/route'
import { POST as cerrar } from '@/app/api/cierre/route'
import { sueldosPendientesAl } from '@/lib/sueldos-pendientes'
import { startOfDayInBogota } from '@/lib/date-helpers'

let adminId: string
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

async function trabajador(extra: Record<string, unknown> = {}) {
  return testPrisma.trabajador.create({
    data: { nombre: `Sintético ${Math.random()}`, rol: 'SELLADOR', tipoPago: 'FIJO', salarioFijo: 400000, frecuenciaDesde: new Date('2026-01-01T12:00:00Z'), ...extra },
  })
}
const gastosNomina = (trabajadorId: string) => testPrisma.gasto.findMany({ where: { categoria: 'NOMINA', trabajadorId } })

describe('#644 — sueldo fijo con frecuencia de pago', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('la nómina suma el monto de CADA pago que cae en el período; sin frecuencia, una sola vez', async () => {
    const quincenal = await trabajador({ frecuenciaPago: 'QUINCENAL' })
    const semanal = await trabajador({ frecuenciaPago: 'SEMANAL', diasPago: [6], salarioFijo: 100000 })
    const antiguo = await trabajador({ salarioFijo: 250000 }) // sin frecuencia: comportamiento anterior
    const nomina = async (id: string) => {
      const res = await crearNomina(post('/api/nomina', { trabajadorId: id, fechaInicio: '2026-09-01', fechaFin: '2026-09-30', tipoCalculo: 'AUTO' }))
      expect(res.status).toBe(200)
      return Number((await res.json()).nomina.salario)
    }
    expect(await nomina(quincenal.id)).toBe(800000) // 15 y 30 de septiembre
    expect(await nomina(semanal.id)).toBe(400000) // 4 sábados en septiembre de 2026 (5, 12, 19, 26)
    expect(await nomina(antiguo.id)).toBe(250000)
  })

  it('«Sueldos que tocan» lista las fechas cumplidas sin pagar y no las ya pagadas', async () => {
    const t = await trabajador({ frecuenciaPago: 'QUINCENAL', pagoFueraDeCaja: true })
    const antes = (await sueldosPendientesAl(testPrisma, '2026-10-31')).filter((s) => s.trabajadorId === t.id)
    expect(antes.map((s) => s.fecha)).toEqual(['2026-09-30', '2026-10-15', '2026-10-31'])
    expect(antes[0]).toMatchObject({ monto: 400000, fueraDeCaja: true })

    // una nómina pagada que cubre el 15 saca esa fecha de la lista; una pendiente no
    await testPrisma.nomina.create({ data: { trabajadorId: t.id, fechaInicio: startOfDayInBogota('2026-10-15'), fechaFin: new Date(startOfDayInBogota('2026-10-16').getTime() - 1), salario: 400000, total: 400000, estado: 'PAGADA', metodoPago: 'NEQUI' } })
    const despues = (await sueldosPendientesAl(testPrisma, '2026-10-31')).filter((s) => s.trabajadorId === t.id)
    expect(despues.map((s) => s.fecha)).toEqual(['2026-09-30', '2026-10-31'])
  })

  it('un plan recién configurado no genera pagos pendientes de fechas anteriores', async () => {
    const t = await trabajador({ frecuenciaPago: 'QUINCENAL', frecuenciaDesde: new Date('2026-10-20T15:00:00Z') })
    const lista = (await sueldosPendientesAl(testPrisma, '2026-10-31')).filter((s) => s.trabajadorId === t.id)
    expect(lista.map((s) => s.fecha)).toEqual(['2026-10-31'])
  })

  it('pagar un sueldo desde el cierre: efectivo de la caja = UN egreso; no se puede pagar dos veces ni una fecha futura', async () => {
    const t = await trabajador({ frecuenciaPago: 'QUINCENAL' })
    const res = await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: t.id, fecha: '2026-10-15', metodo: 'EFECTIVO' }))
    expect(res.status).toBe(201)
    const g = await gastosNomina(t.id)
    expect(g).toHaveLength(1)
    expect(Number(g[0].monto)).toBe(400000)
    const nom = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: t.id } })
    expect(nom).toMatchObject({ estado: 'PAGADA', metodoPago: 'EFECTIVO', pagoFueraDeCaja: false })

    const otra = await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: t.id, fecha: '2026-10-15', metodo: 'EFECTIVO' }))
    expect(otra.status).toBe(409)
    expect(await gastosNomina(t.id)).toHaveLength(1)

    const futuro = await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: t.id, fecha: '2999-01-15', metodo: 'EFECTIVO' }))
    expect(futuro.status).toBe(422)
  })

  it('por Nequi o por fuera de la caja (administrador): queda pagado sin egreso de caja', async () => {
    const admin = await trabajador({ rol: 'ADMIN', frecuenciaPago: 'QUINCENAL', pagoFueraDeCaja: true })
    const res = await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: admin.id, fecha: '2026-10-15' })) // toma «por fuera» del trabajador
    expect(res.status).toBe(201)
    expect(await gastosNomina(admin.id)).toHaveLength(0)
    expect(await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: admin.id } })).toMatchObject({ estado: 'PAGADA', pagoFueraDeCaja: true })

    const t = await trabajador({ frecuenciaPago: 'QUINCENAL' })
    expect((await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: t.id, fecha: '2026-10-15', metodo: 'NEQUI' }))).status).toBe(201)
    expect(await gastosNomina(t.id)).toHaveLength(0)
  })

  it('un trabajador sin sueldo pendiente o inexistente no se puede pagar', async () => {
    const sinPlan = await trabajador() // sin frecuencia
    expect((await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: sinPlan.id, fecha: '2026-10-15' }))).status).toBe(409)
    expect((await pagarSueldo(post('/api/nomina/sueldo/pagar', { trabajadorId: 'no-existe', fecha: '2026-10-15' }))).status).toBe(409)
  })

  it('el cierre ya no recibe «Salarios»: lo que mande un cliente antiguo se ignora', async () => {
    await testPrisma.cierreDia.deleteMany({})
    const dia = '2026-03-26'
    const res = await cerrar(post('/api/cierre', {
      fecha: dia, baseDia: 50000, salarios: 90000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
      stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, reporte: JSON.stringify({ arqueo: { 50000: 1 } }),
    }))
    expect(res.status).toBe(201)
    const guardado = await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(dia) } })
    expect(Number(guardado.salarios)).toBe(0)
    expect(Number(guardado.netoCaja)).toBe(50000)
  })

  it('Trabajadores valida el plan de pago y lo guarda', async () => {
    const base = { nombre: `Sintético ${Math.random()}`, rol: 'ADMIN', tipoPago: 'FIJO', salarioFijo: 1500000 }
    for (const mal of [
      { frecuenciaPago: 'SEMANAL', diasPago: [] },
      { frecuenciaPago: 'MENSUAL', diasPago: [3, 4] },
      { frecuenciaPago: 'FECHAS', diasPago: [40] },
    ]) {
      expect((await crearTrabajador(post('/api/trabajadores', { ...base, ...mal }))).status).toBe(400)
    }
    const ok = await crearTrabajador(post('/api/trabajadores', { ...base, frecuenciaPago: 'QUINCENAL', pagoFueraDeCaja: true }))
    expect(ok.status).toBe(201)
    const creado = await testPrisma.trabajador.findFirstOrThrow({ where: { nombre: base.nombre } })
    expect(creado).toMatchObject({ frecuenciaPago: 'QUINCENAL', pagoFueraDeCaja: true, diasPago: [] })
    expect(creado.frecuenciaDesde).not.toBeNull()
  })
})
