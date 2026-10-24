// @tests #402 — Pago con tres fechas y tabla Regularizacion (plan de integridad v1.2 §5.D).
// Contra Postgres real:
//   1. GET /api/cierre (la caja del día) no cuenta un pago de regularización
//      registrado hoy; sí cuenta el pago normal.
//   2. V14 detecta un cierre que sí lo contó y no marca uno que lo excluyó.
//   3. La base rechaza un pago de regularización sin fecha del hecho o con una
//      fecha del hecho posterior a su registro.
//   4. La migración se puede aplicar otra vez sin cambiar nada.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { NextRequest } from 'next/server'

const auth = vi.hoisted(() => ({ user: { id: '', role: 'ADMIN' } }))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: auth.user })),
  requireRole: vi.fn(async () => ({ user: auth.user })),
}))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente, uniqueId } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { GET } from '@/app/api/cierre/route'

const DIA = 24 * 60 * 60 * 1000
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

async function pedidoPagado(clienteId: string, total: number, fecha: Date) {
  return testPrisma.pedido.create({
    data: {
      clienteId, canal: 'PUNTO', origen: 'PEDIDO', fecha, total, totalPagado: total, saldo: 0,
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
    },
  })
}

describe('#402 — tres fechas del pago y regularización', () => {
  let clienteId: string
  let regularizacionId: string
  const hoy = new Date()
  const hace5 = new Date(hoy.getTime() - 5 * DIA)

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    auth.user.id = admin.id
    clienteId = (await createTestCliente('tres-fechas')).id
    regularizacionId = (await testPrisma.regularizacion.create({
      data: { lote: uniqueId('lote'), motivo: 'prueba', autorizadoPorId: admin.id, ejecutadoPorId: admin.id },
    })).id

    // Hoy: un cobro normal de 5.000 y una regularización de 3.000 de un cobro de hace 3 días.
    const normal = await pedidoPagado(clienteId, 5000, hoy)
    await testPrisma.pago.create({ data: { pedidoId: normal.id, metodo: 'EFECTIVO', monto: 5000, confirmacion: 'CONFIRMADO' } })
    const viejo = await pedidoPagado(clienteId, 3000, new Date(hoy.getTime() - 3 * DIA))
    await testPrisma.pago.create({
      data: {
        pedidoId: viejo.id, metodo: 'EFECTIVO', monto: 3000, confirmacion: 'CONFIRMADO',
        ocurridoAt: new Date(hoy.getTime() - 3 * DIA), regularizacionId,
      },
    })
  })

  afterAll(async () => {
    await disconnect()
  })

  it('la caja del día no cuenta el pago de regularización registrado hoy', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/cierre?fecha=${ymd(hoy)}`))
    expect(res.status).toBe(200)
    const json = await res.json()
    const cierre = (json.data ?? json).cierre
    expect(cierre.efectivo).toBe(5000)
  })

  it('V14 marca el cierre que contó la regularización y no el que la excluyó', async () => {
    // Hace 5 días: cobro normal de 1.000 + regularización de 2.000, cierre bien hecho (1.000).
    const p5 = await pedidoPagado(clienteId, 1000, hace5)
    await testPrisma.pago.create({ data: { pedidoId: p5.id, metodo: 'EFECTIVO', monto: 1000, createdAt: hace5 } })
    const p6 = await pedidoPagado(clienteId, 2000, new Date(hace5.getTime() - DIA))
    await testPrisma.pago.create({
      data: {
        pedidoId: p6.id, metodo: 'EFECTIVO', monto: 2000, createdAt: hace5,
        ocurridoAt: new Date(hace5.getTime() - DIA), regularizacionId,
      },
    })
    const bien = await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(ymd(hace5)), efectivo: 1000 } })
    // Hoy: un cierre que sumó la regularización (5.000 + 3.000).
    const mal = await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(ymd(hoy)), efectivo: 8000 } })

    const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 1000 })
    const v14 = reporte.reglas.find((r) => r.id === 'V14')!
    expect(v14.severidad).toBe('CRITICA')
    expect(v14.hallazgos.map((h) => h.ref)).toEqual([mal.id])
    expect(v14.hallazgos[0].detalle).toMatchObject({ metodo: 'EFECTIVO', enCierre: 8000, pagosNormales: 5000, pagosRegularizacion: 3000 })
    expect(v14.hallazgos.map((h) => h.ref)).not.toContain(bien.id)
  })

  it('la base exige fecha del hecho, no posterior al registro, en un pago de regularización', async () => {
    const p = await pedidoPagado(clienteId, 100, hoy)
    await expect(
      testPrisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 100, regularizacionId } }),
    ).rejects.toThrow(/chk_pago_regularizacion_ocurrido/)
    await expect(
      testPrisma.pago.create({
        data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 100, regularizacionId, ocurridoAt: new Date(hoy.getTime() + DIA) },
      }),
    ).rejects.toThrow(/chk_pago_regularizacion_ocurrido/)
  })

  it('la migración es idempotente', async () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../prisma/migrations/20261024_pago_tres_fechas_regularizacion/migration.sql'),
      'utf8',
    )
    const antes = await testPrisma.pago.count()
    // Sin `$$` anidados: cada sentencia termina en `;` al final de línea fuera de un bloque DO.
    const sentencias = sql
      .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
      .split(/;\s*\n(?=(?:[^$]*\$\$[^$]*\$\$)*[^$]*$)/)
      .map((s) => s.trim()).filter(Boolean)
    for (const s of sentencias) await testPrisma.$executeRawUnsafe(s)
    expect(await testPrisma.pago.count()).toBe(antes)
  })
})
