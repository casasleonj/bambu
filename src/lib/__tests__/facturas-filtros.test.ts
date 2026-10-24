// @tests lib/facturas-filtros — filtros, orden y totales de la pantalla de Facturas
import { describe, it, expect } from 'vitest'
import {
  parseFacturasFiltros,
  parseFacturasOrden,
  buildFacturasBaseWhere,
  buildFacturasListWhere,
  buildFacturasOrderBy,
  estadosIncluidos,
  resumirGrupos,
  type GrupoEstado,
} from '../facturas-filtros'

const qs = (s: string) => new URLSearchParams(s)

describe('parseFacturasFiltros', () => {
  it('sin parámetros: sin filtros y anuladas fuera', () => {
    expect(parseFacturasFiltros(qs(''))).toEqual({
      desde: null,
      hasta: null,
      clienteId: null,
      facturaId: null,
      estado: null,
      pendiente: false,
      incluirAnuladas: false,
    })
  })

  it('lee cliente, factura, fechas, estado y el interruptor de anuladas', () => {
    const f = parseFacturasFiltros(
      qs('clienteId=c1&facturaId=f1&desde=2026-01-01&hasta=2026-03-01&estado=parcial&incluirAnuladas=true&pendiente=true'),
    )
    expect(f).toMatchObject({
      clienteId: 'c1',
      facturaId: 'f1',
      desde: '2026-01-01',
      hasta: '2026-03-01',
      estado: 'PARCIAL',
      incluirAnuladas: true,
      pendiente: true,
    })
  })

  it('ignora un estado desconocido en vez de pasarlo a Prisma', () => {
    expect(parseFacturasFiltros(qs('estado=HACKEADA')).estado).toBeNull()
  })

  it('all=true conserva su significado: sin filtro de fechas', () => {
    const f = parseFacturasFiltros(qs('all=true&desde=2026-01-01&hasta=2026-02-01'))
    expect(f.desde).toBeNull()
    expect(f.hasta).toBeNull()
  })
})

describe('parseFacturasOrden', () => {
  it('por defecto: fecha descendente', () => {
    expect(parseFacturasOrden(qs(''))).toEqual({ sort: 'fecha', dir: 'desc' })
  })

  it('acepta solo campos de la lista blanca', () => {
    expect(parseFacturasOrden(qs('sort=saldo&dir=asc'))).toEqual({ sort: 'saldo', dir: 'asc' })
    expect(parseFacturasOrden(qs('sort=passwordHash&dir=asc')).sort).toBe('fecha')
  })
})

describe('where de la lista y de los totales', () => {
  const base = parseFacturasFiltros(qs('clienteId=c1&desde=2026-01-01&hasta=2026-01-31'))

  it('el filtro base filtra por cliente y fechas pero no por estado', () => {
    const where = buildFacturasBaseWhere(base)
    expect(where.clienteId).toBe('c1')
    expect(where.fecha).toBeDefined()
    expect(where).not.toHaveProperty('estado')
  })

  it('la lista excluye anuladas salvo que el interruptor esté activo', () => {
    expect(buildFacturasListWhere(base).estado).toEqual({ not: 'ANULADA' })
    expect(buildFacturasListWhere({ ...base, incluirAnuladas: true })).not.toHaveProperty('estado')
  })

  it('pedir Anuladas explícitamente las muestra aunque el interruptor esté apagado', () => {
    expect(buildFacturasListWhere({ ...base, estado: 'ANULADA' }).estado).toBe('ANULADA')
    expect(estadosIncluidos({ estado: 'ANULADA', incluirAnuladas: false })).toEqual(['ANULADA'])
  })

  it('una factura concreta se filtra por id', () => {
    expect(buildFacturasBaseWhere({ ...base, facturaId: 'f9' }).id).toBe('f9')
  })
})

describe('buildFacturasOrderBy', () => {
  it('siempre desempata por id o fecha para que la paginación sea estable', () => {
    for (const sort of ['fecha', 'cliente', 'total', 'saldo', 'estado'] as const) {
      const orden = buildFacturasOrderBy(sort, 'asc')
      expect(orden.length).toBeGreaterThan(1)
    }
    expect(buildFacturasOrderBy('fecha', 'asc')).toEqual([{ fecha: 'asc' }, { id: 'asc' }])
  })

  it('ordena por cliente usando nombre y apellido', () => {
    expect(buildFacturasOrderBy('cliente', 'asc').slice(0, 2)).toEqual([
      { cliente: { nombre: 'asc' } },
      { cliente: { apellido: 'asc' } },
    ])
  })
})

describe('resumirGrupos', () => {
  const grupos: GrupoEstado[] = [
    { estado: 'PAGADA', count: 5, total: 150000, montoPagado: 150000, saldo: 0 },
    { estado: 'PARCIAL', count: 5, total: 150000, montoPagado: 75000, saldo: 75000 },
    { estado: 'EMITIDA', count: 10, total: 300000, montoPagado: 0, saldo: 300000 },
    { estado: 'ANULADA', count: 4, total: 200000, montoPagado: 60000, saldo: 0 },
  ]

  it('excluye anuladas de los totales por defecto', () => {
    const r = resumirGrupos(grupos, { estado: null, incluirAnuladas: false })
    expect(r.totales).toEqual({
      totalFacturado: 600000,
      totalCobrado: 225000,
      totalPorCobrar: 375000,
      count: 20,
      pagadas: 5,
      pendientes: 15,
    })
    expect(r.totalLista).toBe(20)
  })

  it('con el interruptor, las anuladas entran en totales y lista', () => {
    const r = resumirGrupos(grupos, { estado: null, incluirAnuladas: true })
    expect(r.totales.totalFacturado).toBe(800000)
    expect(r.totales.totalCobrado).toBe(285000)
    expect(r.totales.count).toBe(24)
    expect(r.totalLista).toBe(24)
  })

  it('la pestaña de estado cambia la lista pero no los totales', () => {
    const todas = resumirGrupos(grupos, { estado: null, incluirAnuladas: false })
    const parcial = resumirGrupos(grupos, { estado: 'PARCIAL', incluirAnuladas: false })
    expect(parcial.totales).toEqual(todas.totales)
    expect(parcial.totalLista).toBe(5)
  })

  it('entrega los conteos por estado, incluida Parcial y Anuladas aunque estén ocultas', () => {
    const r = resumirGrupos(grupos, { estado: null, incluirAnuladas: false })
    expect(r.conteosPorEstado).toEqual({ TODAS: 20, EMITIDA: 10, PARCIAL: 5, PAGADA: 5, ANULADA: 4 })
  })

  it('sin facturas todo es cero', () => {
    const r = resumirGrupos([], { estado: null, incluirAnuladas: false })
    expect(r.totales.totalFacturado).toBe(0)
    expect(r.totalLista).toBe(0)
  })
})
