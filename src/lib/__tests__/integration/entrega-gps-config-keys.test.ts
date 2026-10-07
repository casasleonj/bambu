// @tests Fase R1 (hallazgo histórico: PR #259) — la ruta POST
// /api/pedidos/[id]/entrega validaba GPS obligatorio leyendo
// REQUIERE_GPS_PARA_ENTREGA / PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION
// (UPPER_SNAKE), claves que nunca existen en Config: seed y UI usan
// camelCase (requerirGpsParaEntrega / permitirEntregaSinGpsConJustificacion).
// getConfigBool hace match exacto de clave → el gate server-side quedaba
// siempre en `false` sin importar el valor configurado.
//
// Esta suite verifica el comportamiento real contra Postgres: la ruta debe
// leer las claves canónicas camelCase, y el resultado del guard GPS no debe
// depender de las claves legacy UPPER_SNAKE (ausentes o con cualquier valor).

import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'

// getConfigBool → getConfig envuelve la query en unstable_cache, que exige
// un incrementalCache de request Next inexistente en este entorno de test.
// Mismo mock que entrega-suficiencia-integridad.test.ts.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))

const authUser: { id: string; role: string } = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireOwnership: vi.fn(async () => true),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

// Aislar el guard GPS (que vive en la route, antes del use case) del resto
// del flujo de entrega — no se refactoriza ni se revalida el use case acá,
// eso ya está cubierto por otras suites (F-N7, entrega-suficiencia-integridad).
const mockPedidoResult = {
  pedido: {
    id: 'pedido-x',
    numero: 1,
    clienteId: 'cliente-x',
    estadoEntrega: 'ENTREGADO' as const,
    estadoPago: 'PAGADO' as const,
    embarqueId: null,
  },
  deduped: false,
}
const executeMock = vi.fn(async () => mockPedidoResult)
vi.mock('@/modules/pedidos', () => ({ entregarPedidoUseCase: { execute: executeMock } }))

import { testPrisma, resetAndSeed, disconnect } from './setup'

const CAMEL_REQUIERE = 'requerirGpsParaEntrega'
const CAMEL_PERMITIR = 'permitirEntregaSinGpsConJustificacion'
const LEGACY_REQUIERE = 'REQUIERE_GPS_PARA_ENTREGA'
const LEGACY_PERMITIR = 'PERMITIR_ENTREGA_SIN_GPS_CON_JUSTIFICACION'

async function setConfig(clave: string, valor: string) {
  await testPrisma.config.upsert({
    where: { clave },
    create: { clave, valor },
    update: { valor },
  })
}

async function clearConfig(...claves: string[]) {
  await testPrisma.config.deleteMany({ where: { clave: { in: claves } } })
}

function postReq(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

describe('R1 — GPS entrega: la route lee las claves canónicas camelCase', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterEach(async () => {
    executeMock.mockClear()
    await clearConfig(CAMEL_REQUIERE, CAMEL_PERMITIR, LEGACY_REQUIERE, LEGACY_PERMITIR)
  })

  afterAll(async () => {
    await disconnect()
  })

  it('requerirGpsParaEntrega=true + sin GPS + sin justificación → 400, no llama al use case', async () => {
    await setConfig(CAMEL_REQUIERE, 'true')
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(postReq({}), { params: Promise.resolve({ id: 'pedido-x' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toMatch(/ubicación GPS es obligatoria/)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('requerirGpsParaEntrega=true + GPS válido → continúa (llama al use case)', async () => {
    await setConfig(CAMEL_REQUIERE, 'true')
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(
      postReq({ gpsLat: 4.65, gpsLng: -74.05 }),
      { params: Promise.resolve({ id: 'pedido-x' }) },
    )
    expect(res.status).toBe(200)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('requerirGpsParaEntrega=true + permitirEntregaSinGpsConJustificacion=true + justificación → continúa', async () => {
    await setConfig(CAMEL_REQUIERE, 'true')
    await setConfig(CAMEL_PERMITIR, 'true')
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(
      postReq({ gpsJustificacion: 'Cliente no autoriza GPS, se entrega con confirmación telefónica' }),
      { params: Promise.resolve({ id: 'pedido-x' }) },
    )
    expect(res.status).toBe(200)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('requerirGpsParaEntrega=true + permitirEntregaSinGpsConJustificacion=false + solo justificación → 400', async () => {
    await setConfig(CAMEL_REQUIERE, 'true')
    await setConfig(CAMEL_PERMITIR, 'false')
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(
      postReq({ gpsJustificacion: 'Sin GPS' }),
      { params: Promise.resolve({ id: 'pedido-x' }) },
    )
    expect(res.status).toBe(400)
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('requerirGpsParaEntrega=false (o ausente) → no bloquea por ausencia de GPS', async () => {
    await setConfig(CAMEL_REQUIERE, 'false')
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(postReq({}), { params: Promise.resolve({ id: 'pedido-x' }) })
    expect(res.status).toBe(200)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('BUG histórico: las claves legacy UPPER_SNAKE en true NO activan el gate (la route no las consulta)', async () => {
    // Antes del fix, la route leía estas claves (siempre ausentes en Config
    // real) y por eso el gate quedaba en `false` sin importar la config real.
    // Este test congela la dirección opuesta: aunque alguien deje residuos
    // legacy en `true`, la route no debe mirarlos — solo las camelCase.
    await setConfig(LEGACY_REQUIERE, 'true')
    await setConfig(LEGACY_PERMITIR, 'true')
    // camelCase explícitamente ausente/false → el gate real debe estar OFF.
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(postReq({}), { params: Promise.resolve({ id: 'pedido-x' }) })
    expect(res.status).toBe(200)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('requerirGpsParaEntrega ausente en Config → default false, no bloquea', async () => {
    const { POST } = await import('@/app/api/pedidos/[id]/entrega/route')
    const res = await POST(postReq({}), { params: Promise.resolve({ id: 'pedido-x' }) })
    expect(res.status).toBe(200)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })
})
