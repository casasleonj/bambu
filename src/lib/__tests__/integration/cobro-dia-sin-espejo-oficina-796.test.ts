// @tests #796 paso 3 — el cobro del día registrado por OFICINA (quién recibió el dinero) tampoco crea abono espejo
// En producción, los cobros del mismo día posteriores a la activación entraron por la «gestión directa» (oficina) y
// seguían creando espejo porque la regla excluía toda la oficina. Solo debe excluirse la recepción con fecha retroactiva.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST } from '@/app/api/pedidos/pagar-fiado/route'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

let adminId = ''
let repartidorId = ''
const HORA = 3600_000

async function escenario() {
  const c = await db.cliente.create({ data: { nombre: 'Oficina sin espejo 796', telefono: randomUUID() } })
  const entregado = new Date(Date.now() - 2 * HORA)
  const p = await db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
    estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0, fecha: entregado, createdAt: entregado, entregadoAt: entregado } })
  await db.factura.create({ data: { pedidoId: p.id, clienteId: c.id, numero: 'O-' + randomUUID(), subtotal: 10000, total: 10000, montoPagado: 0, saldo: 10000 } })
  return { c, p }
}
const cobrar = async (clienteId: string, pedidoId: string, extra: Record<string, unknown>) => {
  const res = await POST(new NextRequest('http://localhost/api/pedidos/pagar-fiado', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clienteId, pedidoId, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID(), ...extra }) }))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

describe('#796 paso 3 · cobro del día por oficina sin abono espejo', () => {
  beforeAll(async () => {
    await resetAndSeed(); adminId = (await getAdminUser()).id
    repartidorId = (await db.trabajador.create({ data: { nombre: 'Repartidor oficina 796', rol: 'REPARTIDOR', usaMoto: true } })).id
    await db.config.upsert({ where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE }, create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: 'true' }, update: { valor: 'true' } })
  })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01' }) })
  afterEach(() => { delete process.env.COBRO_DIA_SIN_ESPEJO; delete process.env.CORRECCION_PAGO_SIN_ABONO })
  afterAll(disconnect)

  it('con las banderas apagadas, la oficina del día sigue creando su espejo (comportamiento anterior)', async () => {
    const { c, p } = await escenario()
    const r = await cobrar(c.id, p.id, { recibioDinero: 'OFICINA' })
    expect(r.status).toBe(200)
    expect(await db.abono.count({ where: { pedidoId: p.id, origenCobro: 'ESPEJO_PAGO' } })).toBe(1)
  })

  describe('con las dos banderas', () => {
    beforeEach(() => { process.env.COBRO_DIA_SIN_ESPEJO = 'true'; process.env.CORRECCION_PAGO_SIN_ABONO = 'true' })

    it('oficina recibió el dinero HOY: pago sin espejo, y el pago guarda quién lo recibió', async () => {
      const { c, p } = await escenario()
      const r = await cobrar(c.id, p.id, { recibioDinero: 'OFICINA' })
      expect(r.status).toBe(200)
      expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
      const pagos = await db.pago.findMany({ where: { pedidoId: p.id } })
      expect(pagos).toHaveLength(1)
      expect(pagos[0].ocurridoAt).toBeNull()
      const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } })
      expect([Number(ped.totalPagado), Number(ped.saldo), ped.estadoPago]).toEqual([10000, 0, 'PAGADO'])
    })

    it('la integridad no reporta nada nuevo sobre un cobro de oficina sin espejo', async () => {
      const { c, p } = await escenario()
      expect((await cobrar(c.id, p.id, { recibioDinero: 'OFICINA' })).status).toBe(200)
      const { numero } = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, select: { numero: true } })
      const reporte = await verificarIntegridad(db, { maxMuestras: 5000 })
      const reglas = reporte.reglas.filter(r => r.id !== 'V11').flatMap(r => r.hallazgos.filter(h => h.numero === numero).map(() => r.id))
      expect(reglas).toEqual([])
    })

    it('lo recibió el repartidor HOY: también sin espejo y con su responsable', async () => {
      const { c, p } = await escenario()
      const r = await cobrar(c.id, p.id, { recibioDinero: 'REPARTIDOR', repartidorId })
      expect(r.status).toBe(200)
      expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
      expect((await db.pago.findFirstOrThrow({ where: { pedidoId: p.id } })).recibidoPorId).toBe(repartidorId)
    })

    it('recepción con fecha retroactiva: o se rechaza, o conserva su espejo (nunca queda un pago retroactivo sin espejo)', async () => {
      const { c, p } = await escenario()
      const ayer = new Date(Date.now() - 30 * HORA).toISOString()
      const r = await cobrar(c.id, p.id, { recibioDinero: 'OFICINA', fechaRecepcion: ayer })
      const pagos = await db.pago.findMany({ where: { pedidoId: p.id } })
      if (r.status === 200) {
        expect(pagos.some(g => g.ocurridoAt !== null)).toBe(true)
        expect(await db.abono.count({ where: { pedidoId: p.id, origenCobro: 'ESPEJO_PAGO' } })).toBe(pagos.length)
      } else {
        expect(pagos).toHaveLength(0)
        expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
      }
    })

    it('el cobro por Fiados (sin pedidoId) de un cliente con la oficina sigue creando espejo: es cartera', async () => {
      const { c, p } = await escenario()
      await db.pedido.update({ where: { id: p.id }, data: { entregadoAt: new Date(Date.now() - 30 * HORA), fecha: new Date(Date.now() - 30 * HORA), createdAt: new Date(Date.now() - 30 * HORA) } })
      const res = await POST(new NextRequest('http://localhost/api/pedidos/pagar-fiado', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: c.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID(), recibioDinero: 'OFICINA' }) }))
      expect(res.status).toBe(200)
      expect(await db.abono.count({ where: { pedidoId: p.id, origenCobro: 'ESPEJO_PAGO' } })).toBe(1)
    })
  })
})
