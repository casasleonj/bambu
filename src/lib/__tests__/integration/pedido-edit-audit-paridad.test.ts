// @tests F10a-preflight, gate F10-5 (docs/pedidos/fase-composicion-c4-edit-plan.md):
// la auditoría de una EDICIÓN hecha desde el PedidosWorkspace (Hub V2) es la
// misma que la de una edición hecha desde el form legacy (PedidoFormUnified),
// contra Postgres real y a través del handler REAL de PUT /api/pedidos/[id].
//
// Por qué alcanza con probar el servidor: ambas UIs entregan su
// `PedidoUnifiedData` al MISMO `handlePedidoSubmit` de pedidos-client, que en
// edición envía únicamente { items, obs, actualizarCliente, direccionEntrega,
// barrioEntrega } (pedidos-client/index.tsx, rama `isEdit`). `putBodyFrom`
// replica esa proyección; si el handler cambia, este test debe actualizarse.
// Los datos de ejemplo reproducen lo que cada UI emite para la MISMA edición
// (legacy: pedido-form-unified/index.tsx; workspace: pedido-workspace/index.tsx
// y su test "modo edición").
//
// Hallazgo registrado (no se corrige acá): el registro de auditoría de un PUT
// es genérico — `datos: { numero, estado }` — sin antes/después. El
// `PedidoAuditDiff` que nombra el gate no existe en el código; la paridad se
// cumple igual porque la fila no depende de la UI de origen.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser, createTestCliente } from './setup'
import { PUT } from '@/app/api/pedidos/[id]/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import type { PedidoUnifiedData } from '@/components/pedido-form-unified'

/** Proyección de `handlePedidoSubmit` (rama isEdit) → body del PUT. */
function putBodyFrom(data: PedidoUnifiedData) {
  return {
    items: data.items,
    obs: data.obs,
    actualizarCliente: data.actualizarCliente,
    direccionEntrega: data.direccionEntrega,
    barrioEntrega: data.barrioEntrega,
  }
}

async function putPedido(pedidoId: string, data: PedidoUnifiedData) {
  const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(putBodyFrom(data)),
  })
  return PUT(req, { params: Promise.resolve({ id: pedidoId }) })
}

async function auditRows(pedidoId: string) {
  return testPrisma.historial.findMany({
    where: { entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE' },
    orderBy: { fecha: 'asc' },
  })
}

describe('F10-5 — auditoría de edición: workspace == legacy (PUT real, Postgres real)', () => {
  let adminId: string
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await createTestCliente('AuditParidad')).id
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  afterAll(async () => { await disconnect() })

  async function crearPedidoBase(tag: string) {
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
      pagos: [],
      createdById: adminId, createdByRole: 'ADMIN',
      offlineId: `audit-paridad-${tag}-${Date.now()}`,
    })
    return pedido
  }

  it('misma edición → misma fila de Historial (1 por edición), sin importar la UI de origen', async () => {
    const pedidoLegacy = await crearPedidoBase('legacy')
    const pedidoWorkspace = await crearPedidoBase('workspace')

    // Legacy (PedidoFormUnified): arrastra campos de creación (pagos,
    // preciosManuales, origen...) que handlePedidoSubmit descarta en edición.
    const legacyData: PedidoUnifiedData = {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 6, precioManual: undefined }],
      preciosManuales: {}, pagos: [], obs: 'urgente',
      isEdit: true, pedidoId: pedidoLegacy.id,
    } as PedidoUnifiedData
    // Workspace (PedidosWorkspace, modo edición): misma edición.
    const workspaceData: PedidoUnifiedData = {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 6, precioManual: undefined }],
      preciosManuales: {}, pagos: [], obs: 'urgente', entregado: undefined,
      isEdit: true, pedidoId: pedidoWorkspace.id,
    } as PedidoUnifiedData

    expect(putBodyFrom(legacyData)).toEqual(putBodyFrom(workspaceData))

    const resLegacy = await putPedido(pedidoLegacy.id, legacyData)
    const resWorkspace = await putPedido(pedidoWorkspace.id, workspaceData)
    expect(resLegacy.status).toBe(200)
    expect(resWorkspace.status).toBe(200)

    const [rowsLegacy, rowsWorkspace] = await Promise.all([auditRows(pedidoLegacy.id), auditRows(pedidoWorkspace.id)])
    expect(rowsLegacy).toHaveLength(1)
    expect(rowsWorkspace).toHaveLength(1)

    const normalizar = (row: (typeof rowsLegacy)[number], numero: number) => {
      const datos = JSON.parse(row.datos) as Record<string, unknown>
      expect(datos.numero).toBe(numero)
      return { entidad: row.entidad, accion: row.accion, usuarioId: row.usuarioId, datos: { ...datos, numero: '<numero>' } }
    }
    const legacyNorm = normalizar(rowsLegacy[0], pedidoLegacy.numero)
    const workspaceNorm = normalizar(rowsWorkspace[0], pedidoWorkspace.numero)

    expect(workspaceNorm).toEqual(legacyNorm)
    // Forma real hoy (hallazgo, ver cabecera): genérica, sin antes/después.
    expect(legacyNorm).toEqual({
      entidad: 'Pedido', accion: 'UPDATE', usuarioId: adminId,
      datos: { numero: '<numero>', estado: 'PENDIENTE' },
    })

    // Y el efecto sobre el pedido es idéntico.
    const [a, b] = await Promise.all([
      testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoLegacy.id }, include: { items: true } }),
      testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoWorkspace.id }, include: { items: true } }),
    ])
    const efecto = (p: typeof a) => ({
      total: Number(p.total), saldo: Number(p.saldo), obs: p.obs, estadoEntrega: p.estadoEntrega,
      items: p.items.map((i) => ({ producto: i.producto, cantPedido: i.cantPedido, subtotal: Number(i.subtotal) })),
    })
    expect(efecto(b)).toEqual(efecto(a))
    expect(efecto(a).items).toEqual([{ producto: 'PACA_AGUA', cantPedido: 6, subtotal: expect.any(Number) }])
  })
})
