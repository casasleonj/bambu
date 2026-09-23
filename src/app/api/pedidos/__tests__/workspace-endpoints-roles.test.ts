// @tests F10a-preflight, gate F10-4 (docs/pedidos/fase-composicion-c4-edit-plan.md):
// los tres endpoints que usa el PedidosWorkspace (Hub V2) — POST /api/pedidos/preview,
// POST /api/pedidos (crear) y PUT /api/pedidos/[id] (editar) — rechazan con 403 a
// REPARTIDOR y CONTADOR y dejan pasar a ADMIN y ASISTENTE.
//
// Comportamental (ejecuta el handler con el `requireRole` REAL de auth-check),
// complementa los guardrails estáticos de `preview/__tests__/route.test.ts` y
// `[id]/__tests__/route.test.ts`, que solo inspeccionan el fuente. Solo se mockea
// la sesión (`auth()`) y los use cases — ningún rol denegado debe llegar a ellos.
//
// Los roles permitidos se prueban con un body inválido: la respuesta 400 (Zod)
// demuestra que el request superó el gate de rol sin depender de la DB.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
const mockCrear = vi.fn()
const mockActualizar = vi.fn()
const mockPreview = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/modules/pedidos', () => ({
  crearPedidoUseCase: { execute: (...a: unknown[]) => mockCrear(...a) },
  listarPedidosUseCase: { execute: vi.fn() },
  actualizarPedidoUseCase: { execute: (...a: unknown[]) => mockActualizar(...a) },
  anularPedidoUseCase: { execute: vi.fn() },
  cancelarPedidoUseCase: { execute: vi.fn() },
  previewPedidoUseCase: { execute: (...a: unknown[]) => mockPreview(...a) },
}))

import { POST as crearPOST } from '../route'
import { PUT as editarPUT } from '../[id]/route'
import { POST as previewPOST } from '../preview/route'

const PEDIDO_ID = 'pedido-test-1'

function session(role: string) {
  return { user: { id: `user-${role}`, role }, expires: '2099-01-01T00:00:00.000Z' }
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Bodies válidos (lo que el workspace envía): si un rol denegado los atravesara,
// llegarían al use case — por eso se asserta que el mock NO fue llamado.
const validCreate = { clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', origen: 'VENTA_RAPIDA', items: [{ producto: 'PACA_AGUA', cantidad: 1 }] }
const validPreview = { clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', origen: 'VENTA_RAPIDA', items: [{ producto: 'PACA_AGUA', cantidad: 1 }] }
const validUpdate = { items: [{ producto: 'PACA_AGUA', cantidad: 2 }] }

const endpoints = [
  {
    name: 'POST /api/pedidos/preview',
    call: (body: unknown) => previewPOST(jsonRequest('http://localhost/api/pedidos/preview', 'POST', body)),
    valid: validPreview,
    useCase: mockPreview,
  },
  {
    name: 'POST /api/pedidos',
    call: (body: unknown) => crearPOST(jsonRequest('http://localhost/api/pedidos', 'POST', body)),
    valid: validCreate,
    useCase: mockCrear,
  },
  {
    name: 'PUT /api/pedidos/[id]',
    call: (body: unknown) =>
      editarPUT(jsonRequest(`http://localhost/api/pedidos/${PEDIDO_ID}`, 'PUT', body), { params: Promise.resolve({ id: PEDIDO_ID }) }),
    valid: validUpdate,
    useCase: mockActualizar,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each(endpoints)('F10-4 — $name', ({ call, valid, useCase }) => {
  it.each(['REPARTIDOR', 'CONTADOR'])('%s → 403 y no llega al use case', async (role) => {
    mockAuth.mockResolvedValue(session(role))
    const res = await call(valid)
    expect(res.status).toBe(403)
    expect(useCase).not.toHaveBeenCalled()
  })

  it.each(['ADMIN', 'ASISTENTE'])('%s supera el gate de rol (body inválido → 400, no 403)', async (role) => {
    mockAuth.mockResolvedValue(session(role))
    const res = await call({ items: 'no-es-un-array' })
    expect(res.status).toBe(400)
    expect(useCase).not.toHaveBeenCalled()
  })

  it('sin sesión → 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await call(valid)
    expect(res.status).toBe(401)
    expect(useCase).not.toHaveBeenCalled()
  })
})
