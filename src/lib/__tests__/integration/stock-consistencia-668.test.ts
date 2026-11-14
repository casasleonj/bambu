// @tests #668 fase 1 — fechas de cierres atrasados y consistencia del stock. Handlers y PostgreSQL reales; datos sintéticos.
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
import { prisma } from '@/lib/prisma'
import { POST as crearProduccion } from '@/app/api/produccion/route'
import { getStockDisponible } from '@/lib/stock'
import { construirResumenCierre } from '@/lib/cierre-resumen'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

const dia = (atras: number) => dayInBogota(new Date(Date.now() - atras * 86_400_000))
let adminId: string

const post = (body: unknown) => new NextRequest('http://localhost/api/produccion', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const repartidor = () => testPrisma.trabajador.create({
  data: { nombre: `Repartidor ${randomUUID()}`, rol: 'REPARTIDOR', tipoPago: 'COMISION' },
})
const item = (producto: 'PACA_AGUA' | 'PACA_HIELO', n: number, extra: Record<string, number> = {}) =>
  ({ producto, conteoA: n, conteoB: n, stockFinFisico: 0, ...extra })
const cuerpo = (trabajadorId: string, turno: string, agua: number, extra: Record<string, unknown> = {}) => ({
  turno, trabajadorId, items: [item('PACA_AGUA', agua), item('PACA_HIELO', 0)], obs: 'Prueba sintética', ...extra,
})

/** Deja la base sin cierres, producciones, embarques ni configuración de stock entre pruebas. */
async function limpiar() {
  await testPrisma.embarqueMovimiento.deleteMany({})
  await testPrisma.embarqueProducto.deleteMany({})
  await testPrisma.embarque.deleteMany({})
  await testPrisma.produccionItem.deleteMany({})
  await testPrisma.produccion.deleteMany({})
  await testPrisma.cierreDia.deleteMany({})
  await testPrisma.config.deleteMany({ where: { clave: { in: ['STOCK_INI_AGUA', 'STOCK_INI_HIELO', 'STOCK_INI_BOTELLON', 'STOCK_ESTIMADO_HOY'] } } })
}

describe('#668 fase 1 — fechas de cierres atrasados y consistencia del stock', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await limpiar()
  })
  afterAll(disconnect)

  describe('A — el cierre de un día atrasado usa solo cierres anteriores a su fecha', () => {
    it('el inicial sugerido de un día con un cierre posterior sale del cierre inmediatamente anterior', async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(4)), cerradoPor: adminId, stockFinAgua: 100, stockFinHielo: 40 } })
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(1)), cerradoPor: adminId, stockFinAgua: 300, stockFinHielo: 90 } })
      const { cierre } = await construirResumenCierre(testPrisma, dia(2))
      expect(cierre.stockInicialSugerido).toMatchObject({ stockIniAgua: 100, stockIniHielo: 40 })
    })
  })

  describe('B, C y D — stock disponible', () => {
    it('B: con 500 iniciales, carga 100 y devolución 20 quedan 420 (la carga de un embarque cerrado también sale)', async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(1)), cerradoPor: adminId, stockFinAgua: 500 } })
      const r = await repartidor()
      await testPrisma.embarque.create({ data: {
        trabajadorId: r.id, estado: 'CERRADO', pacasAgua: 100, devueltasAgua: 20,
        productos: { create: { producto: 'PACA_AGUA', cargadas: 100, devueltas: 20 } },
      } })
      expect((await getStockDisponible()).stock.PACA_AGUA).toBe(420)
    })

    it('B: un embarque en ruta sigue restando solo lo cargado', async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(1)), cerradoPor: adminId, stockFinAgua: 500 } })
      const r = await repartidor()
      await testPrisma.embarque.create({ data: {
        trabajadorId: r.id, estado: 'EN_RUTA', pacasAgua: 100,
        productos: { create: { producto: 'PACA_AGUA', cargadas: 100 } },
      } })
      expect((await getStockDisponible()).stock.PACA_AGUA).toBe(400)
    })

    it('C: filtradas, merma (rotas) y consumo interno descuentan una sola vez de la producción del día', async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia(1)), cerradoPor: adminId, stockFinAgua: 50, stockFinHielo: 10 } })
      const s = await sellador()
      const res = await crearProduccion(post(cuerpo(s.id, 'MANANA', 100, {
        items: [item('PACA_AGUA', 100, { rotas: 3, filtradas: 2, consumoInterno: 1 }), item('PACA_HIELO', 20, { rotas: 4 })],
      })))
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const stock = (await getStockDisponible()).stock
      expect(stock.PACA_AGUA).toBe(50 + 100 - 3 - 2 - 1)
      expect(stock.PACA_HIELO).toBe(10 + 20 - 4)
    })

    it('D: un cierre del mismo día no vuelve a sumar la producción que ya incluye', async () => {
      const s = await sellador()
      const res = await crearProduccion(post(cuerpo(s.id, 'MANANA', 60)))
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      // el cierre de hoy ya incluye esas 60 en su stock final
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(todayInBogota()), cerradoPor: adminId, stockFinAgua: 60 } })
      expect((await getStockDisponible()).stock.PACA_AGUA).toBe(60)
    })
  })

  describe('E — dos selladores a la vez', () => {
    it('la segunda producción incluye lo de la primera en su stock inicial, aunque lean al mismo tiempo', async () => {
      // Barrera de prueba: cada petición espera (hasta 600 ms) a que la otra también haya leído las producciones previas.
      // Con la lectura antes del lock, ambas guardan el mismo inicial; con la lectura bajo el lock, la segunda ve a la primera.
      let lecturas = 0
      let liberar: () => void = () => undefined
      const ambasLeyeron = new Promise<void>((resolve) => { liberar = resolve })
      // El cliente Prisma es global y lo comparten todos los archivos de integración: se sustituye el método y se devuelve
      // SIEMPRE el original en `finally` (un espía de vitest dejaba `findMany` roto para los archivos siguientes).
      const delegado = prisma.produccion as unknown as { findMany: (...args: unknown[]) => Promise<unknown> }
      const original = delegado.findMany
      delegado.findMany = async (...args: unknown[]) => {
        const filas = await original.apply(delegado, args)
        lecturas += 1
        if (lecturas >= 2) liberar()
        await Promise.race([ambasLeyeron, new Promise<void>((resolve) => setTimeout(resolve, 600))])
        return filas
      }

      const [a, b] = await Promise.all([sellador(), sellador()])
      let r1: Response
      let r2: Response
      try {
        ;[r1, r2] = await Promise.all([
          crearProduccion(post(cuerpo(a.id, 'MANANA', 100))),
          crearProduccion(post(cuerpo(b.id, 'TARDE', 60))),
        ])
      } finally {
        delegado.findMany = original
      }
      expect(r1.status, JSON.stringify(await r1.clone().json())).toBe(201)
      expect(r2.status, JSON.stringify(await r2.clone().json())).toBe(201)

      const filas = await testPrisma.produccionItem.findMany({
        where: { producto: 'PACA_AGUA' }, include: { produccion: true }, orderBy: { produccion: { createdAt: 'asc' } },
      })
      expect(filas).toHaveLength(2)
      const [primera, segunda] = filas
      expect(primera.stockIni).toBe(0)
      // la segunda empieza con lo que dejó la primera: nada de dos inicios en cero
      expect(segunda.stockIni).toBe(primera.producido)
    })
  })
})
