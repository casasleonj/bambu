// @tests F5 (mapa de brechas de Ejecución física) — bug de producción
// confirmado: la route leía REQUIERE_GPS_PARA_ENTREGA /
// PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION (SCREAMING_SNAKE_CASE), claves
// que `prisma/seed.ts` y el cliente (`pedidos-client/index.tsx`) NUNCA
// escriben/leen — ambos usan `requerirGpsParaEntrega`/
// `permitirEntregaSinGpsConJustificacion` (camelCase). `getConfigBool`
// compara la clave exacta, sin normalizar — el servidor nunca hacía cumplir
// el GPS obligatorio pese a que la UI lo mostraba como tal.
//
// El test anterior (`route.test.ts`) solo hacía `readFileSync` + regex sobre
// el código fuente — no habría detectado este bug porque solo verificaba
// que el string aparecía en el archivo, no que la config correcta se leyera
// en runtime. Este archivo SÍ ejecuta el handler real con `getConfigBool`
// mockeado, para probar el comportamiento, no el texto.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
const mockGetConfigBool = vi.fn()
const mockEntregarExecute = vi.fn()
const mockPrismaCliente = { findUnique: vi.fn() }
const mockPrismaEmbarque = { findUnique: vi.fn() }
const mockPrismaTrabajador = { findFirst: vi.fn() }
const mockPrismaGpsTrack = { create: vi.fn() }

vi.mock('@/lib/auth-check', () => ({
  requireAuth: async () => mockAuth(),
  requireOwnership: async () => true,
}))
vi.mock('@/lib/config', () => ({
  getConfigBool: (...args: unknown[]) => mockGetConfigBool(...args),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: mockPrismaCliente,
    embarque: mockPrismaEmbarque,
    trabajador: mockPrismaTrabajador,
    gpsTrack: mockPrismaGpsTrack,
  },
}))
vi.mock('@/modules/pedidos', () => ({
  entregarPedidoUseCase: { execute: (...args: unknown[]) => mockEntregarExecute(...args) },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: () => Promise.resolve() }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn() }))
vi.mock('@/lib/storage', () => ({
  uploadBase64Foto: vi.fn(),
  isBase64Image: () => false,
}))
vi.mock('@/lib/pedido-utils', () => ({ shouldFireCulminado: () => false }))
vi.mock('@/lib/api-response', () => ({
  apiSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), { status, headers: { 'content-type': 'application/json' } }),
  apiError: (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), { status, headers: { 'content-type': 'application/json' } }),
}))

const { POST } = await import('../route')

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/pedidos/p1/entrega', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const paramsP1 = { params: Promise.resolve({ id: 'p1' }) }

const bodySinGpsNiJustificacion = {
  itemsEntregados: [{ producto: 'BOTELLON', cantidad: 1 }],
}

describe('POST /api/pedidos/[id]/entrega — requerirGpsParaEntrega (F5, bug de config confirmado)', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetConfigBool.mockReset()
    mockEntregarExecute.mockReset()
    mockPrismaCliente.findUnique.mockReset()
    mockPrismaEmbarque.findUnique.mockReset()
    mockPrismaTrabajador.findFirst.mockReset()
    mockPrismaGpsTrack.create.mockReset()

    mockAuth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } })
    mockEntregarExecute.mockResolvedValue({
      deduped: false,
      pedido: { id: 'p1', numero: 1, estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', embarqueId: null, clienteId: 'c1' },
    })
    mockPrismaCliente.findUnique.mockResolvedValue({ nombre: 'Cliente Test' })
  })

  it('la route llama getConfigBool con las CLAVES REALES (camelCase, mismas que seed.ts y el cliente)', async () => {
    mockGetConfigBool.mockResolvedValue(false)
    await POST(makeRequest(bodySinGpsNiJustificacion), paramsP1)

    const clavesLeidas = mockGetConfigBool.mock.calls.map((c) => c[0])
    expect(clavesLeidas).toContain('requerirGpsParaEntrega')
    expect(clavesLeidas).toContain('permitirEntregaSinGpsConJustificacion')
    // Las claves rotas (SCREAMING_SNAKE_CASE) NO deben volver a aparecer —
    // si reaparecen, el bug de mismatch volvió.
    expect(clavesLeidas).not.toContain('REQUIERE_GPS_PARA_ENTREGA')
    expect(clavesLeidas).not.toContain('PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION')
  })

  it('requerirGpsParaEntrega=true + sin coords ni justificación → 400 (el servidor SÍ lo hace cumplir)', async () => {
    mockGetConfigBool.mockImplementation(async (clave: string) => clave === 'requerirGpsParaEntrega')

    const res = await POST(makeRequest(bodySinGpsNiJustificacion), paramsP1)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/ubicación GPS es obligatoria/)
    expect(mockEntregarExecute).not.toHaveBeenCalled()
  })

  it('requerirGpsParaEntrega=true + coords presentes → pasa el gate y llega al use case', async () => {
    mockGetConfigBool.mockImplementation(async (clave: string) => clave === 'requerirGpsParaEntrega')

    const res = await POST(
      makeRequest({ ...bodySinGpsNiJustificacion, gpsLat: 4.65, gpsLng: -74.05 }),
      paramsP1,
    )

    expect(res.status).toBe(200)
    expect(mockEntregarExecute).toHaveBeenCalledTimes(1)
  })

  it('requerirGpsParaEntrega=true + permitirEntregaSinGpsConJustificacion=true + justificación no vacía → pasa el gate', async () => {
    mockGetConfigBool.mockImplementation(
      async (clave: string) => clave === 'requerirGpsParaEntrega' || clave === 'permitirEntregaSinGpsConJustificacion',
    )

    const res = await POST(
      makeRequest({ ...bodySinGpsNiJustificacion, gpsJustificacion: 'GPS del dispositivo apagado' }),
      paramsP1,
    )

    expect(res.status).toBe(200)
    expect(mockEntregarExecute).toHaveBeenCalledTimes(1)
  })

  it('requerirGpsParaEntrega=false (default cuando no hay config sembrada) → no bloquea aunque falten coords/justificación', async () => {
    mockGetConfigBool.mockResolvedValue(false)

    const res = await POST(makeRequest(bodySinGpsNiJustificacion), paramsP1)

    expect(res.status).toBe(200)
    expect(mockEntregarExecute).toHaveBeenCalledTimes(1)
  })
})
