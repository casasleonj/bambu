/**
 * Integration test for POST /api/pedidos/venta-libre BLOQUEAR_PRECIOS_REPARTIDOR rule.
 *
 * Verifies:
 *   - REPARTIDOR with BLOQUEAR=true cannot set precioManual (403)
 *   - REPARTIDOR with BLOQUEAR=false can set precioManual
 *   - ADMIN/ASISTENTE with BLOQUEAR=true CAN set precioManual (rule is repartidor-only)
 *   - REPARTIDOR without precioManual passes the check (other rules still apply)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ───────────────────────────────────────────────────────────────

const mockAuth = vi.fn()
const mockGetConfigBool = vi.fn()
const mockUploadBase64Foto = vi.fn()
const mockIsBase64Image = vi.fn()
const mockPrismaPedido = {
  findUnique: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn().mockResolvedValue([]),
}
const mockPrismaEmbarque = {
  findUnique: vi.fn(),
}
const mockPrismaCliente = {
  findUnique: vi.fn(),
}
const mockPrismaTrabajador = {
  findFirst: vi.fn(),
}
const mockPrismaPago = {
  create: vi.fn(),
}
const mockPrismaFactura = {
  create: vi.fn(),
}
const mockPrismaConfig = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
}
const mockResolverPreciosPedido = vi.fn()
const mockGetNextNumero = vi.fn()
const mockLogAudit = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: async () => {
    const session = await mockAuth()
    return session ?? new Response('No autorizado', { status: 401 })
  },
  requireRole: async (_roles: unknown, existing: any) => {
    if (existing instanceof Response) return existing
    return existing
  },
}))
vi.mock('@/lib/config', () => ({
  getConfigBool: (...args: unknown[]) => mockGetConfigBool(...args),
}))
vi.mock('@/lib/storage', () => ({
  uploadBase64Foto: (...args: unknown[]) => mockUploadBase64Foto(...args),
  isBase64Image: (...args: unknown[]) => mockIsBase64Image(...args),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pedido: mockPrismaPedido,
    embarque: mockPrismaEmbarque,
    cliente: mockPrismaCliente,
    trabajador: mockPrismaTrabajador,
    pago: mockPrismaPago,
    factura: mockPrismaFactura,
    config: mockPrismaConfig,
  },
}))
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))
vi.mock('@/lib/api-response', () => ({
  apiSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  apiError: (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/locks', () => ({
  LOCK_IDS: { PEDIDO: 1, FACTURA_NUM: 6, FACTURA: 2, EMBARQUE: 3, ABONO: 4, COMPRA: 5, CIERRE: 7, NC: 8 },
  withAdvisoryLock: async (_key: string, fn: any) => {
    // Build a tx object that has all the prisma models the route touches.
    // The route uses tx.embarque, tx.cliente, tx.pedido, tx.pago, tx.factura, tx.config, tx.trabajador.
    const tx = {
      embarque: mockPrismaEmbarque,
      cliente: mockPrismaCliente,
      pedido: {
        ...mockPrismaPedido,
        findFirst: vi.fn().mockResolvedValue([]), // for "pedidos pendientes" lookup
      },
      pago: mockPrismaPago,
      factura: mockPrismaFactura,
      config: mockPrismaConfig,
      trabajador: mockPrismaTrabajador,
      // FIX: pg_advisory_xact_lock via $queryRaw (called for FACTURA_NUM
      // during the tx). Without this mock, the route throws because
      // tx.$queryRaw is undefined.
      $queryRaw: vi.fn().mockResolvedValue([]),
    }
    return fn(tx)
  },
}))
vi.mock('@/lib/sequence', () => ({
  getNextNumero: (...args: unknown[]) => mockGetNextNumero(...args),
}))
vi.mock('@/lib/pricing', () => ({
  resolverPreciosPedido: (...args: unknown[]) => mockResolverPreciosPedido(...args),
}))
vi.mock('@/lib/pedido-utils', () => ({
  calcularEstadoPago: (total: number, pagado: number) =>
    pagado >= total ? 'PAGADO' : 'PENDIENTE',
  puedeFiar: () => true,
  puedeCrearPedido: () => null,
  resolverLimiteFiados: (_cliente: { limitePedidosFiados?: number | null }, _configValor?: string | null) =>
    _cliente.limitePedidosFiados ?? 2,
}))

// ── Import under test ──────────────────────────────────────────────────

const { POST } = await import('@/app/api/pedidos/venta-libre/route')

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/pedidos/venta-libre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  clienteId: 'c1',
  items: [
    { producto: 'PACA_AGUA', cantidad: 2 },
  ],
  pagos: [{ metodo: 'EFECTIVO', monto: 13000 }],
  embarqueId: 'emb1',
  fotoEntrega: 'data:image/jpeg;base64,/9j/test',
  gpsLat: 4.65,
  gpsLng: -74.05,
  offlineId: 'off-1',
}

const bodyWithPrecioManual = {
  ...validBody,
  items: [
    { producto: 'PACA_AGUA', cantidad: 2, precioManual: 9000 },
  ],
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('POST /api/pedidos/venta-libre — BLOQUEAR_PRECIOS_REPARTIDOR', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetConfigBool.mockReset()
    mockUploadBase64Foto.mockReset()
    mockIsBase64Image.mockReset()
    mockPrismaEmbarque.findUnique.mockReset()
    mockPrismaCliente.findUnique.mockReset()
    mockPrismaPedido.findUnique.mockReset()
    mockPrismaPedido.create.mockReset()
    mockPrismaTrabajador.findFirst.mockReset()
    mockPrismaPago.create.mockReset()
    mockPrismaFactura.create.mockReset()
    mockPrismaConfig.findUnique.mockReset()
    mockPrismaConfig.findMany.mockReset()
    mockResolverPreciosPedido.mockReset()
    mockGetNextNumero.mockReset()

    // Defaults
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'REPARTIDOR' } })
    mockGetConfigBool.mockResolvedValue(false) // default off
    mockIsBase64Image.mockReturnValue(false)
    mockPrismaEmbarque.findUnique.mockResolvedValue({
      id: 'emb1',
      estado: 'ABIERTO',
      trabajadorId: 't1',
      trabajador: { user: { id: 'u1' } },
    })
    mockPrismaCliente.findUnique.mockResolvedValue({
      id: 'c1',
      nombre: 'Test',
      limitePedidosFiados: 3,
    })
    mockPrismaPedido.findUnique.mockResolvedValue(null) // no dedup match
    mockPrismaTrabajador.findFirst.mockResolvedValue({ id: 't1' })
    mockResolverPreciosPedido.mockResolvedValue([
      { codigo: 'PACA_AGUA', precio: 6500, subtotal: 13000 },
    ])
    mockGetNextNumero.mockResolvedValue(100)
    mockPrismaConfig.findMany.mockResolvedValue([
      { clave: 'empresa_nombre', valor: 'Agua Bambú' },
      { clave: 'empresa_nit', valor: '49008664' },
      { clave: 'empresa_direccion', valor: 'Vereda Centro' },
      { clave: 'empresa_telefono', valor: '300 000 0000' },
      { clave: 'empresa_email', valor: 'contacto@aguabambu.com' },
    ])
    mockPrismaPedido.create.mockResolvedValue({ id: 'p-new', numero: 100 })
  })

  describe('when BLOQUEAR is ON', () => {
    beforeEach(() => mockGetConfigBool.mockResolvedValue(true))

    it('rejects REPARTIDOR with precioManual (403)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-repar', role: 'REPARTIDOR' } })
      const res = await POST(makeRequest(bodyWithPrecioManual))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.error).toMatch(/no pueden modificar precios/i)
      expect(mockPrismaPedido.create).not.toHaveBeenCalled()
    })

    it('allows REPARTIDOR without precioManual', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-repar', role: 'REPARTIDOR' } })
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(201)
    })

    it('allows ADMIN with precioManual (rule is repartidor-only)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-admin', role: 'ADMIN' } })
      mockPrismaEmbarque.findUnique.mockResolvedValue({
        id: 'emb1',
        estado: 'ABIERTO',
        trabajadorId: 't1',
        trabajador: { user: null },
      })
      const res = await POST(makeRequest(bodyWithPrecioManual))
      expect(res.status).toBe(201)
    })

    it('allows ASISTENTE with precioManual (rule is repartidor-only)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-asis', role: 'ASISTENTE' } })
      mockPrismaEmbarque.findUnique.mockResolvedValue({
        id: 'emb1',
        estado: 'ABIERTO',
        trabajadorId: 't1',
        trabajador: { user: null },
      })
      const res = await POST(makeRequest(bodyWithPrecioManual))
      expect(res.status).toBe(201)
    })
  })

  describe('when BLOQUEAR is OFF', () => {
    beforeEach(() => mockGetConfigBool.mockResolvedValue(false))

    it('allows REPARTIDOR with precioManual', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-repar', role: 'REPARTIDOR' } })
      const res = await POST(makeRequest(bodyWithPrecioManual))
      expect(res.status).toBe(201)
    })
  })

  describe('F3 fix: any precioManual override is rejected for REPARTIDOR', () => {
    beforeEach(() => mockGetConfigBool.mockResolvedValue(true))

    it('rejects REPARTIDOR with precioManual=0 (was bypassed by `> 0` check)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u-repar', role: 'REPARTIDOR' } })
      // Schema currently rejects 0 with a validation error, but the route's
      // own defense (now `!== undefined`) would also catch it if the schema
      // were relaxed. We assert the schema rejection here.
      const body = {
        ...validBody,
        items: [{ producto: 'PACA_AGUA', cantidad: 2, precioManual: 0 }],
      }
      const res = await POST(makeRequest(body))
      // Schema rejects precioManual=0 with 400 before reaching the route check.
      // This is the right behavior (defense in depth).
      expect(res.status).toBe(400)
    })
  })

  describe('FIX: factura incluye montoPagado y snapshot de empresa', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'u-asis', role: 'ASISTENTE' } })
      mockPrismaEmbarque.findUnique.mockResolvedValue({
        id: 'emb1',
        estado: 'ABIERTO',
        trabajadorId: 't1',
        trabajador: { user: null },
      })
    })

    it('crea factura PAGADA con montoPagado=total y datos de empresa', async () => {
      const res = await POST(makeRequest(validBody))
      expect(res.status).toBe(201)
      expect(mockPrismaFactura.create).toHaveBeenCalledTimes(1)
      const facturaData = mockPrismaFactura.create.mock.calls[0][0].data
      expect(facturaData.montoPagado).toBe(13000)
      expect(facturaData.saldo).toBe(0)
      expect(facturaData.estado).toBe('PAGADA')
      expect(facturaData.empresaNit).toBe('49008664')
      expect(facturaData.empresaNombre).toBe('Agua Bambú')
    })


  })
})
