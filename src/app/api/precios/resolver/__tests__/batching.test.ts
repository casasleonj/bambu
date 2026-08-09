// @tests POST /api/precios/resolver — batching de queries en modo batch.
//
// Antes: el modo batch resolvía cada item con resolverPrecio(), que hace
// hasta 2 queries por producto (precioVolumen.findFirst + producto.findUnique)
// EN UN LOOP SECUENCIAL (await dentro de un for). Un pedido de 5 productos
// disparaba hasta 10 round-trips secuenciales a Postgres por cada resolución
// — y la UI resuelve en cada cambio de cantidad, cambio de cliente y cambio
// de canal. Ahora reutiliza cargarTiersYProductos()/resolverPreciosConContexto()
// (el mismo patrón ya usado por resolverPreciosPedido para la creación real
// del pedido): exactamente 2 queries (findMany) sin importar cuántos items
// traiga el carrito.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    precioVolumen: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    producto: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([
        { codigo: 'PACA_AGUA', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 5000 },
        { codigo: 'PACA_HIELO', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 8000 },
        { codigo: 'BOTELLON', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 4000 },
      ]),
    },
    negocio: { findUnique: vi.fn() },
    cliente: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/auth-check', () => ({
  requirePermission: vi.fn(async () => ({ user: { id: 'u1', role: 'ADMIN' } })),
}))

import { prisma } from '@/lib/prisma'
const { POST } = await import('@/app/api/precios/resolver/route')

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/precios/resolver', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
  vi.mocked(prisma.producto.findMany).mockResolvedValue([
    { codigo: 'PACA_AGUA', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 5000 },
    { codigo: 'PACA_HIELO', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 8000 },
    { codigo: 'BOTELLON', aplicaDomicilio: false, sobreCostoDomicilio: 0, precioBase: 4000 },
  ] as any)
})

describe('POST /api/precios/resolver — modo batch usa exactamente 2 queries', () => {
  it('resuelve 3 productos con 1 sola query de tiers y 1 sola de productos (no 1 por item)', async () => {
    const res = await POST(makeRequest({
      items: [
        { codigo: 'PACA_AGUA', cantidad: 5 },
        { codigo: 'PACA_HIELO', cantidad: 3 },
        { codigo: 'BOTELLON', cantidad: 1 },
      ],
      canal: 'PUNTO',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.precios.PACA_AGUA.precio).toBe(5000)
    expect(body.precios.PACA_HIELO.precio).toBe(8000)
    expect(body.precios.BOTELLON.precio).toBe(4000)

    expect(prisma.precioVolumen.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.producto.findMany).toHaveBeenCalledTimes(1)
    // La ruta vieja (resolverPrecio) usaba findFirst/findUnique por item.
    // Confirma que el batch mode ya no pasa por ahí.
    expect(prisma.precioVolumen.findFirst).not.toHaveBeenCalled()
    expect(prisma.producto.findUnique).not.toHaveBeenCalled()
  })

  it('el número de queries NO crece con la cantidad de items (5 productos = mismas 2 queries que 1)', async () => {
    const res = await POST(makeRequest({
      items: [
        { codigo: 'PACA_AGUA', cantidad: 1 },
        { codigo: 'PACA_HIELO', cantidad: 1 },
        { codigo: 'BOTELLON', cantidad: 1 },
        { codigo: 'BOLSA_AGUA', cantidad: 1 },
        { codigo: 'BOLSA_HIELO', cantidad: 1 },
      ],
      canal: 'DOMICILIO',
    }))

    expect(res.status).toBe(200)
    expect(prisma.precioVolumen.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.producto.findMany).toHaveBeenCalledTimes(1)
  })
})
