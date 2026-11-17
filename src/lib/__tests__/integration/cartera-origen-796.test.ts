// @tests #796 — Cartera solo esconde espejos verificados; un abono independiente o de origen desconocido nunca se esconde
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
const req = (qs = '') => ({ nextUrl: { searchParams: new URLSearchParams(qs) } }) as unknown as import('next/server').NextRequest
const AHORA = new Date('2026-11-13T17:00:00Z')

describe('#796 · Cartera no esconde lo que no es un espejo verificado', () => {
  const ids: Record<string, string> = {}
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
    const c = await testPrisma.cliente.create({ data: { nombre: 'Cli origen 796', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
    // Todos: pedido creado, entregado y cobrado el MISMO día (el clasificador diría «cobro del día»).
    for (const k of ['ESPEJO', 'INDEP', 'DESCONOCIDO']) {
      const pedido = await testPrisma.pedido.create({
        data: { clienteId: c.id, canal: 'DOMICILIO', fecha: AHORA, entregadoAt: AHORA, total: 10000, totalPagado: 10000, saldo: 0, estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO' },
      })
      const factura = await testPrisma.factura.create({
        data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId: c.id, pedidoId: pedido.id, subtotal: 10000, total: 10000, saldo: 0, montoPagado: 10000, estado: 'PAGADA' },
      })
      const base = { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId: c.id, pedidoId: pedido.id, monto: 10000, metodoPago: 'EFECTIVO', fecha: AHORA }
      if (k === 'ESPEJO') {
        const pago = await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 10000, createdAt: AHORA, confirmacion: 'CONFIRMADO' } })
        ids[k] = (await testPrisma.abono.create({ data: { ...base, origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id } })).id
      } else if (k === 'INDEP') {
        ids[k] = (await testPrisma.abono.create({ data: { ...base, origenCobro: 'INDEPENDIENTE', offlineId: uniqueId('off') } })).id
      } else {
        ids[k] = (await testPrisma.abono.create({ data: base })).id // origenCobro nulo y sin pruebas: «Por conciliar»
      }
    }
  })
  afterAll(async () => { await disconnect() })

  it('solo el espejo verificado del mismo día se esconde; el independiente y el de origen desconocido siguen listados', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const json = await (await GET(req('pageSize=50'))).json()
    const body = json.data ?? json
    const filas = (body.data ?? body) as Array<{ id: string }>
    const totales = body.totales ?? json.totales
    expect(filas.map((f) => f.id).sort()).toEqual([ids.INDEP, ids.DESCONOCIDO].sort())
    expect(totales.totalNeto).toBe(20000)
    expect(totales.cobrosDelDiaNoListados).toEqual({ cantidad: 1, monto: 10000 })
  })
})
