// @tests #796 paso 3 — el cobro de un pedido entregado HOY ya no crea el Abono espejo (PostgreSQL real)
// Banderas: COBRO_DIA_SIN_ESPEJO (esta) + CORRECCION_PAGO_SIN_ABONO (prerrequisito: el pago debe poder corregirse).
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

let adminId: string
const HORA = 3600_000
const post = (data: unknown) => new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
})
const jsonReq = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest

async function escenario(o: { entregadoHaceHoras: number } = { entregadoHaceHoras: 0 }) {
  const c = await db.cliente.create({ data: { nombre: 'Sin espejo 796', telefono: randomUUID() } })
  const p = await db.pedido.create({ data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', estado: 'ENTREGADO',
    estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE', total: 10000, saldo: 10000, totalPagado: 0,
    fecha: new Date(Date.now() - o.entregadoHaceHoras * HORA), entregadoAt: new Date(Date.now() - o.entregadoHaceHoras * HORA) } })
  const f = await db.factura.create({ data: { pedidoId: p.id, clienteId: c.id, numero: 'S-' + randomUUID(), subtotal: 10000, total: 10000, montoPagado: 0, saldo: 10000 } })
  return { c, p, f }
}
const cobrarPedido = (clienteId: string, pedidoId: string, monto = 10000, offlineId: string = randomUUID()) =>
  POST(post({ clienteId, pedidoId, monto, metodo: 'EFECTIVO', offlineId }))

describe('#796 paso 3 · cobro del día sin abono espejo', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => { mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01' }) })
  afterEach(() => { delete process.env.COBRO_DIA_SIN_ESPEJO; delete process.env.CORRECCION_PAGO_SIN_ABONO })
  afterAll(disconnect)

  it('banderas apagadas (por defecto): el cobro del día sigue creando su espejo, como antes', async () => {
    const { c, p } = await escenario()
    const r = await cobrarPedido(c.id, p.id)
    expect(r.status).toBe(200)
    expect((await r.json()).pagosAplicados[0].abonoCreado).toBe(true)
    expect(await db.abono.count({ where: { pedidoId: p.id, origenCobro: 'ESPEJO_PAGO' } })).toBe(1)
  })

  it('solo COBRO_DIA_SIN_ESPEJO sin CORRECCION_PAGO_SIN_ABONO: NO omite el espejo (el pago no tendría camino de corrección)', async () => {
    process.env.COBRO_DIA_SIN_ESPEJO = 'true'
    const { c, p } = await escenario()
    expect((await cobrarPedido(c.id, p.id)).status).toBe(200)
    expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(1)
  })

  describe('con las dos banderas', () => {
    beforeEach(() => { process.env.COBRO_DIA_SIN_ESPEJO = 'true'; process.env.CORRECCION_PAGO_SIN_ABONO = 'true' })

    it('el pago, el saldo, la factura y el libro quedan igual que con espejo; solo falta el Abono', async () => {
      const { c, p, f } = await escenario()
      const r = await cobrarPedido(c.id, p.id)
      expect(r.status).toBe(200)
      expect((await r.json()).pagosAplicados[0].abonoCreado).toBe(false)
      expect(await db.pago.count({ where: { pedidoId: p.id } })).toBe(1)
      expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
      const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } })
      expect([Number(ped.totalPagado), Number(ped.saldo), ped.estadoPago]).toEqual([10000, 0, 'PAGADO'])
      const fac = await db.factura.findUniqueOrThrow({ where: { id: f.id } })
      expect([Number(fac.montoPagado), Number(fac.saldo), fac.estado]).toEqual([10000, 0, 'PAGADA'])
      expect((await db.receivableEntry.findMany({ where: { pedidoId: p.id, tipo: 'PAGO' } })).map(e => Number(e.monto))).toEqual([10000])
    })

    it('la factura muestra el pago (se lee desde Pago) y Cartera no lista nada', async () => {
      const { c, p, f } = await escenario()
      await cobrarPedido(c.id, p.id)
      const { GET: facturaGET } = await import('@/app/api/facturas/[id]/route')
      const fj = await (await facturaGET({} as never, { params: Promise.resolve({ id: f.id }) })).json()
      const pagos = (fj.data ?? fj).factura?.historialPagos?.pagos ?? (fj.data ?? fj).historialPagos?.pagos
      expect(pagos).toHaveLength(1)
      const { GET: carteraGET } = await import('@/app/api/cartera/abonos/route')
      const cj = await (await carteraGET(new NextRequest(`http://localhost/api/cartera/abonos?clienteId=${c.id}&incluirCobrosDelDia=true`))).json()
      expect(((cj.data ?? cj).abonos ?? [])).toHaveLength(0)
    })

    it('el pago sin espejo se puede corregir por su ruta propia y recalcula pedido y factura', async () => {
      const { c, p, f } = await escenario()
      await cobrarPedido(c.id, p.id)
      const pago = await db.pago.findFirstOrThrow({ where: { pedidoId: p.id } })
      const { POST: corregir } = await import('@/app/api/pagos/[id]/corregir/route')
      const res = await corregir(jsonReq({ tipo: 'MONTO', motivo: 'digitó de más', montoRevertido: 4000, correccionOfflineId: randomUUID() }), { params: Promise.resolve({ id: pago.id }) })
      expect(res.status).toBe(201)
      const ped = await db.pedido.findUniqueOrThrow({ where: { id: p.id } })
      expect([Number(ped.totalPagado), Number(ped.saldo)]).toEqual([6000, 4000])
      const fac = await db.factura.findUniqueOrThrow({ where: { id: f.id } })
      expect([Number(fac.montoPagado), Number(fac.saldo), fac.estado]).toEqual([6000, 4000, 'PARCIAL'])
    })

    it('reintento con el mismo offlineId: no duplica pago ni crea espejo', async () => {
      const { c, p } = await escenario()
      const id = randomUUID()
      expect((await cobrarPedido(c.id, p.id, 10000, id)).status).toBe(200)
      expect((await cobrarPedido(c.id, p.id, 10000, id)).status).toBeLessThan(500)
      expect(await db.pago.count({ where: { pedidoId: p.id } })).toBe(1)
      expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
    })

    it('el cobro por Fiados (sin pedidoId) sigue creando espejo: es cartera', async () => {
      const { c, p } = await escenario({ entregadoHaceHoras: 30 })
      const r = await POST(post({ clienteId: c.id, monto: 10000, metodo: 'EFECTIVO', offlineId: randomUUID() }))
      expect(r.status).toBe(200)
      expect(await db.abono.count({ where: { pedidoId: p.id, origenCobro: 'ESPEJO_PAGO' } })).toBe(1)
    })

    it('un pedido entregado otro día no entra por este camino (409) y no cambia nada', async () => {
      const { c, p } = await escenario({ entregadoHaceHoras: 30 })
      const r = await cobrarPedido(c.id, p.id)
      expect(r.status).toBe(409)
      expect(await db.pago.count({ where: { pedidoId: p.id } })).toBe(0)
      expect(await db.abono.count({ where: { pedidoId: p.id } })).toBe(0)
    })

    it('la integridad no reporta nada nuevo por un pago sin espejo', async () => {
      const { c, p } = await escenario()
      await cobrarPedido(c.id, p.id)
      const reporte = await verificarIntegridad(db, { maxMuestras: 5000 })
      const sobreEste = JSON.stringify(reporte).includes(p.id)
      expect(sobreEste).toBe(false)
    })
  })
})
