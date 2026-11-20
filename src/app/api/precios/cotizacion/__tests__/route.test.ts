import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  findCliente: vi.fn(),
  findTelefono: vi.fn(),
  findNegocio: vi.fn(),
  loadPricing: vi.fn(),
}))

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } }),
  requireRole: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: mocks.findCliente, findFirst: mocks.findTelefono },
    negocio: { findUnique: mocks.findNegocio },
  },
}))
vi.mock('@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter', () => ({
  PrismaPricingAdapter: class {
    loadPricingContext = mocks.loadPricing
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { POST } from '../route'

function request(body: object) {
  return new NextRequest('http://localhost/api/precios/cotizacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.findCliente.mockResolvedValue({ id: 'c1' })
  mocks.findTelefono.mockResolvedValue(null)
  mocks.findNegocio.mockResolvedValue({ clienteId: 'c1' })
  mocks.loadPricing.mockResolvedValue({
    clienteOverrides: {
      PUNTO: { PACA_AGUA: 2400 },
      DOMICILIO: { PACA_AGUA: 2700 },
    },
    tiersByCode: { PACA_AGUA: [{ cantMin: 4, cantMax: 9, precio: 2500 }] },
    productosByCode: { PACA_AGUA: { precioBase: 2800, aplicaDomicilio: true, sobreCostoDomicilio: 200 } },
  })
})

describe('#925 · POST /api/precios/cotizacion', () => {
  it('entrega precios SOLO del comprador y canal, con versión y no-store', async () => {
    const res = await POST(request({ clienteId: 'c1', negocioId: 'n1', canal: 'PUNTO' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const data = await res.json()
    expect(data.pricing.clienteOverrides).toEqual({ PACA_AGUA: 2400 })
    expect(JSON.stringify(data)).not.toContain('2700')
    expect(data.version).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.loadPricing).toHaveBeenCalledWith('c1', 'n1', expect.any(Array))
  })

  it('rechaza un negocio ajeno antes de consultar las reglas privadas', async () => {
    mocks.findNegocio.mockResolvedValue({ clienteId: 'otro-cliente' })
    const res = await POST(request({ clienteId: 'c1', negocioId: 'n1', canal: 'PUNTO' }))
    expect(res.status).toBe(422)
    expect(mocks.loadPricing).not.toHaveBeenCalled()
  })

  it('resuelve cliente nuevo por teléfono si ya existía, sin filtrar terceros', async () => {
    mocks.findTelefono.mockResolvedValue({ id: 'c1' })
    const res = await POST(request({ clienteNuevoTelefono: '3001112222', canal: 'DOMICILIO' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.clienteId).toBe('c1')
    expect(body.pricing.clienteOverrides.PACA_AGUA).toBe(2700)
    expect(mocks.loadPricing).toHaveBeenCalledWith('c1', null, expect.any(Array))
  })
})
