// @tests #796 — cobro del día de la venta vs. cartera, con PostgreSQL real (loader + GET /api/cartera/abonos)
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { clasificarCobrosDePedidos } from '@/lib/cobro-clasificacion-db'
import { tipoDeCobro } from '@/lib/cobro-clasificacion'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))

const req = (qs = '') => ({ nextUrl: { searchParams: new URLSearchParams(qs) } }) as unknown as import('next/server').NextRequest
// Bogotá = UTC-5
const at = (iso: string) => new Date(iso)

describe('#796 clasificación de cobros', () => {
  let clienteId = ''
  const ids: Record<string, { pedido: string; pago: string; abono?: string }> = {}

  async function caso(clave: string, o: {
    creado: Date; entregas: Array<{ at: Date; valor: number }>; entregadoAt?: Date; total: number
    pago: { at: Date; monto: number }; espejo?: boolean; estadoEntrega?: 'ENTREGADO' | 'PENDIENTE'
  }) {
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', fecha: o.creado, total: o.total, totalPagado: o.pago.monto, saldo: o.total - o.pago.monto,
        estadoEntrega: o.estadoEntrega ?? 'ENTREGADO', estadoPago: o.pago.monto >= o.total ? 'PAGADO' : 'PARCIAL',
        ...(o.entregadoAt ? { entregadoAt: o.entregadoAt } : {}),
      },
    })
    for (const e of o.entregas) {
      await testPrisma.entregaExigible.create({ data: { pedidoId: pedido.id, entregadoAt: e.at, valorEntregado: e.valor } })
    }
    const factura = await testPrisma.factura.create({
      data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: pedido.id, subtotal: o.total, total: o.total, saldo: 0, montoPagado: o.pago.monto, estado: 'PAGADA' },
    })
    const pago = await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: o.pago.monto, createdAt: o.pago.at, confirmacion: 'CONFIRMADO' },
    })
    let abono: string | undefined
    if (o.espejo) {
      const a = await testPrisma.abono.create({
        data: {
          numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId, pedidoId: pedido.id, monto: o.pago.monto,
          metodoPago: 'EFECTIVO', fecha: o.pago.at, origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id,
        },
      })
      abono = a.id
    }
    ids[clave] = { pedido: pedido.id, pago: pago.id, abono }
  }

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Cli 796', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true },
    })
    clienteId = c.id
    // A (tipo #1119): creado 12:11, entregado 12:12, cobrado 18:35 el 13-nov, con abono espejo.
    await caso('A', { creado: at('2026-11-13T17:11:00Z'), entregas: [{ at: at('2026-11-13T17:12:00Z'), valor: 23000 }], total: 23000, pago: { at: at('2026-11-13T23:35:00Z'), monto: 23000 }, espejo: true })
    // B (tipo #1084): creado el 12, entregado y cobrado el 13 a las 11:54.
    await caso('B', { creado: at('2026-11-12T22:40:00Z'), entregas: [{ at: at('2026-11-13T16:54:00Z'), valor: 9000 }], total: 9000, pago: { at: at('2026-11-13T16:54:00Z'), monto: 7500 } })
    // C (tipo #1017): entregado el 11, cobrado el 13 con abono espejo.
    await caso('C', { creado: at('2026-11-11T19:48:00Z'), entregas: [{ at: at('2026-11-11T22:11:00Z'), valor: 10000 }], total: 10000, pago: { at: at('2026-11-13T20:17:00Z'), monto: 10000 }, espejo: true })
    // D: entregado sin ningún hecho ni fecha de entrega → fecha de creación, aproximado.
    await caso('D', { creado: at('2026-11-13T13:00:00Z'), entregas: [], total: 5000, pago: { at: at('2026-11-13T13:00:00Z'), monto: 5000 } })
    // E: sin hechos pero con `entregadoAt` en el pedido (creado el 12, entregado y cobrado el 13).
    await caso('E', { creado: at('2026-11-12T15:00:00Z'), entregas: [], entregadoAt: at('2026-11-13T15:00:00Z'), total: 4000, pago: { at: at('2026-11-13T21:00:00Z'), monto: 4000 }, espejo: true })
  })
  afterAll(async () => { await disconnect() })

  it('el loader clasifica por fecha de entrega, no por creación', async () => {
    const r = await clasificarCobrosDePedidos(testPrisma, Object.values(ids).map((x) => x.pedido))
    const tipo = (k: string) => tipoDeCobro(r.porCobro.get(ids[k].pago)!)
    expect(tipo('A')).toBe('COBRO_DEL_DIA')
    expect(tipo('B')).toBe('COBRO_DEL_DIA')
    expect(tipo('C')).toBe('CARTERA')
    expect(tipo('D')).toBe('COBRO_DEL_DIA')
    expect(tipo('E')).toBe('COBRO_DEL_DIA')
    expect(r.porCobro.get(ids.D.pago)?.aproximado).toBe(true)
    expect(r.porCobro.get(ids.E.pago)?.aproximado).toBe(false)
  })

  it('no pierde dinero: ventaDía + cartera = monto cobrado', async () => {
    const r = await clasificarCobrosDePedidos(testPrisma, Object.values(ids).map((x) => x.pedido))
    const montos: Record<string, number> = { A: 2300000, B: 750000, C: 1000000, D: 500000, E: 400000 }
    for (const [k, m] of Object.entries(montos)) {
      const c = r.porCobro.get(ids[k].pago)!
      expect(c.ventaDiaCentavos + c.carteraCentavos).toBe(m)
    }
  })

  const listar = async (qs = 'pageSize=50') => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const json = await (await GET(req(qs))).json()
    const body = json.data ?? json
    return {
      filas: (body.data ?? body) as Array<{ id: string; tipoCobro: string | null; fechaAproximada: boolean; montoNeto: number }>,
      totales: (body.totales ?? json.totales) as {
        totalNeto: number; clasificacionDisponible: boolean; carteraRecuperada: number | null
        cobrosDelDiaNoListados: { cantidad: number; monto: number } | null
      },
    }
  }

  it('GET /api/cartera/abonos NO lista el cobro del día: solo la cartera de entregas anteriores', async () => {
    const { filas, totales } = await listar()
    expect(filas.map((f) => f.id)).toEqual([ids.C.abono])
    expect(filas[0]).toMatchObject({ tipoCobro: 'CARTERA', montoNeto: 10000 })
    expect(totales).toMatchObject({ clasificacionDisponible: true, carteraRecuperada: 10000, totalNeto: 10000 })
    expect(totales.cobrosDelDiaNoListados).toEqual({ cantidad: 2, monto: 27000 })
  })

  it('los cobros del día no se borran: siguen en la base y salen con incluirCobrosDelDia=true', async () => {
    expect(await testPrisma.abono.count({ where: { id: { in: [ids.A.abono!, ids.E.abono!] } } })).toBe(2)
    const { filas, totales } = await listar('pageSize=50&incluirCobrosDelDia=true')
    expect(filas).toHaveLength(3)
    expect(filas.find((f) => f.id === ids.A.abono)?.tipoCobro).toBe('COBRO_DEL_DIA')
    expect(filas.find((f) => f.id === ids.E.abono)?.tipoCobro).toBe('COBRO_DEL_DIA')
    expect(totales.cobrosDelDiaNoListados).toBeNull()
  })

  it('una corrección sobre un cobro del día baja lo no listado y no mueve la cartera', async () => {
    await testPrisma.correccionAbono.create({
      data: { numero: `COR-${uniqueId('c').slice(0, 8)}`, abonoId: ids.A.abono!, tipo: 'MONTO', montoRevertido: 3000, motivo: 'prueba', autorizadoPorId: authUser.id },
    })
    const { filas, totales } = await listar()
    expect(filas).toHaveLength(1)
    expect(totales.carteraRecuperada).toBe(10000)
    expect(totales.cobrosDelDiaNoListados).toEqual({ cantidad: 2, monto: 24000 })
  })
})
