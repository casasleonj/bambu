// @tests #836 F2b — hora acordada del pedido (entregaNoAntesDe): reprogramar con hora, historial, CHECK de formato
// y orden de «Para hoy» por tiempo restante (Ya toca → Normales → Más tarde), con el reloj fijado.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { ReprogramarPedidoUseCase } from '@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'
import { todayStringBogota } from '@/lib/dates'

const HOY = todayStringBogota()
const en = (d: string, h = '12:00:00') => new Date(`${d}T${h}-05:00`)
const uc = new ReprogramarPedidoUseCase()
let adminId: string

async function crear(o: { prometido: Date | null; hora?: string | null; numeroCliente?: string; creado?: Date }) {
  const c = await testPrisma.cliente.create({ data: { nombre: `C-${o.numeroCliente ?? randomUUID().slice(0, 6)}`, telefono: randomUUID() } })
  const creado = o.creado ?? new Date()
  return testPrisma.pedido.create({
    data: {
      clienteId: c.id, createdById: adminId, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: creado, createdAt: creado,
      estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE', total: 5000, totalPagado: 0, saldo: 5000,
      fechaEntrega: o.prometido, entregaNoAntesDe: o.hora ?? null,
    },
  })
}

describe('#836 F2b — hora acordada (Postgres real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  afterEach(() => { vi.useRealTimers() })

  it('reprogramar con hora: queda en el pedido y en el historial (anterior y nueva)', async () => {
    const p = await crear({ prometido: en(HOY), hora: '08:00' })
    const r = await uc.execute({ pedidoId: p.id, fechaNueva: en(HOY, '12:00:00'), horaNueva: '16:00', actorId: adminId })
    expect(r.horaAnterior).toBe('08:00')
    expect(r.horaNueva).toBe('16:00')
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).entregaNoAntesDe).toBe('16:00')
    const h = await testPrisma.pedidoReprogramacion.findFirstOrThrow({ where: { pedidoId: p.id } })
    expect([h.horaAnterior, h.horaNueva]).toEqual(['08:00', '16:00'])
  })

  it('omitir la hora no la toca; null la quita; el historial conserva lo que había', async () => {
    const p = await crear({ prometido: en(HOY), hora: '09:30' })
    await uc.execute({ pedidoId: p.id, fechaNueva: en(HOY), actorId: adminId })
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).entregaNoAntesDe).toBe('09:30')
    const quitar = await uc.execute({ pedidoId: p.id, fechaNueva: en(HOY), horaNueva: null, actorId: adminId })
    expect(quitar.horaAnterior).toBe('09:30')
    expect(quitar.horaNueva).toBeNull()
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).entregaNoAntesDe).toBeNull()
  })

  it('el reintento offline (mismo offlineId) devuelve el mismo resultado con sus horas y no duplica', async () => {
    const p = await crear({ prometido: en(HOY) })
    const off = randomUUID()
    const a = await uc.execute({ pedidoId: p.id, fechaNueva: en(HOY), horaNueva: '10:15', actorId: adminId, offlineId: off })
    const b = await uc.execute({ pedidoId: p.id, fechaNueva: en(HOY), horaNueva: '10:15', actorId: adminId, offlineId: off })
    expect(b.deduped).toBe(true)
    expect([b.horaAnterior, b.horaNueva]).toEqual([a.horaAnterior, a.horaNueva])
    expect(await testPrisma.pedidoReprogramacion.count({ where: { pedidoId: p.id } })).toBe(1)
  })

  it('la base rechaza una hora mal formada (CHECK) tanto en el pedido como en el historial', async () => {
    await expect(crear({ prometido: en(HOY), hora: '25:00' })).rejects.toThrow()
    await expect(crear({ prometido: en(HOY), hora: '6:00' })).rejects.toThrow()
    const p = await crear({ prometido: en(HOY) })
    await expect(testPrisma.pedidoReprogramacion.create({
      data: { pedidoId: p.id, fechaNueva: en(HOY), horaNueva: 'abc', reprogramadoPorId: adminId },
    })).rejects.toThrow()
  })

  describe('«Para hoy» por tiempo restante', () => {
    const ids: Record<string, string> = {}
    beforeAll(async () => {
      await resetAndSeed()
      adminId = (await getAdminUser()).id
      const base = new Date(Date.now() - 3600_000)
      for (const [k, hora] of [['sinHora', null], ['t1730', '17:30'], ['t16', '16:00'], ['c0800', '08:00'], ['a0630', '06:30']] as const) {
        // `creado` escalonado: el orden por defecto (más reciente primero) decide entre pedidos sin hora.
        ids[k] = (await crear({ prometido: en(HOY), hora, creado: new Date(base.getTime() + Object.keys(ids).length * 1000) })).id
      }
      ids.ayer = (await crear({ prometido: en(todayStringBogota().replace(/\d{2}$/, (d) => String(Number(d) - 1).padStart(2, '0'))), creado: new Date(base.getTime() - 5000) })).id
    })
    const consulta = (extra = '') => consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`foco=paraHoy&pageSize=100${extra}`)), 'ADMIN')
    const mios = (r: { pedidos: Array<{ id: string }> }) => r.pedidos.map((p) => p.id).filter((id) => Object.values(ids).includes(id))
    const nombre = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0]

    it('6:10 a. m.: ya toca primero; luego sin hora y 1–3 h; más tarde al final', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(en(HOY, '06:10:00'))
      const r = await consulta()
      const orden = mios(r).map(nombre)
      expect(orden.indexOf('a0630')).toBeLessThan(orden.indexOf('sinHora'))
      expect(orden.indexOf('sinHora')).toBeLessThan(orden.indexOf('c0800'))
      expect(orden.indexOf('c0800')).toBeLessThan(orden.indexOf('t16'))
      expect(orden.indexOf('t16')).toBeLessThan(orden.indexOf('t1730'))
      expect(orden).toHaveLength(6) // nada se pierde: también el arrastrado de ayer
    })

    it('3:20 p. m.: el de las 16:00 sube a «ya toca», detrás de los atrasados (06:30 y 08:00) y delante de los sin hora', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(en(HOY, '15:20:00'))
      const orden = mios(await consulta()).map(nombre)
      expect(orden.slice(0, 3)).toEqual(['a0630', 'c0800', 't16']) // atrasados por hora, y el de las 16:00 ya entró
      expect(orden.indexOf('t16')).toBeLessThan(orden.indexOf('sinHora'))
    })

    it('paginar no pierde ni repite pedidos y el total sigue siendo el real', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(en(HOY, '06:10:00'))
      const completo = (await consulta()).pedidos.map((p) => p.id)
      const vistos: string[] = []
      for (const page of [1, 2, 3, 4]) {
        const r = await consulta(`&pageSize=2&page=${page}`)
        expect(r.total).toBe(completo.length)
        vistos.push(...r.pedidos.map((p) => p.id))
      }
      expect(vistos).toEqual(completo)
    })
  })
})
