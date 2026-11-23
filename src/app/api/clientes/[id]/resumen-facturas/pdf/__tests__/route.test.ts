// @vitest-environment node
// @tests GET /api/clientes/[id]/resumen-facturas/pdf — PDF para compartir con el cliente (#845)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindUnique = vi.fn()
const facturaFindMany = vi.fn()
const configFindMany = vi.fn()
const facturaAggregate = vi.fn()
const leerExigibles = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
    factura: { findMany: (...a: unknown[]) => facturaFindMany(...a), aggregate: (...a: unknown[]) => facturaAggregate(...a) },
    config: { findMany: (...a: unknown[]) => configFindMany(...a) },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/entregas-exigibles-db', () => ({ leerExigibles: (...a: unknown[]) => leerExigibles(...a) }))

const get = async (query = '') => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/clientes/c1/resumen-facturas/pdf${query}`), {
    params: Promise.resolve({ id: 'c1' }),
  })
}

const factura = (over: Record<string, unknown>) => ({
  id: 'f',
  numero: 'FAC-1',
  fecha: new Date('2026-11-02T15:00:00Z'),
  total: 120_000,
  montoPagado: 120_000,
  saldo: 0,
  estado: 'PAGADA',
  pedido: { id: 'p', items: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 20, precio: 6_000, subtotal: 120_000 }] },
  abonos: [{ fecha: new Date('2026-11-03T15:00:00Z'), monto: 120_000, correcciones: [] }],
  ...over,
})

describe('GET /api/clientes/[id]/resumen-facturas/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    clienteFindUnique.mockResolvedValue({ nombre: 'Cliente', apellido: 'Ejemplo', telefono: '3001112233', direccion: 'Calle 1', barrio: null })
    facturaFindMany.mockResolvedValue([
      factura({}),
      factura({ id: 'g', numero: 'FAC-2', total: 85_000, montoPagado: 40_000, saldo: 45_000, estado: 'PARCIAL',
        pedido: { id: 'q', items: [{ producto: 'BOTELLON', cantPedido: 5, cantEntrega: 5, precio: 17_000, subtotal: 85_000 }] },
        abonos: [{ fecha: new Date('2026-11-08T15:00:00Z'), monto: 40_000, correcciones: [] }] }),
    ])
    configFindMany.mockResolvedValue([])
    facturaAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } })
    leerExigibles.mockResolvedValue(new Map())
  })

  it('solo ADMIN y ASISTENTE: el contador consulta pero no comparte', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get()
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'ASISTENTE'])
    expect(facturaFindMany).not.toHaveBeenCalled()
  })

  it('devuelve un PDF real, descargable, sin caché compartida', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="Resumen-Cliente-Ejemplo-\d{8}\.pdf"$/)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1_000)
  })

  it('nunca mezcla anuladas: la consulta de «Todas» y «Por cobrar» solo trae estados vigentes', async () => {
    await get()
    expect(facturaFindMany.mock.calls[0][0].where.estado).toEqual({ in: ['EMITIDA', 'PARCIAL', 'PAGADA'] })
    await get('?estado=TODAS')
    expect(facturaFindMany.mock.calls[1][0].where.estado).toEqual({ in: ['EMITIDA', 'PARCIAL', 'PAGADA'] })
    await get('?estado=POR_COBRAR')
    expect(facturaFindMany.mock.calls[2][0].where.estado).toEqual({ in: ['EMITIDA', 'PARCIAL'] })
  })

  it('usa la deuda exigible (lo entregado menos lo pagado), igual que la pantalla, Fiados y Cartera', async () => {
    await get('?estado=POR_COBRAR')
    expect(leerExigibles).toHaveBeenCalledWith(expect.anything(), { id: { in: ['p', 'q'] } })
  })

  it('respeta el estado elegido y rechaza compartir anuladas', async () => {
    await get('?estado=PAGADA')
    expect(facturaFindMany.mock.calls[0][0].where.estado).toEqual({ in: ['PAGADA'] })
    const res = await get('?estado=ANULADA')
    expect(res.status).toBe(400)
    expect(facturaFindMany).toHaveBeenCalledTimes(1)
  })

  it('sin facturas para ese filtro responde 404 y no genera PDF vacío', async () => {
    facturaFindMany.mockResolvedValue([])
    expect((await get('?estado=PAGADA')).status).toBe(404)
  })

  it('cliente inexistente: 404; fechas inválidas: 400', async () => {
    clienteFindUnique.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
    expect((await get('?desde=ayer')).status).toBe(400)
  })

  it('tolera abonos que no cuadran con lo pagado sin fallar', async () => {
    facturaFindMany.mockResolvedValue([
      factura({ abonos: [{ fecha: new Date(), monto: 5_000, correcciones: [{ montoRevertido: 1_000 }] }] }),
    ])
    expect((await get()).status).toBe(200)
  })
})
