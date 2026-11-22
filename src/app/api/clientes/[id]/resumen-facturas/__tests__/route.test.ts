// @tests GET /api/clientes/[id]/resumen-facturas — sin límite de meses, historial completo o por rango
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindUnique = vi.fn()
const facturaFindMany = vi.fn()
const facturaGroupBy = vi.fn()
const facturaAggregate = vi.fn()
const configFindMany = vi.fn()
const leerExigibles = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
    factura: {
      findMany: (...a: unknown[]) => facturaFindMany(...a),
      groupBy: (...a: unknown[]) => facturaGroupBy(...a),
      aggregate: (...a: unknown[]) => facturaAggregate(...a),
    },
    config: { findMany: (...a: unknown[]) => configFindMany(...a) },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/entregas-exigibles-db', () => ({ leerExigibles: (...a: unknown[]) => leerExigibles(...a) }))

const get = async (query: string) => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/clientes/c1/resumen-facturas${query}`), {
    params: Promise.resolve({ id: 'c1' }),
  })
}

describe('GET /api/clientes/[id]/resumen-facturas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    clienteFindUnique.mockResolvedValue({ id: 'c1', nombre: 'sandra', apellido: 'leon', telefono: '1', direccion: null, barrio: null })
    facturaFindMany.mockResolvedValue([])
    facturaGroupBy.mockResolvedValue([])
    facturaAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } })
    leerExigibles.mockResolvedValue(new Map())
    configFindMany.mockResolvedValue([])
  })

  it('ADMIN, CONTADOR y ASISTENTE, igual que GET /api/facturas (#556, #758); el resto recibe 403', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR', 'ASISTENTE'])
    expect(facturaFindMany).not.toHaveBeenCalled()
  })

  it('acepta un rango de más de 3 meses', async () => {
    const res = await get('?desde=2026-01-01&hasta=2026-10-24')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periodo).toEqual({ desde: '2026-01-01', hasta: '2026-10-24' })
    expect(facturaFindMany.mock.calls[0][0].where.fecha).toBeDefined()
  })

  it('sin fechas devuelve el historial completo, sin filtro de fecha', async () => {
    const res = await get('')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periodo).toEqual({ desde: null, hasta: null })
    expect(facturaFindMany.mock.calls[0][0].where).not.toHaveProperty('fecha')
    // Sin `estado` = Todas = solo vigentes: las anuladas no se mezclan (#977).
    expect(facturaFindMany.mock.calls[0][0].where.estado).toEqual({ in: ['EMITIDA', 'PARCIAL', 'PAGADA'] })
  })

  it('un solo extremo también filtra', async () => {
    await get('?desde=2026-06-01')
    expect(facturaFindMany.mock.calls[0][0].where.fecha).toHaveProperty('gte')
    expect(facturaFindMany.mock.calls[0][0].where.fecha).not.toHaveProperty('lte')
  })

  it('rechaza fechas mal formadas o invertidas', async () => {
    expect((await get('?desde=ayer')).status).toBe(400)
    expect((await get('?desde=2026-10-24&hasta=2026-01-01')).status).toBe(400)
  })

  describe('filtro de estado (#758, #977)', () => {
    it.each([
      ['POR_COBRAR', ['EMITIDA', 'PARCIAL']],
      ['EMITIDA', ['EMITIDA']],
      ['PARCIAL', ['PARCIAL']],
      ['PAGADA', ['PAGADA']],
      ['ANULADA', ['ANULADA']],
      ['TODAS', ['EMITIDA', 'PARCIAL', 'PAGADA']],
    ] as const)('estado=%s trae solo %j', async (estado, esperados) => {
      const res = await get(`?estado=${estado}`)
      expect(res.status).toBe(200)
      expect(facturaFindMany.mock.calls[0][0].where.estado).toEqual({ in: esperados })
      expect((await res.json()).filtro.estado).toBe(estado)
    })

    it('rechaza un estado inválido', async () => {
      expect((await get('?estado=BORRADOR')).status).toBe(400)
      expect(facturaFindMany).not.toHaveBeenCalled()
    })

    it('los conteos de las pestañas ignoran el estado elegido', async () => {
      facturaGroupBy.mockResolvedValue([{ estado: 'PAGADA', _count: { _all: 4 } }])
      await get('?estado=PARCIAL')
      expect(facturaGroupBy.mock.calls[0][0].where).not.toHaveProperty('estado')
      expect(facturaGroupBy.mock.calls[0][0].where.clienteId).toBe('c1')
    })

    it('cada factura trae lo ENTREGADO por producto, lo pendiente y los otros ajustes (#867, #977)', async () => {
      facturaFindMany.mockResolvedValue([
        {
          id: 'a', numero: 'FAC-1', fecha: new Date('2026-11-02T15:00:00Z'), total: 65_000, montoPagado: 0, saldo: 65_000, estado: 'EMITIDA',
          pedido: {
            id: 'p1', numero: 7, fecha: new Date(), saldo: 65_000, totalPagado: 0,
            items: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 6, precio: 6_000, subtotal: 60_000 }],
          },
          abonos: [],
        },
      ])
      leerExigibles.mockResolvedValue(new Map([['p1', 36_000]]))
      const body = await (await get('')).json()
      expect(body.facturas[0].items).toEqual([
        { producto: 'PACA_AGUA', etiqueta: 'Paca Agua', cantidad: 6, cantPedida: 10, precio: 6_000, subtotal: 36_000 },
      ])
      expect(body.facturas[0].pendientes).toEqual([{ producto: 'PACA_AGUA', etiqueta: 'Paca Agua', cantidad: 4 }])
      expect(body.facturas[0].pendienteMonto).toBe(24_000)
      expect(body.facturas[0].otrosAjustes).toBe(5_000)
      const select = facturaFindMany.mock.calls[0][0].include.pedido.select
      expect(select.items.select).toMatchObject({ producto: true, cantPedido: true, subtotal: true })
    })

    it('lo que se debe es la deuda EXIGIBLE (lo entregado menos lo pagado), no el saldo contractual (#656)', async () => {
      const base = { fecha: new Date('2026-11-02T15:00:00Z'), abonos: [] }
      facturaFindMany.mockResolvedValue([
        { ...base, id: 'a', numero: 'FAC-1', total: 12_000, montoPagado: 0, saldo: 12_000, estado: 'EMITIDA',
          pedido: { id: 'p1', numero: 1, fecha: new Date(), saldo: 12_000, totalPagado: 0, items: [] } },
        { ...base, id: 'b', numero: 'FAC-2', total: 10_000, montoPagado: 0, saldo: 10_000, estado: 'EMITIDA',
          pedido: { id: 'p2', numero: 2, fecha: new Date(), saldo: 10_000, totalPagado: 0, items: [] } },
      ])
      // p1: se entregó 2/3 (cobra $8.000); p2: nada entregado todavía (no se debe nada aún).
      leerExigibles.mockResolvedValue(new Map([['p1', 8_000], ['p2', 0]]))
      const body = await (await get('?estado=POR_COBRAR')).json()
      expect(leerExigibles).toHaveBeenCalledWith(expect.anything(), { id: { in: ['p1', 'p2'] } })
      expect(body.facturas.map((f: { debe: number }) => f.debe)).toEqual([8_000, 0])
      expect(body.totales.saldo).toBe(8_000)
      expect(body.encabezado).toMatchObject({ etiqueta: 'Saldo que se debe', monto: 8_000 })
    })

    it('los totales suman solo vigentes y las anuladas se reportan aparte, fuera de la lista', async () => {
      const base = { fecha: new Date('2026-11-02T15:00:00Z'), pedido: null, abonos: [] }
      facturaFindMany.mockResolvedValue([
        { ...base, id: 'a', numero: 'FAC-1', total: 120_000, montoPagado: 120_000, saldo: 0, estado: 'PAGADA' },
        { ...base, id: 'b', numero: 'FAC-2', total: 85_000, montoPagado: 40_000, saldo: 45_000, estado: 'PARCIAL' },
      ])
      facturaAggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { total: 50_000 } })
      const body = await (await get('')).json()
      expect(body.totales).toEqual({ total: 205_000, totalPagado: 160_000, saldo: 45_000, count: 2 })
      expect(body.anuladas).toEqual({ count: 1, totalHistorico: 50_000 })
      expect(body.facturas.map((x: { estado: string }) => x.estado)).toEqual(['PAGADA', 'PARCIAL'])
      expect(facturaAggregate.mock.calls[0][0].where.estado).toBe('ANULADA')
    })
  })
})
