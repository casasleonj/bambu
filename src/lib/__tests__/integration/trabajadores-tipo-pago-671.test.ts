// @tests #671 — persistencia del tipo salarial independiente de moto; sin reescribir liquidaciones.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST } from '@/app/api/trabajadores/route'
import { PUT } from '@/app/api/trabajadores/[id]/route'
import { POST as liquidar } from '@/app/api/nomina/route'
import * as auditoria from '@/lib/audit'
import { publishRealtimeEvent } from '@/lib/realtime'
import { startOfDayBogota } from '@/lib/dates'

let adminId: string
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const request = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/trabajadores', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const editar = (id: string, body: unknown) => PUT(request(body, 'PUT'), { params: Promise.resolve({ id }) })
const crear = (extra: Record<string, unknown> = {}) => db.trabajador.create({ data: {
  nombre: `Trabajador sintético ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'FIJO', usaMoto: false,
  comPacaAgua: 200, salarioFijo: 15000, ...extra,
} })

describe('#671 — tipos de pago y actualización contextual (PostgreSQL real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(publishRealtimeEvent).mockResolvedValue(undefined)
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00Z' })
  })

  it.each(['COMISION', 'MIXTO'] as const)('crear un sellador sin moto conserva %s', async tipoPago => {
    const res = await POST(request({ nombre: `Nuevo ${randomUUID()}`, rol: 'SELLADOR', usaMoto: false,
      tipoPago, comPacaAgua: 200, salarioFijo: tipoPago === 'MIXTO' ? 5000 : 0 }))
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
    const { trabajador } = await res.json()
    expect((await db.trabajador.findUniqueOrThrow({ where: { id: trabajador.id } })).tipoPago).toBe(tipoPago)
  })

  it.each(['SELLADOR', 'REPARTIDOR'] as const)('editar %s sin moto conserva el tipo elegido sin habilitar la moto', async rol => {
    const t = await crear({ rol })
    expect((await editar(t.id, { tipoPago: 'MIXTO' })).status).toBe(200)
    const guardado = await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })
    expect(guardado.tipoPago).toBe('MIXTO')
    expect(guardado.usaMoto).toBe(false)
    expect(Number(guardado.salarioFijo)).toBe(15000)
    expect(Number(guardado.comRepartAgua)).toBe(0)
  })

  it('editar solo teléfono conserva moto, tipo, capacidad, tarifas, salario y plan de pago', async () => {
    const t = await crear({ rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'MIXTO', capacidadKg: 400,
      comRepartAgua: 350, comRepartHielo: 275, comRepartBotellon: 175,
      frecuenciaPago: 'SEMANAL', diasPago: [2], frecuenciaDesde: startOfDayBogota(hoy) })
    expect((await editar(t.id, { telefono: '3001234567' })).status).toBe(200)
    const g = await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })
    expect({ ...g, telefono: t.telefono, updatedAt: t.updatedAt }).toEqual(t)
    expect(g.telefono).toContain('3001234567')
  })

  it('un PATCH de días se valida con la frecuencia guardada; no reinicia la vigencia al reenviar el mismo plan', async () => {
    const t = await crear({ frecuenciaPago: 'SEMANAL', diasPago: [1], frecuenciaDesde: startOfDayBogota(hoy) })
    expect((await editar(t.id, { diasPago: [3] })).status).toBe(200)
    const a = await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })
    expect(a.diasPago).toEqual([3])
    expect((await editar(t.id, { diasPago: [3] })).status).toBe(200)
    expect((await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })).frecuenciaDesde).toEqual(a.frecuenciaDesde)
    expect((await editar(t.id, { diasPago: [20] })).status).toBe(400)
  })

  it('audita antes/después del tipo, tarifas y plan y conserva una nómina consolidada', async () => {
    const t = await crear()
    const n = await db.nomina.create({ data: { trabajadorId: t.id, fechaInicio: startOfDayBogota(hoy),
      fechaFin: startOfDayBogota(hoy), estado: 'PAGADA', fechaPago: new Date(), total: 12000 } })
    expect((await editar(t.id, { tipoPago: 'COMISION' })).status).toBe(200)
    expect(await db.nomina.findUniqueOrThrow({ where: { id: n.id } })).toEqual(n)
    const audit = await db.historial.findFirstOrThrow({ where: { entidad: 'Trabajador', registroId: t.id, accion: 'UPDATE' } })
    const datos = JSON.parse(audit.datos)
    expect(datos.antes.tipoPago).toBe('FIJO')
    expect(datos.despues.tipoPago).toBe('COMISION')
    expect(datos.despues.comPacaAgua).toBe(200)
    expect(datos.vigenteDesde).toBeTruthy()
    expect(audit.usuarioId).toBe(adminId)
  })

  it('si falla la auditoría, el cambio salarial hace rollback', async () => {
    const t = await crear()
    vi.spyOn(auditoria, 'logAudit').mockRejectedValueOnce(new Error('Fallo de auditoría simulado'))
    expect((await editar(t.id, { tipoPago: 'MIXTO', salarioFijo: 20000 })).status).toBe(500)
    expect(await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })).toEqual(t)
  })

  it('dos ediciones parciales concurrentes conservan ambas intenciones', async () => {
    const t = await crear({ tipoPago: 'MIXTO', usaMoto: true, capacidadKg: 300 })
    const resultados = await Promise.all([editar(t.id, { telefono: '3001234567' }), editar(t.id, { comPacaAgua: 375 })])
    expect(resultados.map(r => r.status)).toEqual([200, 200])
    const g = await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })
    expect(g.telefono).toContain('3001234567')
    expect(Number(g.comPacaAgua)).toBe(375)
    expect(g.tipoPago).toBe('MIXTO')
    expect(g.usaMoto).toBe(true)
  })

  it.each(['ASISTENTE', 'CONTADOR', 'REPARTIDOR'])('%s no cambia el contrato salarial', async role => {
    const t = await crear()
    mockAuth.mockResolvedValue({ user: { id: adminId, role } })
    expect((await editar(t.id, { tipoPago: 'COMISION' })).status).toBe(403)
    expect(await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })).toEqual(t)
  })

  it('un tipo inválido y una moto sin capacidad se rechazan sin alterar el registro; inexistente devuelve 404', async () => {
    const t = await crear({ capacidadKg: 0 })
    expect((await editar(t.id, { tipoPago: 'OTRO' })).status).toBe(400)
    expect((await editar(t.id, { usaMoto: true, capacidadKg: 0 })).status).toBe(400)
    expect(await db.trabajador.findUniqueOrThrow({ where: { id: t.id } })).toEqual(t)
    expect((await editar('trabajador-inexistente-671', { tipoPago: 'COMISION' })).status).toBe(404)
  })

  it('COMISION no suma un salario fijo oculto en una nueva liquidación', async () => {
    const t = await crear({ tipoPago: 'COMISION', salarioFijo: 25000 })
    const res = await liquidar(request({ trabajadorId: t.id, fechaInicio: hoy, fechaFin: hoy, tipoCalculo: 'AUTO' }))
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
    const n = await db.nomina.findFirstOrThrow({ where: { trabajadorId: t.id } })
    expect(Number(n.salario)).toBe(0)
    expect(Number(n.total)).toBe(0)
  })
})
