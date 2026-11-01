// @tests api/trabajadores/[id]/deudas-pendientes y /deudas-resumen — #566: quién puede ver qué deuda
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'u1', role: 'ADMIN' } } as { user: { id: string; role: string } } | Response,
  findFirst: vi.fn(),
  deudaFindMany: vi.fn(),
  descuentoFindMany: vi.fn(),
}))

vi.mock('@/lib/auth-check', async () => {
  const { apiError } = await import('@/lib/api-response')
  return {
    requireAuth: vi.fn(async () => mocks.session),
    requireRole: vi.fn(async (roles: string[] | string, s: { user: { role: string } }) => {
      const permitidos = Array.isArray(roles) ? roles : [roles]
      return permitidos.includes(s.user.role) ? s : apiError('No tiene permisos para esta acción', 403)
    }),
  }
})
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trabajador: { findFirst: mocks.findFirst },
    deudaTrabajador: { findMany: mocks.deudaFindMany },
    descuentoRepartidor: { findMany: mocks.descuentoFindMany },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET as detalle } from '../[id]/deudas-pendientes/route'
import { GET as resumen } from '../deudas-resumen/route'
import { NextRequest } from 'next/server'

const req = () => new NextRequest('http://localhost/api/trabajadores/t1/deudas-pendientes')
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const deuda = (trabajadorId: string, pendiente: number) => ({
  id: `d-${trabajadorId}`, trabajadorId, tipo: 'PRESTAMO', montoOriginal: pendiente, montoPendiente: pendiente,
  descripcion: 'Préstamo', fecha: new Date('2026-10-01T15:00:00Z'), pedido: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = { user: { id: 'u1', role: 'ADMIN' } }
  mocks.deudaFindMany.mockResolvedValue([])
  mocks.descuentoFindMany.mockResolvedValue([])
  mocks.findFirst.mockResolvedValue(null)
})

describe('GET /api/trabajadores/[id]/deudas-pendientes', () => {
  it.each(['ADMIN', 'ASISTENTE', 'CONTADOR'])('%s ve la deuda de cualquier trabajador', async (role) => {
    mocks.session = { user: { id: 'u1', role } }
    mocks.deudaFindMany.mockResolvedValue([deuda('t1', 60000)])
    const res = await detalle(req(), ctx('t1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalPendiente).toBe(60000)
    expect(body.cantidad).toBe(1)
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it('un repartidor ve su propia deuda', async () => {
    mocks.session = { user: { id: 'u-rep', role: 'REPARTIDOR' } }
    mocks.findFirst.mockResolvedValue({ id: 't1' })
    mocks.deudaFindMany.mockResolvedValue([deuda('t1', 1000)])
    const res = await detalle(req(), ctx('t1'))
    expect(res.status).toBe(200)
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { userId: 'u-rep', id: 't1' }, select: { id: true } })
  })

  it.each(['REPARTIDOR', 'SELLADOR'])('un %s NO ve la deuda de otro trabajador', async (role) => {
    mocks.session = { user: { id: 'u-x', role } }
    mocks.findFirst.mockResolvedValue(null)
    const res = await detalle(req(), ctx('t-ajeno'))
    expect(res.status).toBe(403)
    expect(mocks.deudaFindMany).not.toHaveBeenCalled()
  })

  it('sin sesión responde lo que decida requireAuth', async () => {
    const { apiError } = await import('@/lib/api-response')
    mocks.session = apiError('No autorizado', 401) as unknown as Response
    const res = await detalle(req(), ctx('t1'))
    expect(res.status).toBe(401)
  })

  it('sin deuda devuelve lista vacía y total cero', async () => {
    const res = await detalle(req(), ctx('t1'))
    expect(await res.json()).toMatchObject({ items: [], totalPendiente: 0, cantidad: 0 })
  })
})

describe('GET /api/trabajadores/deudas-resumen', () => {
  it('suma por trabajador y omite a quien no debe', async () => {
    mocks.deudaFindMany.mockResolvedValue([deuda('t1', 60000), deuda('t3', 10000)])
    const res = await resumen()
    expect(res.status).toBe(200)
    const { resumen: r } = await res.json()
    expect(r).toEqual({ t1: { totalPendiente: 60000, cantidad: 1 }, t3: { totalPendiente: 10000, cantidad: 1 } })
  })

  it.each(['REPARTIDOR', 'SELLADOR'])('un %s no puede pedir el resumen de todos', async (role) => {
    mocks.session = { user: { id: 'u-x', role } }
    const res = await resumen()
    expect(res.status).toBe(403)
    expect(mocks.deudaFindMany).not.toHaveBeenCalled()
  })

  it('ASISTENTE y CONTADOR sí lo ven', async () => {
    for (const role of ['ASISTENTE', 'CONTADOR']) {
      mocks.session = { user: { id: 'u1', role } }
      expect((await resumen()).status).toBe(200)
    }
  })
})
