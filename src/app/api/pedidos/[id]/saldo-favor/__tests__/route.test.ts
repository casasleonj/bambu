import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  requireAuth: vi.fn(), requireRole: vi.fn(),
  pedidoFind: vi.fn(), movFind: vi.fn(), proyectar: vi.fn(), neto: vi.fn(),
}))

vi.mock('@/lib/auth-check', () => ({ requireAuth: m.requireAuth, requireRole: m.requireRole }))
vi.mock('@/lib/prisma', () => ({ prisma: { pedido: { findUnique: m.pedidoFind }, pedidoSaldoFavorMovimiento: { findMany: m.movFind } } }))
vi.mock('@/modules/pedidos/application/services/saldo-favor-excedente.service', () => ({
  proyectarReversionCredito: m.proyectar, creditoNetoDelPedido: m.neto,
}))

import { GET } from '../route'

const llamar = () => GET(new NextRequest('http://localhost/api/pedidos/p1/saldo-favor'), { params: Promise.resolve({ id: 'p1' }) })
const pedido = (estadoEntrega: string) => ({
  id: 'p1', numero: 1234, clienteId: 'c1', estadoEntrega,
  cliente: { nombre: 'Rosa', apellido: 'Gómez' }, negocio: { nombre: 'Tienda La Esperanza' },
})
const mov = (tipo: string, monto: number) => ({
  id: tipo + monto, tipo, monto, origenTipo: 'X', motivo: 'm', createdAt: new Date('2026-11-01T10:00:00Z'), autor: { nombre: 'Ana', apellido: null },
})

describe('GET /api/pedidos/[id]/saldo-favor (#577)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requireAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    m.requireRole.mockResolvedValue(undefined)
    m.movFind.mockResolvedValue([])
    m.proyectar.mockResolvedValue({ salioDelPedido: 5000, seResta: 2000, yaUsado: 3000, saldoActual: 2000, saldoDespues: 0 })
    m.neto.mockResolvedValue(3000)
  })

  it('exige sesión y rol antes de leer nada', async () => {
    m.requireAuth.mockResolvedValue(new Response('no', { status: 401 }))
    expect((await llamar()).status).toBe(401)
    m.requireAuth.mockResolvedValue({ user: { id: 'u1' } })
    m.requireRole.mockResolvedValue(new Response('no', { status: 403 }))
    expect((await llamar()).status).toBe(403)
    expect(m.pedidoFind).not.toHaveBeenCalled()
  })

  it('404 si el pedido no existe', async () => {
    m.pedidoFind.mockResolvedValue(null)
    expect((await llamar()).status).toBe(404)
  })

  it('pedido abierto: devuelve la proyección y la tienda, sin resultado', async () => {
    m.pedidoFind.mockResolvedValue(pedido('ENTREGADO'))
    m.movFind.mockResolvedValue([mov('ACREDITACION', 5000)])
    const body = await (await llamar()).json()
    const d = body.data ?? body
    expect(d.proyeccion).toEqual({ salioDelPedido: 5000, seResta: 2000, yaUsado: 3000, saldoActual: 2000, saldoDespues: 0 })
    expect(d.resultado).toBeNull()
    expect(d.cliente).toEqual({ titular: 'Rosa Gómez', tienda: 'Tienda La Esperanza' })
    expect(d.movimientos).toHaveLength(1)
    expect(d.movimientos[0]).toMatchObject({ tipo: 'ACREDITACION', monto: 5000, autor: 'Ana' })
  })

  it('pedido anulado: sin proyección y con el resultado (restado y ya usado)', async () => {
    m.pedidoFind.mockResolvedValue(pedido('ANULADO'))
    m.movFind.mockResolvedValue([mov('ACREDITACION', 5000), mov('REVERSION_ANULACION', 2000)])
    const body = await (await llamar()).json()
    const d = body.data ?? body
    expect(d.proyeccion).toBeNull()
    expect(m.proyectar).not.toHaveBeenCalled()
    expect(d.resultado).toEqual({ revertido: 2000, yaUsado: 3000 })
  })

  it('pedido anulado que nunca tuvo crédito: sin resultado', async () => {
    m.pedidoFind.mockResolvedValue(pedido('CANCELADO'))
    const body = await (await llamar()).json()
    expect((body.data ?? body).resultado).toBeNull()
  })
})
