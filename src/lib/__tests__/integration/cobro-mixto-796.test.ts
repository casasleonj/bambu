// @tests #796 paso 0 — cobro mixto (entrega anterior + entrega de hoy) y prepago, con PostgreSQL real
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
const req = (qs = '') => ({ nextUrl: { searchParams: new URLSearchParams(qs) } }) as unknown as import('next/server').NextRequest
const at = (iso: string) => new Date(iso)

describe('#796 paso 0 · Cartera muestra y suma solo la deuda de jornadas anteriores', () => {
  let clienteId = ''
  const abono: Record<string, string> = {}

  async function pedidoConCobro(clave: string, o: {
    creado: string; total: number; entregas: Array<{ at: string; valor: number }>; cobros: Array<{ at: string; monto: number; espejo?: boolean }>
  }) {
    const pagado = o.cobros.reduce((t, c) => t + c.monto, 0)
    const pedido = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', fecha: at(o.creado), total: o.total, totalPagado: pagado, saldo: o.total - pagado, estadoEntrega: 'ENTREGADO', estadoPago: pagado >= o.total ? 'PAGADO' : 'PARCIAL' },
    })
    for (const e of o.entregas) await testPrisma.entregaExigible.create({ data: { pedidoId: pedido.id, entregadoAt: at(e.at), valorEntregado: e.valor } })
    const factura = await testPrisma.factura.create({
      data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: pedido.id, subtotal: o.total, total: o.total, saldo: o.total - pagado, montoPagado: pagado, estado: pagado >= o.total ? 'PAGADA' : 'PARCIAL' },
    })
    let i = 0
    for (const c of o.cobros) {
      const pago = await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: c.monto, createdAt: at(c.at), confirmacion: 'CONFIRMADO' } })
      if (c.espejo !== false) {
        const a = await testPrisma.abono.create({
          data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId, pedidoId: pedido.id, monto: c.monto, metodoPago: 'EFECTIVO', fecha: at(c.at), origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id },
        })
        abono[`${clave}${i}`] = a.id
      }
      i++
    }
  }

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
    const c = await testPrisma.cliente.create({ data: { nombre: 'Cli mixto 796', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
    clienteId = c.id
    // M: 20 pacas a $2.300: lunes 16 entrega 10 (23.000), martes 17 entrega 10 (23.000); el martes paga $35.000.
    await pedidoConCobro('M', { creado: '2026-11-16T14:00:00Z', total: 46000,
      entregas: [{ at: '2026-11-16T15:00:00Z', valor: 23000 }, { at: '2026-11-17T15:00:00Z', valor: 23000 }],
      cobros: [{ at: '2026-11-17T21:00:00Z', monto: 35000 }] })
    // P: prepago de $23.000 el lunes; entregas martes y miércoles de $23.000; el miércoles paga otros $23.000.
    await pedidoConCobro('P', { creado: '2026-11-16T13:00:00Z', total: 46000,
      entregas: [{ at: '2026-11-17T15:00:00Z', valor: 23000 }, { at: '2026-11-18T15:00:00Z', valor: 23000 }],
      cobros: [{ at: '2026-11-16T14:00:00Z', monto: 23000 }, { at: '2026-11-18T21:00:00Z', monto: 23000 }] })
  })
  afterAll(async () => { await disconnect() })

  const listar = async (qs = 'pageSize=50') => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const json = await (await GET(req(qs))).json()
    const body = json.data ?? json
    return {
      filas: (body.data ?? body) as Array<{ id: string; tipoCobro: string | null; monto: number; montoNeto: number; montoCartera: number | null; netoCartera: number | null }>,
      totales: (body.totales ?? json.totales) as { totalNeto: number; carteraRecuperada: number | null; cobrosDelDiaNoListados: { cantidad: number; monto: number } | null },
    }
  }

  it('cobro mixto de $35.000: la fila muestra y suma solo los $23.000 de la entrega del lunes', async () => {
    const { filas, totales } = await listar()
    const m = filas.find((f) => f.id === abono.M0)
    expect(m).toMatchObject({ tipoCobro: 'MIXTO', monto: 35000, montoNeto: 35000, montoCartera: 23000, netoCartera: 23000 })
    expect(totales.carteraRecuperada).toBe(23000)
    expect(totales.totalNeto).toBe(23000) // el total de la cabecera NO suma el abono entero
  })

  it('prepago del lunes: el cobro del miércoles es cobro del día y no se lista; el prepago tampoco es cartera', async () => {
    const { filas, totales } = await listar()
    expect(filas.some((f) => f.id === abono.P0)).toBe(false)
    expect(filas.some((f) => f.id === abono.P1)).toBe(false)
    expect(totales.cobrosDelDiaNoListados).toEqual({ cantidad: 2, monto: 46000 })
  })

  it('con incluirCobrosDelDia=true salen los tres abonos y ninguno se perdió', async () => {
    const { filas } = await listar('pageSize=50&incluirCobrosDelDia=true')
    expect(filas).toHaveLength(3)
    expect(await testPrisma.abono.count()).toBe(3)
  })
})
