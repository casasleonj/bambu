// @tests GET /api/facturas/buscar — búsqueda de clientes y facturas sobre toda la base
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindMany = vi.fn()
const facturaFindMany = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findMany: (...a: unknown[]) => clienteFindMany(...a) },
    factura: { findMany: (...a: unknown[]) => facturaFindMany(...a) },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const get = async (q: string) => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/facturas/buscar?q=${encodeURIComponent(q)}`))
}

describe('GET /api/facturas/buscar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    clienteFindMany.mockResolvedValue([])
    facturaFindMany.mockResolvedValue([])
  })

  it('la búsqueda es de ADMIN, CONTADOR y ASISTENTE; quien no tiene el rol recibe 403', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('sandra')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR', 'ASISTENTE'])
  })

  it('con menos de 2 caracteres no consulta la base', async () => {
    const body = await (await get('s')).json()
    expect(body).toMatchObject({ clientes: [], facturas: [] })
    expect(clienteFindMany).not.toHaveBeenCalled()
  })

  it('busca clientes con facturas, palabra por palabra, en toda la base', async () => {
    clienteFindMany.mockResolvedValue([
      { id: 'relleno', nombre: 'pedro', apellido: 'lopez', telefono: '3000000000', direccion: null, negocios: [] },
      { id: 'c1', nombre: 'Sandra', apellido: 'León', telefono: '573163887163', direccion: null, negocios: [] },
    ])
    const body = await (await get('sandra leon')).json()
    expect(body.clientes).toHaveLength(1)
    expect(body.clientes[0]).toMatchObject({ id: 'c1', nombre: 'Sandra', apellido: 'León' })
    // Se busca primero en todo el universo autorizado (no en los primeros 8
    // resultados), luego se ordena y pagina. Nunca exponer otros registros.
    const consulta = clienteFindMany.mock.calls[0][0]
    expect(consulta.where).toEqual({ facturas: { some: {} } })
    expect(consulta.take).toBeUndefined()
    const filtroFactura = facturaFindMany.mock.calls[0][0].where
    expect(filtroFactura.OR[1]).toEqual({ clienteId: { in: ['c1'] } })
  })

  it('incluye negocios y erratas cortas, sin autocompletar identificadores numéricos', async () => {
    clienteFindMany.mockResolvedValue([
      { id: 'c1', nombre: 'Camilo', apellido: null, telefono: '3000000000', direccion: null,
        negocios: [{ nombre: 'Punti Frío' }] },
      { id: 'c2', nombre: 'Punto', apellido: 'Frío', telefono: '3000000001', direccion: null,
        negocios: [] },
    ])
    const body = await (await get('punt frio')).json()
    expect(body.clientes.map((c: { id: string }) => c.id)).toContain('c1')
    const filtroFactura = facturaFindMany.mock.calls[0][0].where
    expect(filtroFactura.OR[1].clienteId.in).toContain('c1')
    // El número que escriben las personas permanece literal.
    expect(filtroFactura.OR[0].numero.contains).toBe('punt frio')
  })

  it('devuelve las facturas con el nombre completo del cliente', async () => {
    facturaFindMany.mockResolvedValue([
      { id: 'f1', numero: 'FAC-00001', fecha: new Date('2026-10-24T12:00:00Z'), cliente: { nombre: 'sandra', apellido: 'leon' } },
    ])
    const body = await (await get('FAC-0')).json()
    expect(body.facturas[0]).toMatchObject({ id: 'f1', numero: 'FAC-00001', clienteNombre: 'sandra leon' })
  })
})
