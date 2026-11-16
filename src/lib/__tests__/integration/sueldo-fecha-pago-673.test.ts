// @tests #673 punto 2 (sueldos) — fecha de pago OPCIONAL de un sueldo fijo (Postgres real, handlers REALES, datos sintéticos).
// `Nomina.fechaPago` y `Gasto.fecha` caen en el día real del pago; `Gasto.createdAt` conserva la captura; el periodo que cubre
// la nómina no cambia. Sin fecha (o con hoy) todo queda como siempre. Un día ya cerrado no se reescribe.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { PUT as accionNomina } from '@/app/api/nomina/[id]/route'
import { POST as pagarSueldo } from '@/app/api/nomina/sueldo/pagar/route'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

const DIA = 86_400_000
const dia = (atras: number) => dayInBogota(new Date(Date.now() - atras * DIA))
const HOY = dia(0)
let adminId: string

const unico = () => `sf-${randomUUID()}`
const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const req = (method: 'POST' | 'PUT', url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const cuerpo = async (r: Response) => (await r.json()) as { error?: { code?: string; message?: string } }

describe('#673 punto 2 — sueldos con fecha de pago opcional', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(disconnect)
  beforeEach(() => como('ADMIN'))

  describe('PUT /api/nomina/[id] (PAGAR)', () => {
    async function nominaPendiente(total = 50_000) {
      const t = await testPrisma.trabajador.create({ data: { nombre: `Sueldo ${unico()}`, rol: 'AYUDANTE', tipoPago: 'FIJO', salarioFijo: total } })
      return testPrisma.nomina.create({
        data: { trabajadorId: t.id, fechaInicio: startOfDayInBogota(dia(8)), fechaFin: startOfDayInBogota(dia(8)), salario: total, total },
      })
    }
    const pagarNomina = (id: string, body: Record<string, unknown>) =>
      accionNomina(req('PUT', `/api/nomina/${id}`, { action: 'PAGAR', metodo: 'EFECTIVO', ...body }), { params: Promise.resolve({ id }) })

    it('sin fecha: el pago y el egreso quedan en el momento de la captura, como siempre', async () => {
      const n = await nominaPendiente()
      expect((await pagarNomina(n.id, {})).status).toBe(200)
      const gasto = await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })
      expect(dayInBogota(gasto.fecha)).toBe(HOY)
      expect(gasto.notas).toBeNull()
    })

    it('con la fecha de hoy: también es el pago normal y no pide motivo', async () => {
      const n = await nominaPendiente()
      expect((await pagarNomina(n.id, { fechaPago: HOY })).status).toBe(200)
      expect(dayInBogota((await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })).fecha)).toBe(HOY)
    })

    it('con fecha pasada y motivo: el egreso y fechaPago caen ese día; createdAt guarda la captura; el periodo no cambia', async () => {
      const n = await nominaPendiente()
      const res = await pagarNomina(n.id, { fechaPago: dia(3), motivoFecha: 'Se pagó antes de lo previsto' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
      const nomina = await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })
      expect(dayInBogota(nomina.fechaPago!)).toBe(dia(3))
      expect(dayInBogota(nomina.fechaInicio)).toBe(dia(8))
      expect(dayInBogota(nomina.fechaFin)).toBe(dia(8))
      const gasto = await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })
      expect(dayInBogota(gasto.fecha)).toBe(dia(3))
      expect(dayInBogota(gasto.createdAt)).toBe(HOY)
      expect(gasto.notas ?? '').toContain('Se pagó antes de lo previsto')
    })

    it('un sueldo adelantado o atrasado por otro medio también respeta la fecha; el egreso solo existe en efectivo dentro de la caja', async () => {
      const n = await nominaPendiente()
      expect((await pagarNomina(n.id, { metodo: 'NEQUI', fechaPago: dia(2), motivoFecha: 'Pagado por Nequi dos días antes' })).status).toBe(200)
      expect(dayInBogota((await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })).fechaPago!)).toBe(dia(2))
      expect(await testPrisma.gasto.count({ where: { trabajadorId: n.trabajadorId } })).toBe(0)
    })

    it('una fecha pasada exige motivo y una futura o inválida se rechaza; la nómina queda pendiente y sin egreso', async () => {
      const n = await nominaPendiente()
      const sinMotivo = await pagarNomina(n.id, { fechaPago: dia(2) })
      expect(sinMotivo.status).toBe(422)
      expect((await cuerpo(sinMotivo)).error?.code).toBe('MOTIVO_FECHA_REQUERIDO')
      const futura = await pagarNomina(n.id, { fechaPago: dia(-1), motivoFecha: 'prueba' })
      expect(futura.status).toBe(422)
      expect((await cuerpo(futura)).error?.code).toBe('FECHA_PAGO_FUTURA')
      const inexistente = await pagarNomina(n.id, { fechaPago: '2026-02-30', motivoFecha: 'prueba' })
      expect(inexistente.status).toBe(422)
      expect((await cuerpo(inexistente)).error?.code).toBe('FECHA_PAGO_INVALIDA')
      expect((await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })).estado).toBe('PENDIENTE')
      expect(await testPrisma.gasto.count({ where: { trabajadorId: n.trabajadorId } })).toBe(0)
    })

    it('el pago un día ya cerrado se acepta con rastro y no reescribe el cierre guardado', async () => {
      const n = await nominaPendiente()
      const cerrado = dia(5)
      const cierre = await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(cerrado), cerradoPor: adminId, gastos: 0 } })
      const antes = JSON.stringify(await testPrisma.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))
      expect((await pagarNomina(n.id, { fechaPago: cerrado, motivoFecha: 'Se pagó ese día y no se había anotado' })).status).toBe(200)
      expect(JSON.stringify(await testPrisma.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))).toBe(antes)
      expect(dayInBogota((await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })).fecha)).toBe(cerrado)
    })
  })

  describe('POST /api/nomina/sueldo/pagar (el endpoint que usa la pantalla)', () => {
    const FECHA_TOCA = dia(3)
    async function trabajadorConSueldoQueToca() {
      const diaSemana = new Date(`${FECHA_TOCA}T12:00:00-05:00`).getUTCDay()
      return testPrisma.trabajador.create({
        data: { nombre: `Fijo ${unico()}`, rol: 'AYUDANTE', tipoPago: 'FIJO', salarioFijo: 70_000, frecuenciaPago: 'SEMANAL', diasPago: [diaSemana] },
      })
    }
    const pagar = (trabajadorId: string, extra: Record<string, unknown> = {}) =>
      pagarSueldo(req('POST', '/api/nomina/sueldo/pagar', { trabajadorId, fecha: FECHA_TOCA, metodo: 'EFECTIVO', ...extra }))

    it('sin fecha de pago: igual que siempre (el egreso queda hoy)', async () => {
      const t = await trabajadorConSueldoQueToca()
      const res = await pagar(t.id)
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      expect(dayInBogota((await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: t.id } })).fecha)).toBe(HOY)
    })

    it('con fecha de pago y motivo: se reenvía a Nómina; el egreso cae ese día y el periodo cubierto sigue siendo el del sueldo', async () => {
      const t = await trabajadorConSueldoQueToca()
      const res = await pagar(t.id, { fechaPago: dia(1), motivoFecha: 'Se pagó un día antes de lo previsto' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const nomina = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: t.id } })
      expect(dayInBogota(nomina.fechaPago!)).toBe(dia(1))
      expect(dayInBogota(nomina.fechaInicio)).toBe(FECHA_TOCA)
      expect(dayInBogota((await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: t.id } })).fecha)).toBe(dia(1))
    })

    it('una fecha rechazada NO deja una nómina pendiente suelta ni un egreso', async () => {
      const t = await trabajadorConSueldoQueToca()
      const sinMotivo = await pagar(t.id, { fechaPago: dia(1) })
      expect(sinMotivo.status).toBe(422)
      expect((await cuerpo(sinMotivo)).error?.code).toBe('MOTIVO_FECHA_REQUERIDO')
      expect((await pagar(t.id, { fechaPago: dia(-1), motivoFecha: 'prueba' })).status).toBe(422)
      expect(await testPrisma.nomina.count({ where: { trabajadorId: t.id } })).toBe(0)
      expect(await testPrisma.gasto.count({ where: { trabajadorId: t.id } })).toBe(0)
    })

    it('solo ADMIN y CONTADOR pagan; la ASISTENTE recibe 403 y no se registra nada', async () => {
      const t = await trabajadorConSueldoQueToca()
      como('ASISTENTE')
      expect((await pagar(t.id, { fechaPago: dia(1), motivoFecha: 'prueba' })).status).toBe(403)
      expect(await testPrisma.nomina.count({ where: { trabajadorId: t.id } })).toBe(0)
    })
  })
})
