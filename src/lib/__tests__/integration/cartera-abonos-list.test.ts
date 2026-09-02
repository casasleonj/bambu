// @tests GET /api/cartera/abonos (ADR-CORRECCION-MONETARIA-001 D.5, g2.4)
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))

function req(qs = '') {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as import('next/server').NextRequest
}

describe('GET /api/cartera/abonos', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    adminId = admin.id
    authUser.id = admin.id
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Cli Lista', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true },
    })
    clienteId = c.id

    for (let i = 0; i < 3; i++) {
      const pedido = await testPrisma.pedido.create({
        data: { clienteId, canal: 'DOMICILIO', total: 10000, totalPagado: 10000, saldo: 0, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO' },
      })
      const factura = await testPrisma.factura.create({
        data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: pedido.id, subtotal: 10000, total: 10000, saldo: 0, montoPagado: 10000, estado: 'PAGADA' },
      })
      const abono = await testPrisma.abono.create({
        data: { numero: `ABO-${uniqueId('a').slice(0, 8)}`, facturaId: factura.id, clienteId, pedidoId: pedido.id, monto: 10000, metodoPago: 'NEQUI' },
      })
      if (i === 0) {
        await testPrisma.correccionAbono.create({
          data: { numero: `COR-${uniqueId('c').slice(0, 8)}`, abonoId: abono.id, tipo: 'MONTO', montoRevertido: 3000, motivo: 'de más', autorizadoPorId: adminId },
        })
      }
    }
  })

  afterAll(async () => {
    await disconnect()
  })

  it('lista paginada con enriquecimiento (montoRevertido / montoNeto / corregido)', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const res = await GET(req(`clienteId=${clienteId}&page=1&pageSize=20`))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(3)
    expect(json.total).toBe(3)
    expect(json.totales.totalAbonado).toBe(30000)

    const corregido = json.data.find((a: { corregido: boolean }) => a.corregido)
    expect(corregido.montoRevertido).toBe(3000)
    expect(corregido.montoNeto).toBe(7000)
    expect(corregido.correcciones[0].numero).toMatch(/^COR-/)
  })

  it('filtro estado=corregido / sin-corregir', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const c = await (await GET(req(`clienteId=${clienteId}&estado=corregido`))).json()
    expect(c.data).toHaveLength(1)
    const s = await (await GET(req(`clienteId=${clienteId}&estado=sin-corregir`))).json()
    expect(s.data).toHaveLength(2)
  })

  it('paginación: pageSize=2 → 2 páginas', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const p1 = await (await GET(req(`clienteId=${clienteId}&page=1&pageSize=2`))).json()
    expect(p1.data).toHaveLength(2)
    expect(p1.totalPages).toBe(2)
  })

  it('totales: totalNeto = totalAbonado - totalRevertido', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const json = await (await GET(req(`clienteId=${clienteId}`))).json()
    expect(json.totales.totalAbonado).toBe(30000)
    expect(json.totales.totalRevertido).toBe(3000)
    expect(json.totales.totalNeto).toBe(27000)
  })

  it('q filtra en TODO el set (no solo la página): busca por nº de factura', async () => {
    const { GET } = await import('@/app/api/cartera/abonos/route')
    const alguno = await testPrisma.abono.findFirst({ where: { clienteId }, include: { factura: true } })
    const numFactura = alguno!.factura.numero
    const json = await (await GET(req(`q=${encodeURIComponent(numFactura)}`))).json()
    expect(json.data.length).toBeGreaterThanOrEqual(1)
    expect(json.data.every((a: { factura: { numero: string } | null }) => a.factura?.numero === numFactura)).toBe(true)
  })
})
